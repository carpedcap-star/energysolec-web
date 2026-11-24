import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { deleteBrandAction } from '../../../actions';
import { BrandForm } from '../brand-form';
import { DeleteRecord } from '../../delete-record';

export const metadata: Metadata = { title: 'Editar marca', description: 'Edición de marca', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireStaff('brands');
  const b = await getStore().getBrandRecord((await params).id);
  if (!b) notFound();
  const saved = (await searchParams).guardado === '1';
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/marcas" className="hover:underline">Marcas</Link> / {b.name}</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold">{b.name}</h1>
        {b.published && <Link href="/marcas" target="_blank" className="text-sm text-brand-accent hover:underline">Ver en el sitio ↗</Link>}
      </div>
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados.</p>}
      <BrandForm key={JSON.stringify(b)} brand={b} />
      <DeleteRecord action={deleteBrandAction.bind(null, b.id)} name={b.name} title="Eliminar marca"
        note="Si hay productos de esta marca no se puede eliminar: cámbiales la marca o deja la marca oculta." />
    </div>
  );
}
