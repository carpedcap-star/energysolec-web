import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { PROJECT_STATUSES, type ProjectRecord } from '@/lib/data/types';
import { fmtKwp } from '@/lib/format';

export const metadata: Metadata = { title: 'Proyectos', description: 'Portafolio de proyectos, galería y autorizaciones', alternates: { canonical: '/admin/proyectos' } };

const FILTERS = [['', 'Todos'], ['publicados', 'Publicados'], ['borradores', 'Borradores'], ['destacados', 'Destacados en portada'], ['sin-fotos', 'Sin fotos']] as const;
const match = (p: ProjectRecord, f: string) =>
  f === 'publicados' ? p.published : f === 'borradores' ? !p.published : f === 'destacados' ? p.featured : f === 'sin-fotos' ? !p.cover && !p.gallery.length : true;

function Auth({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${ok ? 'bg-green-100 text-green-900' : 'bg-surface text-muted'}`}><span aria-hidden>{ok ? '✓' : '—'}</span>{label}<span className="sr-only">{ok ? ': autorizado' : ': no autorizado'}</span></span>;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; f?: string; eliminado?: string }> }) {
  await requireStaff('projects');
  const { q = '', f = '', eliminado } = await searchParams;
  const all = await getStore().listProjectRecords();
  const needle = q.trim().toLowerCase();
  const rows = all.filter((p) => match(p, f) && (!needle || [p.title, p.client_name, p.city, p.province, p.industry].some((x) => x?.toLowerCase().includes(needle))));
  const count = (k: string) => all.filter((p) => match(p, k)).length;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Proyectos</h1>
          <p className="mt-1 text-sm text-muted">Portafolio público: fotos, datos técnicos y lo que cada cliente autorizó publicar.</p>
        </div>
        <Link href="/admin/proyectos/nuevo" className="btn-dark">Nuevo proyecto</Link>
      </div>
      {eliminado && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Proyecto «{eliminado}» eliminado.</p>}

      <form className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end" role="search">
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="label">Buscar</label>
          <input id="q" name="q" defaultValue={q} className="input" placeholder="Título, cliente, ciudad o industria" />
        </div>
        <div>
          <label htmlFor="f" className="label">Mostrar</label>
          <select id="f" name="f" defaultValue={f} className="input sm:w-56">
            {FILTERS.map(([k, l]) => <option key={k} value={k}>{l} ({count(k)})</option>)}
          </select>
        </div>
        <button className="btn-ghost">Filtrar</button>
      </form>

      <div className="card relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <caption className="sr-only">Proyectos del portafolio</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>{['', 'Proyecto', 'Capacidad', 'Estado', 'Autorizaciones', 'Publicación'].map((h, i) => <th key={i} scope="col" className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-line align-top hover:bg-surface">
                <td className="w-24 px-4 py-3">
                  {p.cover ? <img src={p.cover.url} alt="" className="h-12 w-16 rounded-lg object-cover" /> : <div className="grid h-12 w-16 place-items-center rounded-lg border border-dashed border-line text-[10px] text-muted">Sin foto</div>}
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/proyectos/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                  <p className="text-xs capitalize text-muted">{[p.segment, p.industry, p.city ?? p.province].filter(Boolean).join(' · ')}</p>
                  {p.client_name && <p className="text-xs text-muted">Cliente: {p.client_name}</p>}
                </td>
                <td className="px-4 py-3 tabular-nums">{p.capacity_kwp ? fmtKwp(p.capacity_kwp) : <span className="text-muted">—</span>}</td>
                <td className="px-4 py-3">{PROJECT_STATUSES.find((s) => s.id === p.status)?.label}</td>
                <td className="px-4 py-3">
                  <div className="flex max-w-[260px] flex-wrap gap-1">
                    <Auth ok={p.client_name_authorized} label="Cliente" />
                    <Auth ok={p.location_authorized} label="Mapa" />
                    <Auth ok={p.financials_authorized} label="Ahorro" />
                    <Auth ok={p.testimonial_verified} label="Testimonio" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${p.published ? 'bg-green-100 text-green-900' : 'bg-surface text-muted'}`}>{p.published ? 'Publicado' : 'Borrador'}</span>
                    {p.featured && <span className="rounded-full bg-brand/30 px-2 py-0.5 text-xs text-brand-dark">Destacado</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">{all.length ? 'Ningún proyecto coincide con el filtro.' : 'Aún no hay proyectos. Crea el primero.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Cliente, ubicación en el mapa, ahorro y testimonio solo se publican con su autorización; el resto de la ficha se publica igual.</p>
    </div>
  );
}
