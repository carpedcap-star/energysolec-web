import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { AVAILABILITY, PRICE_TIERS, type ProductRecord } from '@/lib/data/types';
import { PRODUCT_CATEGORIES } from '@/lib/data/seed';
import { effectivePrice } from '@/lib/services/catalog';
import { fmtUsd2 } from '@/lib/format';

export const metadata: Metadata = { title: 'Productos', description: 'Catálogo, precios por nivel e inventario', alternates: { canonical: '/admin/productos' } };

const FILTERS = [['', 'Todos'], ['publicados', 'Publicados'], ['borradores', 'Borradores'], ['ejemplo', 'De ejemplo'], ['sin-stock', 'Sin stock']] as const;
const catName = (slug: string) => PRODUCT_CATEGORIES.find(([s]) => s === slug)?.[1] ?? slug;
const match = (p: ProductRecord, f: string) =>
  f === 'publicados' ? p.published : f === 'borradores' ? !p.published : f === 'ejemplo' ? p.is_placeholder : f === 'sin-stock' ? p.stock <= 0 : true;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; eliminado?: string }> }) {
  await requireStaff('products');
  const { q = '', f = '', eliminado } = await searchParams;
  const all = await getStore().listProductRecords();
  const needle = q.trim().toLowerCase();
  const rows = all.filter((p) => match(p, f) && (!needle || [p.name, p.sku, p.model, p.brand].some((x) => x?.toLowerCase().includes(needle))));
  const count = (k: string) => all.filter((p) => match(p, k)).length;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Productos</h1>
          <p className="mt-1 text-sm text-muted">Catálogo de la tienda: precios por nivel, inventario, imágenes y fichas técnicas.</p>
        </div>
        <Link href="/admin/productos/nuevo" className="btn-dark">Nuevo producto</Link>
      </div>
      {eliminado && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Producto {eliminado} eliminado.</p>}

      <form className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="label">Buscar</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Nombre, SKU, modelo o marca" />
        </div>
        <div>
          <label htmlFor="f" className="label">Mostrar</label>
          <select id="f" name="f" defaultValue={f} className="input sm:w-48">
            {FILTERS.map(([k, l]) => <option key={k} value={k}>{l} ({count(k)})</option>)}
          </select>
        </div>
        <button className="btn-ghost">Filtrar</button>
      </form>

      <div className="card relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <caption className="sr-only">Productos del catálogo</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>{['', 'Producto', ...PRICE_TIERS.map((t) => t.label), 'Stock', 'Disponibilidad', 'Estado'].map((h, i) => <th key={i} scope="col" className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line align-top hover:bg-surface">
                <td className="w-16 px-4 py-3">
                  {p.images[0]
                    ? <img src={p.images[0].url} alt="" className="h-12 w-12 rounded-lg border border-line bg-white object-contain" />
                    : <div className="grid h-12 w-12 place-items-center rounded-lg border border-dashed border-line text-[10px] text-muted">Sin foto</div>}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/productos/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                  <p className="text-xs text-muted">SKU {p.sku} · {catName(p.category)}{p.brand ? ` · ${p.brand}` : ''}</p>
                </td>
                {PRICE_TIERS.map((t) => {
                  const e = effectivePrice(p.prices, t.id);
                  return (
                    <td key={t.id} className="px-4 py-3 tabular-nums">
                      {!e ? <span className="text-muted">—</span> : e.price === 0 && t.id === 'final' ? <span className="text-muted">A consultar</span> : e.promo_price != null
                        ? <><span className="text-xs text-muted line-through">{fmtUsd2(e.price)}</span><br />{fmtUsd2(e.promo_price)} <span className="text-xs text-brand-accent">promo</span></>
                        : fmtUsd2(e.price)}
                    </td>
                  );
                })}
                <td className={`px-4 py-3 tabular-nums ${p.stock <= 0 ? 'text-red-700' : ''}`}>{p.stock}</td>
                <td className="px-4 py-3">{AVAILABILITY.find((a) => a.id === p.availability)?.label}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.published ? 'bg-green-100 text-green-900' : 'bg-surface text-muted'}`}>{p.published ? 'Publicado' : 'Borrador'}</span>
                    {p.is_placeholder && <span className="placeholder-badge">Ejemplo</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">{all.length ? 'Ningún producto coincide con el filtro.' : 'Aún no hay productos. Crea el primero.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Precios sin IVA. Los productos de ejemplo no pueden publicarse hasta reemplazarlos con datos reales y verificados.</p>
    </div>
  );
}
