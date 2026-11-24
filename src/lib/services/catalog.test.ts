import { describe, expect, it } from 'vitest';
import { checkUpload, effectivePrice, parseNumber, parseProductForm, promoUntilToDate, slugify, sniffFile } from './catalog';
import type { TierPrice } from '../data/types';

const form = (over: Record<string, string | string[] | null> = {}) => {
  const base: Record<string, string | string[] | null> = {
    sku: 'pan-580', name: 'Panel Mono 580 W', category: 'paneles-solares', availability: 'disponible', stock: '10', vat_pct: '15',
    price_final: '120,50', promo_final: '', promo_until_final: '', price_instalador: '105', price_distribuidor: '',
    spec_key: ['Potencia (W)', 'Tecnología', ''], spec_value: ['580', 'N-type', ''], certifications: 'IEC 61215, IEC 61730, IEC 61215',
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) {
    if (v == null) continue;
    for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  }
  return fd;
};
const ok = (fd: FormData) => { const r = parseProductForm(fd); if ('error' in r) throw new Error(r.error); return r.data; };
const err = (fd: FormData) => { const r = parseProductForm(fd); return 'error' in r ? r.error : null; };

describe('catálogo: formulario de producto', () => {
  it('normaliza SKU, slug, decimales con coma, IVA y especificaciones', () => {
    const p = ok(form());
    expect(p.sku).toBe('PAN-580');
    expect(p.slug).toBe('panel-mono-580-w');
    expect(p.vat_rate).toBe(0.15);
    expect(p.prices).toEqual([
      { tier: 'final', price: 120.5, promo_price: null, promo_until: null },
      { tier: 'instalador', price: 105, promo_price: null, promo_until: null },
    ]);
    expect(p.specs).toEqual({ 'Potencia (W)': 580, 'Tecnología': 'N-type' });
    expect(p.certifications).toEqual(['IEC 61215', 'IEC 61730']);
    expect(p.published).toBe(false);
  });

  it('nunca permite publicar un producto de ejemplo', () => {
    expect(err(form({ published: 'on', is_placeholder: 'on' }))).toMatch(/ejemplo no puede publicarse/);
    expect(ok(form({ published: 'on' })).published).toBe(true);
  });

  it('exige precio final y promociones coherentes', () => {
    expect(err(form({ price_final: '' }))).toMatch(/cliente final es obligatorio/);
    expect(err(form({ promo_final: '130' }))).toMatch(/menor al precio normal/);
    expect(err(form({ promo_until_final: '2027-01-01' }))).toMatch(/sin precio promocional/);
    expect(err(form({ price_distribuidor: '', promo_distribuidor: '90' }))).toMatch(/precio distribuidor/);
    expect(err(form({ price_final: '-1' }))).toMatch(/negativo/);
    expect(err(form({ price_final: 'abc' }))).toMatch(/ingresa un número/);
  });

  it('mantiene coherentes inventario y disponibilidad', () => {
    expect(err(form({ stock: '0' }))).toMatch(/stock mayor a 0/);
    expect(err(form({ availability: 'agotado' }))).toMatch(/no puede estar "Agotado"/);
    expect(err(form({ stock: '2.5' }))).toMatch(/entero/);
    expect(ok(form({ stock: '0', availability: 'bajo_pedido' })).stock).toBe(0);
  });

  it('rechaza especificaciones incompletas o repetidas y categorías desconocidas', () => {
    expect(err(form({ spec_key: ['Potencia'], spec_value: [''] }))).toMatch(/incompleta/);
    expect(err(form({ spec_key: ['A', 'A'], spec_value: ['1', '2'] }))).toMatch(/repetida/);
    expect(err(form({ category: 'inventada' }))).toMatch(/categoría/);
    expect(err(form({ sku: 'con espacio' }))).toMatch(/SKU/);
  });

  it('la promoción dura hasta el final del día en Ecuador', () => {
    const p = ok(form({ promo_final: '99', promo_until_final: '2026-12-31' }));
    const until = p.prices[0].promo_until!;
    expect(promoUntilToDate(until)).toBe('2026-12-31');
    expect(effectivePrice(p.prices, 'final', Date.parse('2026-12-31T23:00:00-05:00'))?.promo_price).toBe(99);
    expect(effectivePrice(p.prices, 'final', Date.parse('2027-01-01T00:00:01-05:00'))?.promo_price).toBeNull();
    expect(err(form({ promo_final: '99', promo_until_final: '31/12/2026' }))).toMatch(/no válida/);
  });

  it('conserva el orden de las imágenes y la ficha técnica', () => {
    const p = ok(form({ image_ids: ['m2', 'm1'], datasheet_id: 'd1' }));
    expect(p.image_ids).toEqual(['m2', 'm1']);
    expect(p.datasheet_id).toBe('d1');
  });
});

describe('catálogo: precio vigente por nivel', () => {
  const prices: TierPrice[] = [
    { tier: 'final', price: 100, promo_price: 90, promo_until: '2026-12-31T23:59:59Z' },
    { tier: 'instalador', price: 85, promo_price: null, promo_until: null },
  ];
  it('aplica la promoción solo mientras está vigente', () => {
    expect(effectivePrice(prices, 'final', Date.parse('2026-12-01'))).toEqual({ price: 100, promo_price: 90 });
    expect(effectivePrice(prices, 'final', Date.parse('2027-01-02'))).toEqual({ price: 100, promo_price: null });
  });
  it('devuelve null si el nivel no se ofrece', () => {
    expect(effectivePrice(prices, 'distribuidor')).toBeNull();
    expect(effectivePrice(prices, 'instalador')).toEqual({ price: 85, promo_price: null });
  });
  it('ignora una promoción que no es menor al precio', () => {
    expect(effectivePrice([{ tier: 'final', price: 50, promo_price: 50, promo_until: null }])).toEqual({ price: 50, promo_price: null });
  });
});

describe('catálogo: archivos', () => {
  const bytes = (...h: number[]) => new Uint8Array([...h, ...new Array(16).fill(0)]);
  it('identifica por firma binaria', () => {
    expect(sniffFile(bytes(0xff, 0xd8, 0xff))?.mime).toBe('image/jpeg');
    expect(sniffFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe('image/png');
    expect(sniffFile(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))?.mime).toBe('image/webp');
    expect(sniffFile(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))?.mime).toBe('application/pdf');
    expect(sniffFile(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
  });
  it('rechaza el tipo equivocado y el exceso de tamaño', () => {
    expect(checkUpload(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), 'image', 'a.jpg')).toMatch(/no es una imagen/);
    expect(checkUpload(bytes(0xff, 0xd8, 0xff), 'document', 'f.pdf')).toMatch(/no es un PDF/);
    const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set([0xff, 0xd8, 0xff]);
    expect(checkUpload(big, 'image', 'big.jpg')).toMatch(/supera el máximo de 5 MB/);
  });
});

describe('catálogo: utilidades', () => {
  it('slugify y números en formato local', () => {
    expect(slugify('Batería LiFePO4 5 kWh — Ñandú')).toBe('bateria-lifepo4-5-kwh-nandu');
    expect(parseNumber('1.234,50')).toBe(1234.5);
    expect(parseNumber('$ 99.9')).toBe(99.9);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('x')).toBeNaN();
  });
});
