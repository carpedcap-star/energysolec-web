import { describe, expect, it } from 'vitest';
import { canTransition, productPricing, ReviewSchema, rucProblem, TradeApplication, unitPriceFor } from './trade';
import { priceCart } from './cart';
import { orderMessage } from './whatsapp';
import type { Product, TierPrice } from '../data/types';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const tp = (tier: TierPrice['tier'], price: number, promo: number | null = null, until: string | null = null): TierPrice => ({ tier, price, promo_price: promo, promo_until: until });

describe('RUC', () => {
  it('acepta RUC de persona natural y de sociedad', () => {
    expect(rucProblem('0912345678001')).toBeNull();
    expect(rucProblem('1790012345001')).toBeNull();
    expect(rucProblem('3050012345001')).toBeNull();
  });
  it('rechaza largo, provincia y establecimiento no válidos', () => {
    expect(rucProblem('091234567800')).toMatch(/13 dígitos/);
    expect(rucProblem('2512345678001')).toMatch(/provincia/);
    expect(rucProblem('0012345678001')).toMatch(/provincia/);
    expect(rucProblem('0912345678000')).toMatch(/000/);
  });
});

describe('solicitud', () => {
  const ok = { company: 'Solar Andes S.A.S.', ruc: '1790-0123-45001', tier: 'instalador', contact_name: 'Ana Pérez', email: ' Ana@Example.com ', phone: '+593 99 123 4567', city: 'Quito', acceptPrivacy: true };
  it('normaliza RUC y correo', () => {
    const r = TradeApplication.parse(ok);
    expect(r.ruc).toBe('1790012345001');
    expect(r.email).toBe('ana@example.com');
    expect(r.acceptMarketing).toBe(false);
  });
  it('exige privacidad, tipo de cuenta válido y RUC correcto', () => {
    expect(TradeApplication.safeParse({ ...ok, acceptPrivacy: false }).success).toBe(false);
    expect(TradeApplication.safeParse({ ...ok, tier: 'final' }).success).toBe(false);
    expect(TradeApplication.safeParse({ ...ok, ruc: '123' }).error?.issues[0].message).toMatch(/13 dígitos/);
  });
});

describe('estados', () => {
  it('solo transiciones permitidas', () => {
    expect(canTransition('pendiente', 'aprobada')).toBe(true);
    expect(canTransition('pendiente', 'suspendida')).toBe(false);
    expect(canTransition('aprobada', 'suspendida')).toBe(true);
    expect(canTransition('suspendida', 'aprobada')).toBe(true);
    expect(canTransition('rechazada', 'aprobada')).toBe(false);
  });
  it('rechazar o suspender exige motivo', () => {
    expect(ReviewSchema.safeParse({ status: 'rechazada', tier: 'instalador', review_note: '' }).success).toBe(false);
    expect(ReviewSchema.safeParse({ status: 'aprobada', tier: 'instalador' }).success).toBe(true);
  });
});

describe('precio por nivel', () => {
  const prices = [tp('final', 100, 90), tp('instalador', 80), tp('distribuidor', 70, 65, '2026-11-01T00:00:00Z')];
  it('cliente final: precio con promoción vigente', () => {
    expect(unitPriceFor(prices, 'final', NOW)).toEqual({ price: 100, promo_price: 90, tierApplied: 'final' });
  });
  it('nivel comercial: su precio; la promoción vencida no aplica', () => {
    expect(unitPriceFor(prices, 'instalador', NOW)).toEqual({ price: 80, promo_price: null, tierApplied: 'instalador' });
    expect(unitPriceFor(prices, 'distribuidor', NOW)).toEqual({ price: 70, promo_price: null, tierApplied: 'distribuidor' });
  });
  it('sin precio de nivel, o en 0, usa el de cliente final', () => {
    expect(unitPriceFor([tp('final', 100)], 'instalador', NOW)?.tierApplied).toBe('final');
    expect(unitPriceFor([tp('final', 100), tp('instalador', 0)], 'instalador', NOW)?.price).toBe(100);
  });
  it('nunca cobra al cliente comercial más que al final', () => {
    expect(unitPriceFor([tp('final', 100, 75), tp('instalador', 80)], 'instalador', NOW)).toEqual({ price: 100, promo_price: 75, tierApplied: 'final' });
  });
  it('sin precio final no hay precio', () => {
    expect(unitPriceFor([tp('instalador', 80)], 'instalador', NOW)).toBeNull();
  });
  it('el carrito del servidor cobra el precio del nivel', () => {
    const base: Product = { id: 'a', sku: 'A', slug: 'a', name: 'A', brand: null, model: null, category: 'x', summary: null, specs: {}, warranty: null, certifications: [], images: [], datasheet_url: null, vat_rate: 0.15, stock: 5, availability: 'disponible', installable: false, price: 0, promo_price: null, is_placeholder: false, published: true };
    const p = { ...base, ...productPricing(prices, 'instalador', NOW) };
    expect(p.final_unit).toBe(90);
    const c = priceCart([{ productId: 'a', qty: 2 }], [p]);
    expect(c.subtotal).toBe(160);
    expect(c.total).toBe(184);
  });
});

describe('mensaje de WhatsApp', () => {
  const base = { number: 'ESE-P-2026-001001', customer_name: 'Ana', city: 'Quito', needs_installation: false, items: [], subtotal: 0, tax: 0, total: 0 };
  it('indica la cuenta comercial y su nivel', () => {
    expect(orderMessage({ ...base, customer_type: 'instalador', price_tier: 'instalador', company: 'Solar SA' })).toContain('Cuenta comercial: Solar SA · precios de instalador');
  });
  it('avisa cuando alguien se declara instalador sin cuenta', () => {
    expect(orderMessage({ ...base, customer_type: 'instalador' })).toContain('Sin cuenta comercial aprobada: precios de cliente final.');
  });
});
