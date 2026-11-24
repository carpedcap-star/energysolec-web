import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { deleteProjectAction } from '../../../actions';
import { ProjectForm } from '../project-form';
import { DeleteRecord } from '../../delete-record';

export const metadata: Metadata = { title: 'Editar proyecto', description: 'Edición de proyecto del portafolio', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireStaff('projects');
  const { id } = await params;
  const p = await getStore().getProjectRecord(id);
  if (!p) notFound();
  const saved = (await searchParams).guardado === '1';
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/proyectos" className="hover:underline">Proyectos</Link> / {p.title}</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold">{p.title}</h1>
        {p.published && <Link href={`/proyectos/${p.slug}`} target="_blank" className="text-sm text-brand-accent hover:underline">Ver en el sitio ↗</Link>}
      </div>
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados.</p>}
      <ProjectForm key={p.updated_at ?? p.id} project={p} />
      <DeleteRecord action={deleteProjectAction.bind(null, p.id)} name={p.title} title="Eliminar proyecto"
        note="Se elimina la ficha y sus vínculos con las fotos. Si solo quieres ocultarlo, despublícalo." />
    </div>
  );
}
