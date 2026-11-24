import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { BLOCKS } from '@/content/blocks';

export const metadata: Metadata = { title: 'Contenido del sitio', description: 'Textos e imágenes editables de las páginas públicas', alternates: { canonical: '/admin/contenido' } };

export default async function Page() {
  await requireStaff('content');
  const rows = await getStore().listContentBlocks();
  const groups = [...new Set(BLOCKS.map((b) => b.group))];
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Contenido del sitio</h1>
      <p className="mt-1 text-sm text-muted">Textos e imágenes de las páginas públicas. Mientras un bloque no esté publicado, la web muestra su texto base.</p>
      {groups.map((g) => (
        <section key={g} className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{g}</h2>
          <ul className="card mt-3 divide-y divide-line">
            {BLOCKS.filter((b) => b.group === g).map((b) => {
              const row = rows.find((r) => r.page === b.page && r.slot === b.slot);
              const status = !row ? ['Texto base', 'bg-surface text-muted'] : row.published ? ['Publicado', 'bg-green-100 text-green-900'] : ['Borrador', 'bg-amber-100 text-amber-900'];
              const provisional = row ? row.is_placeholder : !!b.publicPlaceholder;
              return (
                <li key={`${b.page}.${b.slot}`}>
                  <Link href={`/admin/contenido/${b.page}/${b.slot}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-surface">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{b.label}</span>
                      <span className="block text-xs text-muted">{b.path}{row?.updated_at ? ` · editado el ${new Date(row.updated_at).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>
                    </span>
                    <span className="flex gap-1">
                      {provisional && <span className="placeholder-badge">Provisional</span>}
                      <span className={`rounded-full px-2 py-0.5 text-xs ${status[1]}`}>{status[0]}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
