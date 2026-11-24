import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { isLive } from '@/lib/services/blog';
import { deletePostAction } from '../../../actions';
import { PostForm } from '../post-form';
import { DeleteRecord } from '../../delete-record';

export const metadata: Metadata = { title: 'Editar artículo', description: 'Edición de artículo del blog', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  await requireStaff('blog');
  const p = await getStore().getPostRecord((await params).id);
  if (!p) notFound();
  const saved = (await searchParams).guardado === '1';
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/blog" className="hover:underline">Blog</Link> / {p.title}</nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-bold">{p.title}</h1>
        {isLive(p) && <Link href={`/blog/${p.slug}`} target="_blank" className="text-sm text-brand-accent hover:underline">Ver en el sitio ↗</Link>}
      </div>
      {p.author && <p className="mt-1 text-sm text-muted">Autor: {p.author}</p>}
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados.</p>}
      <PostForm key={JSON.stringify(p)} post={p} />
      <DeleteRecord action={deletePostAction.bind(null, p.id)} name={p.title} title="Eliminar artículo"
        note="Se elimina del sitio y del panel. Si solo quieres retirarlo, desmarca «Publicar»." />
    </div>
  );
}
