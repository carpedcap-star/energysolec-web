import { z } from 'zod';
import type { PriceTier, ProductInput, TierPrice } from '../data/types';
import { PRODUCT_CATEGORIES } from '../data/seed';

/**
 * Lógica pura del catálogo (sin acceso a datos): validación del formulario del panel,
 * precio vigente por nivel y verificación del contenido real de los archivos subidos.
 */

const r2 = (x: number) => Math.round(x * 100) / 100;

export const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Precio vigente para un nivel: la promoción solo aplica si es menor al precio y no ha vencido. */
export function effectivePrice(prices: TierPrice[], tier: PriceTier = 'final', now = Date.now()): { price: number; promo_price: number | null } | null {
  const t = prices.find((x) => x.tier === tier);
  if (!t) return null;
  const promoActive = t.promo_price != null && t.promo_price < t.price && (!t.promo_until || Date.parse(t.promo_until) > now);
  return { price: t.price, promo_price: promoActive ? t.promo_price : null };
}

/** La promoción vale hasta el final del día indicado, hora de Ecuador continental (UTC−5, sin horario de verano). */
export const promoUntilFromDate = (d: string) => `${d}T23:59:59-05:00`;
/** Inversa para el campo <input type="date">: fecha calendario en Ecuador. */
export const promoUntilToDate = (ts: string | null) => (ts ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date(ts)) : '');

// ---------------------------------------------------------------- Formulario
const CATEGORY_SLUGS = PRODUCT_CATEGORIES.map(([s]) => s) as [string, ...string[]];
const TIERS: PriceTier[] = ['final', 'instalador', 'distribuidor'];
const money = (label: string) => z.number({ message: `${label}: ingresa un número` }).min(0, `${label}: no puede ser negativo`).max(10_000_000).transform(r2);

const TierSchema = z.object({
  tier: z.enum(['final', 'instalador', 'distribuidor']),
  price: money('Precio'),
  promo_price: money('Precio promocional').nullable(),
  promo_until: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de fin de promoción no válida').nullable(),
}).superRefine((t, ctx) => {
  if (t.promo_price != null && t.promo_price >= t.price) ctx.addIssue({ code: 'custom', path: ['promo_price'], message: `El precio promocional (${t.tier}) debe ser menor al precio normal.` });
  if (t.promo_until && t.promo_price == null) ctx.addIssue({ code: 'custom', path: ['promo_until'], message: `Indicaste fin de promoción (${t.tier}) sin precio promocional.` });
});

export const ProductSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  sku: z.string().trim().toUpperCase().min(2, 'El SKU es obligatorio').max(40).regex(/^[A-Z0-9][A-Z0-9._-]*$/, 'SKU: solo letras, números, punto, guion y guion bajo'),
  slug: z.string().trim().min(2, 'El identificador de la URL es obligatorio').max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'URL: solo minúsculas, números y guiones'),
  name: z.string().trim().min(3, 'El nombre es obligatorio').max(160),
  brand_id: z.string().min(1).max(64).nullable(),
  model: z.string().trim().max(80).nullable(),
  category: z.enum(CATEGORY_SLUGS, { message: 'Elige una categoría' }),
  summary: z.string().trim().max(600).nullable(),
  specs: z.record(z.string().trim().min(1).max(60), z.union([z.string().max(200), z.number()])),
  warranty: z.string().trim().max(160).nullable(),
  certifications: z.array(z.string().trim().min(1).max(60)).max(20),
  vat_rate: z.number({ message: 'IVA: ingresa un número' }).min(0, 'IVA no válido').max(0.5, 'IVA no válido'),
  stock: z.number({ message: 'Stock: ingresa un número entero' }).int('El stock debe ser un número entero').min(0, 'El stock no puede ser negativo').max(10_000_000),
  availability: z.enum(['disponible', 'bajo_pedido', 'agotado', 'consultar']),
  installable: z.boolean(),
  is_placeholder: z.boolean(),
  published: z.boolean(),
  prices: z.array(TierSchema),
  image_ids: z.array(z.string().min(1).max(64)).max(12, 'Máximo 12 imágenes por producto'),
  datasheet_id: z.string().min(1).max(64).nullable(),
}).superRefine((p, ctx) => {
  // Regla de negocio: un producto de ejemplo nunca se publica (la BD lo impone con no_placeholder_published).
  if (p.published && p.is_placeholder) ctx.addIssue({ code: 'custom', path: ['published'], message: 'Un producto de ejemplo no puede publicarse. Desmarca "Producto de ejemplo" solo cuando los datos sean reales y verificados.' });
  if (!p.prices.some((t) => t.tier === 'final')) ctx.addIssue({ code: 'custom', path: ['prices'], message: 'El precio para cliente final es obligatorio (usa 0 para "precio a consultar").' });
  if (p.availability === 'disponible' && p.stock <= 0) ctx.addIssue({ code: 'custom', path: ['availability'], message: 'Para marcarlo como "Disponible" registra un stock mayor a 0, o elige "Bajo pedido" o "Consultar".' });
  if (p.availability === 'agotado' && p.stock > 0) ctx.addIssue({ code: 'custom', path: ['availability'], message: 'Hay stock registrado: no puede estar "Agotado".' });
  const keys = Object.keys(p.specs);
  if (keys.length > 40) ctx.addIssue({ code: 'custom', path: ['specs'], message: 'Máximo 40 especificaciones' });
});

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
/** Acepta coma decimal ("1.234,50" o "1234,5") además de punto. */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/\s|\$/g, '');
  if (!s) return null;
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}

