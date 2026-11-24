import type { OrderItem, Product } from '../data/types';

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Precios SIEMPRE recalculados en servidor a partir del catálogo: nunca se confía en el precio del navegador. */
export function priceCart(lines: { productId: string; qty: number }[], products: Product[]) {
  const items: OrderItem[] = [];
  const problems: string[] = [];
  for (const l of lines) {
    const p = products.find((x) => x.id === l.productId);
    if (!p) { problems.push(`Producto ${l.productId} no disponible`); continue; }
    const unit = p.promo_price ?? p.price;
    items.push({ product_id: p.id, sku: p.sku, name: p.name, qty: l.qty, unit_price: r2(unit), vat_rate: p.vat_rate, line_subtotal: r2(unit * l.qty) });
  }
  const subtotal = r2(items.reduce((a, i) => a + i.line_subtotal, 0));
  const tax = r2(items.reduce((a, i) => a + i.line_subtotal * i.vat_rate, 0));
  return { items, subtotal, tax, total: r2(subtotal + tax), problems };
}
