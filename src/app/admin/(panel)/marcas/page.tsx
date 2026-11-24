import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { relationshipIsPublic, todayEc } from '@/lib/services/brands';

export const metadata: Metadata = { title: 'Marcas', description: 'Fabricantes, relación comercial con respaldo y documentos', alternates: { canonical: '/admin/marcas' } };

export default async function Page({ searchParams }: { searchParams: Promise<{ eliminado?: string }> }) {
  await requireStaff('brands');
  const { eliminado } = await searchParams;
  const brands = await getStore().listBrandRecords();
  const today = todayEc();
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Marcas</h1>
          <p className="mt-1 text-sm text-muted">Fabricantes que se muestran en el sitio. La relación comercial solo se publica con respaldo verificado y vigente.</p>
        </div>
        <Link href="/admin/marcas/nueva" className="btn-dark">Nueva marca</Link>
      </div>
      {eliminado && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Marca «{eliminado}» eliminada.</p>}
      <div className="card relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Marcas</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>{['', 'Marca', 'Relación comercial', 'Documentos', 'Publicación'].map((h, i) => <th key={i} scope="col" className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {brands.map((b) => {
              const shown = relationshipIsPublic(b, today);
              const expired = b.relationship_verified && b.relationship_valid_until && b.relationship_valid_until < today;
              const rel = !b.relationship ? null : shown ? ['Publicada', 'bg-green-100 text-green-900'] : expired ? ['Vencida', 'bg-red-100 text-red-900'] : ['Sin respaldo verificado', 'bg-amber-100 text-amber-900'];
              return (
                <tr key={b.id} className="border-t border-line align-top hover:bg-surface">
                  <td className="w-28 px-4 py-3">{b.logo ? <img src={b.logo.url} alt="" className="h-10 w-20 object-contain" /> : <div className="grid h-10 w-20 place-items-center rounded-lg border border-dashed border-line text-[10px] text-muted">Sin logo</div>}</td>
                  <td className="px-4 py-3"><Link href={`/admin/marcas/${b.id}`} className="font-medium hover:underline">{b.name}</Link></td>
                  <td className="px-4 py-3">
                    {rel ? <><p>{b.relationship}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${rel[1]}`}>{rel[0]}{shown && b.relationship_valid_until ? ` · hasta ${b.relationship_valid_until}` : ''}</span></> : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{b.assets.length || <span className="text-muted">0</span>}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${b.published ? 'bg-green-100 text-green-900' : 'bg-surface text-muted'}`}>{b.published ? 'Publicada' : 'Oculta'}</span></td>
                </tr>
              );
            })}
            {!brands.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">Aún no hay marcas.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
