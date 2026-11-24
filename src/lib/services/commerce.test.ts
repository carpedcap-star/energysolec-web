import { describe, it, expect } from 'vitest';
import { priceCart } from './cart';
import { orderMessage } from './whatsapp';
import type { Product } from '../data/types';

const prod = (id: string, price: number, promo: number | null = null): Product => ({ id, sku: id.toUpperCase(), slug: id, name: `Producto ${id}`, brand: null, model: null, category: 'x', summary: null, specs: {}, warranty: null, certifications: [], images: [], datasheet_url: null, vat_rate: 0.15, stock: 5, availability: 'disponible', installable: false, price, promo_price: promo, is_placeholder: false, published: true });

describe('carrito', () => {
  it('recalcula precios, promo e IVA en servidor', () => {
    const r = priceCart([{ productId: 'a', qty: 2 }, { productId: 'b', qty: 1 }, { productId: 'zz', qty: 1 }], [prod('a', 100), prod('b', 50, 40)]);
    expect(r.subtotal).toBe(240);
    expect(r.tax).toBe(36);
    expect(r.total).toBe(276);
    expect(r.problems).toHaveLength(1);
  });
  it('mensaje de WhatsApp incluye todos los campos requeridos', () => {
    const c = priceCart([{ productId: 'a', qty: 3 }], [prod('a', 10)]);
    const m = orderMessage({ number: 'ESE-P-2026-001000', customer_name: 'Ana', customer_type: 'final', city: 'Guayaquil', needs_installation: true, ...c });
    for (const s of ['ESE-P-2026-001000', 'Ana', '3 × Producto a', 'Subtotal', 'Impuestos', 'Total estimado', 'Guayaquil', 'instalación: Sí']) expect(m).toContain(s);
  });
});
