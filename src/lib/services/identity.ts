import { z } from 'zod';

/**
 * Identidad gráfica editable (site_settings.brand): tres colores de marca y tres logos.
 * Los colores alimentan las variables CSS --brand, --brand-dark y --accent (globals.css).
 * Toda paleta se valida por contraste según cómo la usa el sitio.
 */

export type BrandColors = { brand: string; dark: string; accent: string };
export type Identity = { colors: BrandColors; logo: string | null; logoDark: string | null; favicon: string | null };
/** Ids de media para los logos; null = archivo por defecto de public/brand. */
export const DEFAULT_COLORS: BrandColors = { brand: '#FDC913', dark: '#282626', accent: '#0082AA' };
export const DEFAULT_IDENTITY: Identity = { colors: DEFAULT_COLORS, logo: null, logoDark: null, favicon: null };
export const DEFAULT_LOGOS = { logo: '/brand/logo.png', logoDark: '/brand/logo-dark.png', favicon: '/brand/favicon.png' };

const HEX = /^#[0-9a-f]{6}$/i;
export const normalizeHex = (v: string) => {
  const s = v.trim().replace(/^#?/, '#');
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  return (short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : s).toUpperCase();
};
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** «#FDC913» → «253 201 19» (formato de las variables CSS con <alpha-value> de Tailwind). */
export const hexToTriplet = (hex: string) => rgb(hex).join(' ');

/** Relación de contraste WCAG 2.x entre dos colores. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export type PaletteCheck = { label: string; fg: string; bg: string; ratio: number; min: number; recommended: number; level: 'ok' | 'aviso' | 'error' };
/** Combinaciones que el sitio usa de verdad, con su mínimo (bloquea) y su recomendado (avisa). */
export function checkPalette(c: BrandColors): PaletteCheck[] {
  const pairs: [string, string, string, number, number][] = [
    ['Texto oscuro sobre botones de acción', c.dark, c.brand, 4.5, 4.5],
    ['Color de acción sobre fondo oscuro (títulos, enlaces)', c.brand, c.dark, 4.5, 4.5],
    ['Texto blanco sobre fondo oscuro', '#FFFFFF', c.dark, 4.5, 4.5],
    ['Enlaces y antetítulos sobre blanco', c.accent, '#FFFFFF', 3, 4.5],
  ];
  return pairs.map(([label, fg, bg, min, recommended]) => {
    const ratio = Math.round(contrast(fg, bg) * 100) / 100;
    return { label, fg, bg, ratio, min, recommended, level: ratio < min ? 'error' : ratio < recommended ? 'aviso' : 'ok' };
  });
}

/** Variables CSS que el layout inyecta en <html>. */
export const cssVars = (c: BrandColors): Record<string, string> => ({ '--brand': hexToTriplet(c.brand), '--brand-dark': hexToTriplet(c.dark), '--accent': hexToTriplet(c.accent) });

const Colors = z.object({ brand: z.string().regex(HEX), dark: z.string().regex(HEX), accent: z.string().regex(HEX) });
const MediaId = z.string().min(1).max(64).nullable().catch(null);

/**
 * Lee lo guardado en site_settings.brand con tolerancia: campo inválido → valor por defecto.
 * Acepta también el formato inicial del seed ({ yellow, graphite, blue, logo: '/brand/…' }).
 */
export function normalizeIdentity(raw: unknown): Identity {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const src = v.colors && typeof v.colors === 'object' ? v.colors : { brand: v.yellow, dark: v.graphite, accent: v.blue };
  const pick = (k: keyof BrandColors) => (typeof src[k] === 'string' && HEX.test(normalizeHex(src[k])) ? normalizeHex(src[k]) : DEFAULT_COLORS[k]);
  const colors = { brand: pick('brand'), dark: pick('dark'), accent: pick('accent') };
  // Una paleta guardada que no cumple los mínimos (p. ej. editada a mano en la base) no se aplica.
  const safe = checkPalette(colors).every((x) => x.level !== 'error') ? colors : DEFAULT_COLORS;
  const id = (x: unknown) => (typeof x === 'string' && !x.startsWith('/') ? MediaId.parse(x) : null); // rutas /brand/… = por defecto
  return { colors: safe, logo: id(v.logo), logoDark: id(v.logoDark), favicon: id(v.favicon) };
}

/** FormData del panel → colores validados (los logos los resuelve la acción, que sube los archivos). */
export function parseColorsForm(fd: FormData): { data: BrandColors } | { error: string } {
  const get = (k: string) => normalizeHex(String(fd.get(k) ?? ''));
  const raw = { brand: get('brand'), dark: get('dark'), accent: get('accent') };
  const p = Colors.safeParse(raw);
  if (!p.success) return { error: 'Usa colores en formato hexadecimal, por ejemplo #FDC913.' };
  const bad = checkPalette(p.data).find((x) => x.level === 'error');
  if (bad) return { error: `Contraste insuficiente en «${bad.label}»: ${bad.ratio.toFixed(2)}:1 (mínimo ${bad.min}:1). Elige un tono más claro u oscuro.` };
  return { data: p.data };
}
