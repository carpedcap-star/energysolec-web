'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useCart } from '../cart';
import { track } from '../consent';

export function AddToCart({ p }: { p: { id: string; slug: string; name: string; sku: string; price: number; vat_rate: number; is_placeholder: boolean; availability: string } }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  if (p.availability === 'agotado') return <p className="text-sm font-medium text-red-700">Agotado temporalmente</p>;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="sr-only" htmlFor={`q-${p.id}`}>Cantidad</label>
      <input id={`q-${p.id}`} type="number" min={1} max={9999} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value || 1))} className="input !w-24" />
      <button className="btn-primary" onClick={() => { add({ productId: p.id, slug: p.slug, name: p.name, sku: p.sku, unitPrice: p.price, vatRate: p.vat_rate, placeholder: p.is_placeholder }, qty); setAdded(true); track('add_to_cart', { item_id: p.sku, value: p.price * qty, currency: 'USD' }); }}>Agregar al carrito</button>
      {added && <Link href="/carrito" className="text-sm font-semibold underline" role="status">Agregado · Ver carrito</Link>}
    </div>
  );
}
