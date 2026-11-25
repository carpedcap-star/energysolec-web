import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkPalette, contrast, cssVars, DEFAULT_COLORS, hexToTriplet, normalizeHex, normalizeIdentity, parseColorsForm } from './identity';

const fdOf = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };

describe('identidad: colores', () => {
  it('los valores por defecto coinciden con globals.css', () => {
    const css = readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8');
    for (const [k, v] of Object.entries(cssVars(DEFAULT_COLORS))) expect(css).toMatch(new RegExp(`${k}:\\s*${v};`));
  });
  it('convierte y normaliza hexadecimales', () => {
    expect(hexToTriplet('#FDC913')).toBe('253 201 19');
    expect(normalizeHex('fc0')).toBe('#FFCC00');
    expect(normalizeHex(' #0082aa ')).toBe('#0082AA');
  });
  it('calcula el contraste WCAG', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(contrast('#0082AA', '#FFFFFF')).toBeCloseTo(4.4, 1);
  });
  it('la paleta por defecto pasa; el azul queda con aviso (4,4:1 < 4,5:1 recomendado)', () => {
    const c = checkPalette(DEFAULT_COLORS);
    expect(c.every((x) => x.level !== 'error')).toBe(true);
    expect(c.find((x) => x.label.startsWith('Enlaces'))?.level).toBe('aviso');
  });
});

describe('identidad: formulario', () => {
  it('acepta una paleta legible', () => {
    const r = parseColorsForm(fdOf({ brand: '#FFD23F', dark: '#1B1B1B', accent: '#006E90' }));
    expect('data' in r && r.data).toEqual({ brand: '#FFD23F', dark: '#1B1B1B', accent: '#006E90' });
  });
  it('rechaza combinaciones ilegibles con el motivo', () => {
    expect((parseColorsForm(fdOf({ brand: '#FDC913', dark: '#8A8A8A', accent: '#0082AA' })) as { error: string }).error).toMatch(/Contraste insuficiente/);
    expect((parseColorsForm(fdOf({ brand: '#FDC913', dark: '#282626', accent: '#7FD4F0' })) as { error: string }).error).toMatch(/Enlaces y antetítulos/);
    expect((parseColorsForm(fdOf({ brand: 'amarillo', dark: '#282626', accent: '#0082AA' })) as { error: string }).error).toMatch(/hexadecimal/);
  });
});

describe('identidad: lectura tolerante', () => {
  it('sin datos o con datos inválidos usa los valores por defecto', () => {
    expect(normalizeIdentity(null).colors).toEqual(DEFAULT_COLORS);
    expect(normalizeIdentity({ colors: { brand: 'rojo', dark: '#282626', accent: '#0082AA' } }).colors.brand).toBe('#FDC913');
  });
  it('acepta el formato inicial del seed y trata las rutas /brand como «por defecto»', () => {
    const i = normalizeIdentity({ yellow: '#FDC913', graphite: '#282626', blue: '#0082AA', logo: '/brand/logo.png', logoDark: '/brand/logo-dark.png', font: 'Archivo' });
    expect(i).toEqual({ colors: DEFAULT_COLORS, logo: null, logoDark: null, favicon: null });
  });
  it('una paleta ilegible guardada a mano no se aplica', () => {
    expect(normalizeIdentity({ colors: { brand: '#FFFFFF', dark: '#FFFFFF', accent: '#FFFFFF' } }).colors).toEqual(DEFAULT_COLORS);
  });
});
