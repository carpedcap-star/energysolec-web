import { notFound } from 'next/navigation';
import { getStore } from '@/lib/data/store';
import { requireStaff, can } from '@/lib/auth';
import { LEAD_STAGES } from '@/lib/data/types';
import { updateLeadAction } from '../../../actions';
import { fmtKwp, fmtUsd } from '@/lib/format';
import { waLink } from '@/lib/site';
import { staffNames } from '@/lib/staff-names';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff('leads');
  const { id } = await params;
  const store = getStore();
  const [l, acts, nameOf] = await Promise.all([store.getLead(id), store.listActivities(id), staffNames()]);
  if (!l || (staff.role === 'ventas' && l.advisor_id && l.advisor_id !== staff.id)) notFound();
  const editable = can(staff, 'leads_edit');
  const info: [string, string | null | undefined][] = [
    ['Correo', l.email], ['WhatsApp', l.phone], ['Empresa', l.company], ['Segmento', l.segment], ['Ubicación', [l.city, l.province].filter(Boolean).join(', ')],
    ['Consumo mensual', l.monthly_kwh ? `${l.monthly_kwh} kWh` : null], ['Factura mensual', l.monthly_bill_usd ? fmtUsd(l.monthly_bill_usd) : null],
    ['Potencia recomendada', l.recommended_kwp ? fmtKwp(l.recommended_kwp) : null], ['Inversión estimada', l.estimated_investment_usd ? fmtUsd(l.estimated_investment_usd) : null],
    ['Fuente', l.source], ['Campaña', Object.entries(l.utm ?? {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}=${v}`).join(' · ') || null],
    ['Registro', new Date(l.created_at).toLocaleString('es-EC')], ['Asesor', nameOf(l.advisor_id)], ['Observaciones', l.notes],
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div>
        <h1 className="text-2xl font-bold">{l.full_name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {l.phone && <a className="btn !bg-[#25D366] !py-2 text-white" target="_blank" rel="noopener" href={waLink(`Hola ${l.full_name.split(' ')[0]}, le saluda Energy Solutions Ecuador.`, l.phone.replace(/\D/g, '').replace(/^0/, '593'))}>WhatsApp</a>}
          <a className="btn-ghost !py-2" href={`mailto:${l.email}`}>Correo</a>
        </div>
        <dl className="card mt-6 divide-y divide-line text-sm">{info.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-4 px-5 py-3"><dt className="w-44 shrink-0 text-muted">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>)}</dl>
        <h2 className="mt-8 font-semibold">Historial de seguimiento</h2>
        <ol className="mt-3 space-y-3">{acts.map((a) => <li key={a.id} className="card p-4 text-sm"><p className="text-xs text-muted">{new Date(a.at).toLocaleString('es-EC')} · {a.kind}{a.actor ? ` · ${nameOf(a.actor)}` : ''}</p><p className="mt-1 whitespace-pre-line">{a.body}</p></li>)}</ol>
      </div>
      {editable && (
        <form action={updateLeadAction.bind(null, l.id)} className="card space-y-4 self-start p-5">
          <p className="font-semibold">Actualizar seguimiento</p>
          <div><label className="label" htmlFor="stage">Etapa</label><select id="stage" name="stage" defaultValue={l.stage} className="input">{LEAD_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div><label className="label" htmlFor="kind">Tipo de actividad</label><select id="kind" name="kind" className="input">{['nota', 'llamada', 'whatsapp', 'correo', 'visita', 'cotizacion'].map((k) => <option key={k}>{k}</option>)}</select></div>
          <div><label className="label" htmlFor="note">Detalle</label><textarea id="note" name="note" rows={3} className="input" /></div>
          <div><label className="label" htmlFor="next">Próxima actividad</label><input id="next" name="next_activity_at" type="datetime-local" className="input" /></div>
          <div><input name="next_activity_note" className="input" placeholder="Qué hay que hacer" /></div>
          <button className="btn-dark w-full">Guardar</button>
        </form>
      )}
    </div>
  );
}
