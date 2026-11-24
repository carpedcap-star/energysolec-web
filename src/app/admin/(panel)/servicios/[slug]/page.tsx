import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { mergeServices } from '@/lib/services/service-catalog';
import { deleteServiceAction } from '../../../actions';
import { ServiceForm } from '../service-form';
import { DeleteRecord } from '../../delete-record';

export const metadata: Metadata = { title: 'Editar servicio', description: 'Edición de servicio', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ guardado?: string; restaurado?: string }> }) {
  await requireStaff('services');
  const { slug } = await params;
  const s = mergeServices(await getStore().listServiceRows()).find((x) => x.slug === slug);
  if (!s) notFound();
  const sp = await searchParams;
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/servicios" className="hover:underline">Servicios</Link> / {s.name}</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold">{s.name}</h1>
        {s.published && <Link href={`/servicios/${s.slug}`} target="_blank" className="text-sm text-brand-accent hover:underline">Ver en el sitio ↗</Link>}
      </div>
      {sp.guardado === '1' && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados.</p>}
      {sp.restaurado === '1' && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Se restauró la versión base del servicio.</p>}
      <ServiceForm key={JSON.stringify(s)} service={s} />
      {s.id && (s.isBase
        ? <DeleteRecord action={deleteServiceAction.bind(null, s.slug)} name={s.name} title="Restaurar versión base" confirmText={`¿Descartar lo guardado de «${s.name}» y volver a la versión base?`}
            note="Descarta lo guardado en el panel: el servicio vuelve a mostrarse solo con su nombre, como contenido provisional." />
        : <DeleteRecord action={deleteServiceAction.bind(null, s.slug)} name={s.name} title="Eliminar servicio"
            note="Se elimina el servicio del sitio. Si solo quieres ocultarlo, desmarca «Publicado»." />)}
    </div>
  );
}
