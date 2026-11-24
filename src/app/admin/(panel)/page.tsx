import Link from 'next/link';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { LEAD_STAGES, PAID_STATES } from '@/lib/data/types';
import { fmtKwp, fmtNum, fmtPct, fmtUsd } from '@/lib/format';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await requireStaff();
  const { denied } = await searchParams;
  const store = getStore();
  const [leads, orders, calcs, pageViews] = await Promise.all([store.listLeads(), store.listOrders(), store.countEvents('calc_completed', 30), store.countEvents('page_view', 30)]);
  const since = Date.now() - 30 * 864e5;
  const recent = leads.filter((l) => Date.parse(l.created_at) >= since);
  const open = leads.filter((l) => !['ganado', 'perdido'].includes(l.stage));
  const pipelineValue = open.reduce((a, l) => a + (l.estimated_investment_usd ?? 0), 0);
  const mwpNegotiation = leads.filter((l) => ['cotizacion_enviada', 'negociacion'].includes(l.stage)).reduce((a, l) => a + (l.recommended_kwp ?? 0), 0);
  const won = leads.filter((l) => l.stage === 'ganado').length, closed = won + leads.filter((l) => l.stage === 'perdido').length;
  const resp = leads.filter((l) => l.first_contact_at).map((l) => (Date.parse(l.first_contact_at!) - Date.parse(l.created_at)) / 36e5);
  const bySource = Object.entries(recent.reduce<Record<string, number>>((a, l) => ((a[l.source] = (a[l.source] ?? 0) + 1), a), {}));
  const byCampaign = Object.entries(recent.reduce<Record<string, number>>((a, l) => { const c = l.utm?.utm_campaign ?? '(sin campaña)'; a[c] = (a[c] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const byAdvisor = Object.entries(leads.reduce<Record<string, { t: number; w: number }>>((a, l) => { const k = l.advisor_id ?? 'Sin asignar'; a[k] ??= { t: 0, w: 0 }; a[k].t++; if (l.stage === 'ganado') a[k].w++; return a; }, {}));
  const kpis: [string, string][] = [
    ['Leads (30 días)', fmtNum(recent.length, 0)], ['Calculadoras completadas (30 días)', fmtNum(calcs, 0)],
    ['Conversión calculadora → lead', calcs ? fmtPct(recent.filter((l) => l.source === 'calculadora').length / calcs) : '—'],
    ['Visitantes (30 días)', pageViews ? fmtNum(pageViews, 0) : 'Ver GA4'], ['Pedidos recibidos', fmtNum(orders.length, 0)],
    ['Ventas confirmadas (pago verificado)', fmtUsd(orders.filter((o) => PAID_STATES.includes(o.status)).reduce((a, o) => a + o.total, 0))],
    ['Valor del embudo abierto', fmtUsd(pipelineValue)], ['Potencia en cotización/negociación', fmtKwp(mwpNegotiation)],
    ['Tasa de cierre', closed ? fmtPct(won / closed) : '—'], ['Tiempo medio de primera respuesta', resp.length ? `${fmtNum(resp.reduce((a, b) => a + b, 0) / resp.length)} h` : '—'],
  ];
  return (
    <div>
      {denied && <p className="mb-6 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-800">Tu rol no tiene acceso a esa sección.</p>}
      <h1 className="text-2xl font-bold">Dashboard gerencial</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-5">{kpis.map(([l, v]) => <div key={l} className="card p-4"><p className="text-xl font-bold tabular-nums">{v}</p><p className="mt-1 text-xs text-muted">{l}</p></div>)}</div>
      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <div className="card p-5"><p className="font-semibold">Embudo comercial</p>
          <div className="mt-4 space-y-2">{LEAD_STAGES.map((s) => { const n = leads.filter((l) => l.stage === s.id).length; return (
            <Link key={s.id} href={`/admin/leads?stage=${s.id}`} className="flex items-center gap-3 text-sm"><span className="w-36 text-muted">{s.label}</span><span className="h-2 flex-1 rounded bg-line"><span className="block h-2 rounded bg-brand-accent" style={{ width: `${leads.length ? (n / leads.length) * 100 : 0}%` }} /></span><span className="w-8 text-right tabular-nums">{n}</span></Link>); })}</div>
        </div>
        <div className="card p-5"><p className="font-semibold">Leads por fuente y campaña (30 días)</p>
          <ul className="mt-4 space-y-1 text-sm">{bySource.map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><span>{v}</span></li>)}</ul>
          <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">{byCampaign.map(([k, v]) => <li key={k} className="flex justify-between"><span className="truncate text-muted">{k}</span><span>{v}</span></li>)}</ul>
        </div>
        <div className="card p-5"><p className="font-semibold">Conversión por asesor</p>
          <ul className="mt-4 space-y-1 text-sm">{byAdvisor.map(([k, v]) => <li key={k} className="flex justify-between"><span className="truncate text-muted">{k.slice(0, 18)}</span><span>{v.w}/{v.t}</span></li>)}</ul>
        </div>
      </div>
    </div>
  );
}
