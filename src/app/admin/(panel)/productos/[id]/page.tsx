import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { ProductForm } from '../product-form';
import { deleteProductAction } from '../../../actions';
import { DeleteRecord } from '../../delete-record';

export const metadata: Metadata = { title: 'Editar producto', description: 'Edición de producto del catálogo', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireStaff('products');
  const { id } = await params;
  const store = getStore();
  const [p, brands] = await Promise.all([store.getProductRecord(id), store.listBrands({ includeUnpublished: true })]);
  if (!p) notFound();
  const saved = (await searchParams).guardado === '1';
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/productos" className="hover:underline">Productos</Link> / {p.sku}</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold">{p.name}</h1>
        {p.published && <Link href={`/tienda/${p.slug}`} target="_blank" className="text-sm text-brand-accent hover:underline">Ver en la tienda ↗</Link>}
      </div>
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados.</p>}
      <ProductForm key={p.updated_at ?? p.id} product={p} brands={brands.map((b) => ({ id: b.id, name: b.name }))} />
      <DeleteRecord action={deleteProductAction.bind(null, p.id)} name={p.name} title="Eliminar producto"
        note="Si el producto ya figura en pedidos no se puede eliminar: despublícalo para conservar el historial." />
    </div>
  );
}
