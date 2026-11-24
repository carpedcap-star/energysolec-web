import Link from 'next/link';
import { getStore } from '@/lib/data/store';
import { requireStaff, can } from '@/lib/auth';
import { LEAD_STAGES, type LeadStage } from '@/lib/data/types';
import { fmtKwp, fmtUsd } from '@/lib/format';

export default async function Page({ searchParams }: { searchParams: Promise<{ stage?: string; mine?: string }> }) {
  const staff = await requireStaff('leads');
  const q = await searchParams;
  const stage = LEAD_STAGES.some((s) => s.id === q.stage) ? (q.stage as LeadStage) : undefined;
  let leads = await getStore().listLeads({ stage });
  if (staff.role === 'ventas') leads = leads.filter((l) => !l.advisor_id || l.advisor_id === staff.id);   // misma regla que la RLS
  const overdue = (d?: string | null) => d && Date.parse(d) < Date.now();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">CRM · Leads</h1>
        {can(staff, 'export') && <a href={`/api/admin/export?type=leads${stage ? `&stage=${stage}` : ''}`} className="btn-ghost !py-2">Exportar CSV</a>}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/leads" className={`rounded-full px-3 py-1 ${!stage ? 'bg-brand-dark text-white' : 'border border-line bg-white'}`}>Todos</Link>
        {LEAD_STAGES.map((s) => <Link key={s.id} href={`/admin/leads?stage=${s.id}`} className={`rounded-full px-3 py-1 ${stage === s.id ? 'bg-brand-dark text-white' : 'border border-line bg-white'}`}>{s.label}</Link>)}
      </div>
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted"><tr>{['Fecha', 'Nombre', 'Fuente', 'Segmento', 'Ciudad', 'Potencia', 'Inversión', 'Etapa', 'Próxima actividad'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id} className="border-t border-line hover:bg-surface">
                <td className="px-4 py-3 text-muted">{new Date(l.created_at).toLocaleDateString('es-EC')}</td>
                <td className="px-4 py-3"><Link href={`/admin/leads/${l.id}`} className="font-medium hover:underline">{l.full_name}</Link><p className="text-xs text-muted">{l.company ?? l.email}</p></td>
                <td className="px-4 py-3">{l.source}{l.utm?.utm_campaign && <p className="text-xs text-muted">{l.utm.utm_campaign}</p>}</td>
                <td className="px-4 py-3">{l.segment ?? '—'}</td>
                <td className="px-4 py-3">{l.city ?? l.province ?? '—'}</td>
                <td className="px-4 py-3">{l.recommended_kwp ? fmtKwp(l.recommended_kwp) : '—'}</td>
                <td className="px-4 py-3">{l.estimated_investment_usd ? fmtUsd(l.estimated_investment_usd) : '—'}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-surface px-2 py-0.5 text-xs">{LEAD_STAGES.find((s) => s.id === l.stage)?.label}</span></td>
                <td className={`px-4 py-3 text-xs ${overdue(l.next_activity_at) ? 'font-semibold text-red-700' : 'text-muted'}`}>{l.next_activity_at ? new Date(l.next_activity_at).toLocaleString('es-EC') : '—'}{l.next_activity_note && <p className="truncate">{l.next_activity_note}</p>}</td>
              </tr>
            ))}
            {!leads.length && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted">Sin leads.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
