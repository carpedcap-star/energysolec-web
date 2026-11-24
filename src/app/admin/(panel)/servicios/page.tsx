import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { mergeServices } from '@/lib/services/service-catalog';

export const metadata: Metadata = { title: 'Servicios', description: 'Servicios de ingeniería y su contenido', alternates: { canonical: '/admin/servicios' } };

export default async function Page({ searchParams }: { searchParams: Promise<{ eliminado?: string }> }) {
  await requireStaff('services');
  const { eliminado } = await searchParams;
  const services = mergeServices(await getStore().listServiceRows());
  const pendientes = services.filter((s) => s.published && !s.description).length;
  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Servicios</h1>
          <p className="mt-1 text-sm text-muted">{pendientes ? `${pendientes} servicio(s) publicados aún sin descripción: se muestran como contenido provisional.` : 'Todos los servicios publicados tienen descripción.'}</p>
        </div>
        <Link href="/admin/servicios/nuevo" className="btn-dark">Nuevo servicio</Link>
      </div>
      {eliminado && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Servicio «{eliminado}» eliminado.</p>}
      <ul className="card mt-6 divide-y divide-line">
        {services.map((s) => (
          <li key={s.slug}>
            <Link href={`/admin/servicios/${s.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-surface">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{s.name}</span>
                <span className="block text-xs text-muted">/servicios/{s.slug}{s.isBase ? '' : ' · agregado en el panel'}</span>
              </span>
              <span className="flex gap-1">
                {!s.description && <span className="placeholder-badge">Provisional</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs ${s.published ? 'bg-green-100 text-green-900' : 'bg-surface text-muted'}`}>{s.published ? 'Publicado' : 'Oculto'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
