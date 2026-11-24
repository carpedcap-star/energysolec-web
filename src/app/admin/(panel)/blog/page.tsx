import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { postStatus } from '@/lib/services/blog';

export const metadata: Metadata = { title: 'Blog', description: 'Artículos del blog', alternates: { canonical: '/admin/blog' } };
const fmt = (iso: string) => new Date(iso).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'medium', timeStyle: 'short' });
const STATUS = { borrador: ['Borrador', 'bg-surface text-muted'], programado: ['Programado', 'bg-amber-100 text-amber-900'], publicado: ['Publicado', 'bg-green-100 text-green-900'] } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ eliminado?: string }> }) {
  await requireStaff('blog');
  const { eliminado } = await searchParams;
  const posts = await getStore().listPostRecords();
  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Blog</h1>
          <p className="mt-1 text-sm text-muted">Guías, noticias y casos de éxito. Los programados se publican solos en su fecha.</p>
        </div>
        <Link href="/admin/blog/nuevo" className="btn-dark">Nuevo artículo</Link>
      </div>
      {eliminado && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Artículo «{eliminado}» eliminado.</p>}
      <ul className="card mt-6 divide-y divide-line">
        {posts.map((p) => {
          const st = postStatus(p);
          return (
            <li key={p.id}>
              <Link href={`/admin/blog/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-surface">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.title}</span>
                  <span className="block text-xs text-muted">{[p.category, p.author, p.published_at && st !== 'borrador' ? fmt(p.published_at) : null].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[st][1]}`}>{STATUS[st][0]}</span>
              </Link>
            </li>
          );
        })}
        {!posts.length && <li className="p-10 text-center text-muted">Aún no hay artículos. Escribe el primero.</li>}
      </ul>
    </div>
  );
}
