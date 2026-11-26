import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { EVAL_STATUS, EVAL_STYLE, solutionLabel, type EvalStatus } from '@/lib/services/industrial';
import { fmtEc } from '@/lib/services/followup';
import { staffNames } from '@/lib/staff-names';

export const metadata: Metadata = { title: 'Cotizaciones industriales', description: 'Solicitudes industriales y evaluación de ingeniería', robots: { index: false } };

const FILTERS: [string, string][] = [['', 'Todas'], ...(Object.entries(EVAL_STATUS) as [string, string][])];

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const staff = await requireStaff('industrial');
  const { estado = '' } = await searchParams;
  const [all, nameOf] = await Promise.all([getStore().listIndustrialRequests(), staffNames()]);
  // Ventas: sus leads y los sin asignar (misma regla que el CRM).
  const mine = staff.role === 'ventas' ? all.filter((r) => !r.advisor_id || r.advisor_id === staff.id) : all;
  const list = estado ? mine.filter((r) => r.eval_status === estado) : mine;
  const pending = mine.filter((r) => r.eval_status === 'pendiente').length;
  return (
    <div>
      <h1 className="text-2xl font-bold">Cotizaciones industriales</h1>
      <p className="mt-1 text-sm text-muted">Solicitudes de <Link href="/cotizacion-industrial" target="_blank" className="underline">/cotizacion-industrial</Link>. Cada una es un lead del CRM: Ventas da seguimiento e Ingeniería registra su evaluación en la ficha del lead.</p>
      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filtrar por estado de evaluación">
        {FILTERS.map(([v, l]) => <Link key={v} href={v ? `/admin/industrial?estado=${v}` : '/admin/industrial'} aria-current={estado === v ? 'page' : undefined} className={`rounded-full border px-3 py-1 text-sm ${estado === v ? 'border-brand-dark bg-brand-dark text-white' : 'border-line bg-white'}`}>{l}{v === 'pendiente' && pending ? ` (${pending})` : ''}</Link>)}
      </nav>
      <div className="card relative mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <caption className="sr-only">Cotizaciones industriales</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>{['Empresa', 'Soluciones', 'Documentos', 'Asesor', 'Recibida', 'Ingeniería'].map((h) => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="px-4 py-3"><Link href={`/admin/leads/${r.lead_id}`} className="font-medium hover:underline">{r.company}</Link><p className="text-xs text-muted">{r.sector} · {r.lead_name}</p></td>
                <td className="px-4 py-3">{r.solutions.map(solutionLabel).join(', ')}</td>
                <td className="px-4 py-3 tabular-nums">{r.documents.length}</td>
                <td className="px-4 py-3">{nameOf(r.advisor_id)}</td>
                <td className="whitespace-nowrap px-4 py-3">{fmtEc(r.created_at, { dateStyle: 'medium' })}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${EVAL_STYLE[r.eval_status as EvalStatus]}`}>{EVAL_STATUS[r.eval_status as EvalStatus]}</span>{r.eval_kwp != null && <p className="mt-1 text-xs text-muted">{r.eval_kwp.toLocaleString('es-EC')} kWp</p>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No hay solicitudes {estado ? 'con ese estado' : 'todavía'}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
