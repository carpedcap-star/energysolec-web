import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { blockMediaIds, findBlock, mergeWithFallback } from '@/content/blocks';
import { BlockForm } from '../../block-form';

export const metadata: Metadata = { title: 'Editar contenido', description: 'Edición de un bloque de contenido', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ page: string; slot: string }>; searchParams: Promise<{ guardado?: string; restaurado?: string }> }) {
  await requireStaff('content');
  const { page, slot } = await params;
  const def = findBlock(page, slot);
  if (!def) notFound();
  const store = getStore();
  const row = (await store.listContentBlocks()).find((r) => r.page === page && r.slot === slot) ?? null;
  const data = mergeWithFallback(def, row?.data);
  const ids = blockMediaIds(def, data);
  const media = ids.length ? await store.resolveMedia(ids) : {};
  const sp = await searchParams;
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/contenido" className="hover:underline">Contenido del sitio</Link> / {def.label}</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold">{def.label}</h1>
        <Link href={def.path} target="_blank" className="text-sm text-brand-accent hover:underline">Ver página ↗</Link>
      </div>
      {def.description && <p className="mt-1 text-sm text-muted">{def.description}</p>}
      {sp.guardado === '1' && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">{row?.published ? 'Cambios guardados y publicados.' : 'Borrador guardado. La web sigue mostrando el texto base hasta que lo publiques.'}</p>}
      {sp.restaurado === '1' && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Se restauró el texto base.</p>}
      <BlockForm key={row?.updated_at ?? 'base'} def={def} data={data} media={media} hasRow={!!row}
        isPlaceholder={row ? row.is_placeholder : !!def.publicPlaceholder} published={row ? row.published : true} />
    </div>
  );
}
