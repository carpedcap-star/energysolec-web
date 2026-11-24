'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/lib/data/types';
import { fmtUsd2 } from '@/lib/format';
import { IconPanel } from '../icons';

const AV: Record<string, string> = { disponible: 'Disponible', bajo_pedido: 'Bajo pedido', agotado: 'Agotado', consultar: 'Consultar disponibilidad' };

export function Catalog({ products, categories }: { products: Product[]; categories: readonly (readonly [string, string])[] }) {
  const [cat, setCat] = useState(''), [brand, setBrand] = useState(''), [avail, setAvail] = useState(''), [q, setQ] = useState(''), [sort, setSort] = useState('name');
  const [max, setMax] = useState('');
  const [compare, setCompare] = useState<string[]>([]);
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))] as string[];
  const list = useMemo(() => products
    .filter((p) => (!cat || p.category === cat) && (!brand || p.brand === brand) && (!avail || p.availability === avail) && (!max || (p.promo_price ?? p.price) <= +max)
      && (!q || `${p.name} ${p.sku} ${p.model} ${Object.values(p.specs).join(' ')}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === 'price' ? (a.promo_price ?? a.price) - (b.promo_price ?? b.price) : sort === '-price' ? (b.promo_price ?? b.price) - (a.promo_price ?? a.price) : a.name.localeCompare(b.name)),
  [products, cat, brand, avail, q, sort, max]);
  const cmp = products.filter((p) => compare.includes(p.id));
  const specKeys = [...new Set(cmp.flatMap((p) => Object.keys(p.specs)))];

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <input className="input" placeholder="Buscar por nombre, SKU, potencia…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar productos" />
        <div><p className="label">Categoría</p><select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas</option>{categories.map(([s, n]) => <option key={s} value={s}>{n}</option>)}</select></div>
        <div><p className="label">Marca</p><select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="">Todas</option>{brands.map((b) => <option key={b}>{b}</option>)}</select></div>
        <div><p className="label">Disponibilidad</p><select className="input" value={avail} onChange={(e) => setAvail(e.target.value)}><option value="">Todas</option>{Object.entries(AV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><p className="label">Precio máximo (USD)</p><input className="input" type="number" min={0} value={max} onChange={(e) => setMax(e.target.value)} /></div>
        <div><p className="label">Ordenar</p><select className="input" value={sort} onChange={(e) => setSort(e.target.value)}><option value="name">Nombre</option><option value="price">Precio menor</option><option value="-price">Precio mayor</option></select></div>
      </aside>
      <div>
        {list.length === 0 && <p className="card p-8 text-center text-muted">No hay productos que coincidan con los filtros.</p>}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="card flex flex-col overflow-hidden">
              <Link href={`/tienda/${p.slug}`} className="grid aspect-[4/3] place-items-center bg-surface">
                {p.images[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain p-6" loading="lazy" /> : <IconPanel className="h-16 w-16 text-line" />}
              </Link>
              <div className="flex flex-1 flex-col p-5">
                {p.is_placeholder && <span className="placeholder-badge mb-2 self-start">Ejemplo · no a la venta</span>}
                <p className="text-xs uppercase tracking-wider text-muted">{p.brand ?? 'Marca por definir'} · {p.sku}</p>
                <Link href={`/tienda/${p.slug}`} className="mt-1 font-semibold leading-snug hover:underline">{p.name}</Link>
                <p className="mt-1 text-xs text-muted">{AV[p.availability]}</p>
                <div className="mt-auto flex items-end justify-between pt-4">
                  <div>{p.price > 0 ? <>{p.promo_price && <p className="text-xs text-muted line-through">{fmtUsd2(p.price)}</p>}<p className="font-display text-lg font-bold">{fmtUsd2(p.promo_price ?? p.price)} <span className="text-xs font-normal text-muted">+ IVA</span></p></> : <p className="text-sm font-medium">Precio a consultar</p>}</div>
                  <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={compare.includes(p.id)} disabled={!compare.includes(p.id) && compare.length >= 4} onChange={(e) => setCompare((c) => e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id))} /> Comparar</label>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cmp.length >= 2 && (
          <div className="card mt-10 overflow-x-auto p-5">
            <p className="mb-4 font-semibold">Comparación de productos</p>
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr><th className="py-2 text-left text-muted">Característica</th>{cmp.map((p) => <th key={p.id} className="py-2 text-left">{p.name}</th>)}</tr></thead>
              <tbody>
                <tr className="border-t border-line"><td className="py-2 text-muted">Marca</td>{cmp.map((p) => <td key={p.id}>{p.brand ?? '—'}</td>)}</tr>
                <tr className="border-t border-line"><td className="py-2 text-muted">Precio</td>{cmp.map((p) => <td key={p.id}>{p.price ? fmtUsd2(p.promo_price ?? p.price) : 'Consultar'}</td>)}</tr>
                <tr className="border-t border-line"><td className="py-2 text-muted">Garantía</td>{cmp.map((p) => <td key={p.id}>{p.warranty ?? '—'}</td>)}</tr>
                {specKeys.map((k) => <tr key={k} className="border-t border-line"><td className="py-2 text-muted">{k}</td>{cmp.map((p) => <td key={p.id}>{String(p.specs[k] ?? '—')}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