/** Convierte el FormData del panel en un ProductInput validado. Devuelve el primer error legible. */
export function parseProductForm(fd: FormData): { data: ProductInput } | { error: string } {
  const name = str(fd, 'name');
  const specs: Record<string, string | number> = {};
  const keys = fd.getAll('spec_key').map(String), vals = fd.getAll('spec_value').map(String);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i].trim(), v = (vals[i] ?? '').trim();
    if (!k && !v) continue;
    if (!k || !v) return { error: `Especificación incompleta en la fila ${i + 1}: indica nombre y valor.` };
    if (k in specs) return { error: `La especificación "${k}" está repetida.` };
    specs[k] = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  const prices: TierPrice[] = [];
  for (const tier of TIERS) {
    const price = parseNumber(str(fd, `price_${tier}`));
    const promo = parseNumber(str(fd, `promo_${tier}`));
    const untilRaw = optStr(fd, `promo_until_${tier}`);
    if (untilRaw && !/^\d{4}-\d{2}-\d{2}$/.test(untilRaw)) return { error: `Fecha de fin de promoción (${tier}) no válida.` };
    const until = untilRaw ? promoUntilFromDate(untilRaw) : null;
    if (price == null) {
      if (promo != null || until) return { error: `Indica el precio ${tier} antes de su promoción.` };
      continue; // nivel no ofrecido
    }
    prices.push({ tier, price, promo_price: promo, promo_until: until });
  }
  const vat = parseNumber(str(fd, 'vat_pct'));
  const stock = parseNumber(str(fd, 'stock'));
  const raw = {
    id: optStr(fd, 'id') ?? undefined,
    sku: str(fd, 'sku'),
    slug: str(fd, 'slug') || slugify(name),
    name,
    brand_id: optStr(fd, 'brand_id'),
    model: optStr(fd, 'model'),
    category: str(fd, 'category'),
    summary: optStr(fd, 'summary'),
    specs,
    warranty: optStr(fd, 'warranty'),
    certifications: [...new Set(str(fd, 'certifications').split(/[,\n]/).map((s) => s.trim()).filter(Boolean))],
    vat_rate: vat == null ? NaN : r2(vat) / 100,
    stock: stock ?? 0,
    availability: str(fd, 'availability'),
    installable: fd.get('installable') === 'on',
    is_placeholder: fd.get('is_placeholder') === 'on',
    published: fd.get('published') === 'on',
    prices,
    image_ids: fd.getAll('image_ids').map(String).filter(Boolean),
    datasheet_id: optStr(fd, 'datasheet_id'),
  };
  const p = ProductSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
  return { data: p.data as ProductInput };
}

// ---------------------------------------------------------------- Archivos
export const UPLOAD_LIMITS = { image: 5 * 1024 * 1024, document: 15 * 1024 * 1024, maxImages: 12 };
export type SniffedType = { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'; ext: string; kind: 'image' | 'document' };

/** Identifica el tipo por su firma binaria, no por el nombre ni el Content-Type declarado. SVG no se acepta (puede contener scripts). */
export function sniffFile(b: Uint8Array): SniffedType | null {
  const at = (i: number, ...sig: number[]) => sig.every((x, j) => b[i + j] === x);
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (b.length >= 5 && at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: 'application/pdf', ext: 'pdf', kind: 'document' };
  return null;
}

/** Valida un archivo para el uso esperado. Devuelve el tipo detectado o un mensaje de error. */
export function checkUpload(bytes: Uint8Array, expected: 'image' | 'document', filename: string): SniffedType | string {
  const t = sniffFile(bytes);
  if (!t || t.kind !== expected) return expected === 'image' ? `"${filename}" no es una imagen JPG, PNG o WebP.` : `"${filename}" no es un PDF.`;
  const max = UPLOAD_LIMITS[expected];
  if (bytes.length > max) return `"${filename}" supera el máximo de ${max / 1024 / 1024} MB.`;
  return t;
}
