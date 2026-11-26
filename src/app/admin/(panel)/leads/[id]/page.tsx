import { notFound } from 'next/navigation';
import { getStore } from '@/lib/data/store';
import { requireStaff, can } from '@/lib/auth';
import { LEAD_STAGES } from '@/lib/data/types';
import { updateLeadAction } from '../../../actions';
import { fmtKwp, fmtUsd } from '@/lib/format';
import { waLink } from '@/lib/site';
import { staffNames } from '@/lib/staff-names';
import { BillPanel } from './bill-panel';
import { IndustrialPanel } from './industrial-panel';
import { StudyPanel } from './study-panel';
import { fmtEc, toEcLocal } from '@/lib/services/followup';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff('leads');
  const { id } = await params;
  const store = getStore();
  const [l, acts, nameOf, users] = await Promise.all([store.getLead(id), store.listActivities(id), staffNames(), can(staff, 'assign_leads') ? store.listUsers() : Promise.resolve([])]);
  const advisors = users.filter((u) => u.active && u.is_advisor);
  if (!l || (staff.role === 'ventas' && l.advisor_id && l.advisor_id !== staff.id)) notFound();
  const editable = can(staff, 'leads_edit');
  const bills = can(staff, 'bills') ? await store.listBillUploadsForLead(l.id) : [];
  const studies = await store.listStudiesForLead(l.id);
  const industrial = can(staff, 'industrial') ? await store.listIndustrialRequestsForLead(l.id) : [];
  const info: [string, string | null | undefined][] = [
    ['Correo', l.email], ['WhatsApp', l.phone], ['Empresa', l.company], ['Segmento', l.segment], ['Ubicación', [l.city, l.province].filter(Boolean).join(', ')],
    ['Consumo mensual', l.monthly_kwh ? `${l.monthly_kwh} kWh` : null], ['Factura mensual', l.monthly_bill_usd ? fmtUsd(l.monthly_bill_usd) : null],
    ['Potencia recomendada', l.recommended_kwp ? fmtKwp(l.recommended_kwp) : null], ['Inversión estimada', l.estimated_investment_usd ? fmtUsd(l.estimated_investment_usd) : null],
    ['Fuente', l.source], ['Campaña', Object.entries(l.utm ?? {}).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}=${v}`).join(' · ') || null],
    ['Registro', fmtEc(l.created_at)], ['Asesor', nameOf(l.advisor_id)],
    ['Próxima actividad', l.next_activity_at ? `${fmtEc(l.next_activity_at)}${Date.parse(l.next_activity_at) < Date.now() ? ' (vencida)' : ''}${l.next_activity_note ? ` · ${l.next_activity_note}` : ''}` : null],
    ['Observaciones', l.notes],
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{l.full_name}</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {l.phone && <a className="btn !bg-[#25D366] !py-2 text-white" target="_blank" rel="noopener" href={waLink(`Hola ${l.full_name.split(' ')[0]}, le saluda Energy Solutions Ecuador.`, l.phone.replace(/\D/g, '').replace(/^0/, '593'))}>WhatsApp</a>}
          <a className="btn-ghost !py-2" href={`mailto:${l.email}`}>Correo</a>
        </div>
        <dl className="card mt-6 divide-y divide-line text-sm">{info.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-4 px-5 py-3"><dt className="w-44 shrink-0 text-muted">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>)}</dl>
        {studies.length > 0 && <StudyPanel studies={studies} />}
        {industrial.map((r) => <IndustrialPanel key={r.id} r={r} canEval={can(staff, 'industrial_eval')} evaluatorName={r.evaluated_by ? nameOf(r.evaluated_by) : null} />)}
        {bills.length > 0 && <BillPanel bills={bills} />}
        <h2 className="mt-8 font-semibold">Historial de seguimiento</h2>
        <ol className="mt-3 space-y-3">{acts.map((a) => <li key={a.id} className="card p-4 text-sm"><p className="text-xs text-muted">{fmtEc(a.at)} · {a.kind}{a.actor ? ` · ${nameOf(a.actor)}` : ''}</p><p className="mt-1 whitespace-pre-line">{a.body}</p></li>)}</ol>
      </div>
      {editable && (
        <form action={updateLeadAction.bind(null, l.id)} className="card space-y-4 self-start p-5">
          <p className="font-semibold">Actualizar seguimiento</p>
          <div><label className="label" htmlFor="stage">Etapa</label><select id="stage" name="stage" defaultValue={l.stage} className="input">{LEAD_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
          <div><label className="label" htmlFor="kind">Tipo de actividad</label><select id="kind" name="kind" className="input">{['nota', 'llamada', 'whatsapp', 'correo', 'visita', 'cotizacion'].map((k) => <option key={k}>{k}</option>)}</select></div>
          <div><label className="label" htmlFor="note">Detalle</label><textarea id="note" name="note" rows={3} className="input" /></div>
          {can(staff, 'assign_leads') && (
            <div><label className="label" htmlFor="advisor">Asesor</label>
              <select id="advisor" name="advisor_id" defaultValue={l.advisor_id ?? ''} className="input"><option value="">Sin asignar</option>{advisors.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select>
              <p className="mt-1 text-xs text-muted">El asesor recibe un aviso por correo.</p></div>
          )}
          <div><label className="label" htmlFor="next">Próxima actividad (hora de Ecuador)</label><input id="next" name="next_activity_at" type="datetime-local" className="input" defaultValue={toEcLocal(l.next_activity_at)} /></div>
          <div><label className="sr-only" htmlFor="next-note">Qué hay que hacer</label><input id="next-note" name="next_activity_note" className="input" placeholder="Qué hay que hacer" maxLength={300} defaultValue={l.next_activity_note ?? ''} /></div>
          {l.next_activity_at && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="activity_done" /> Actividad realizada (quitar recordatorio)</label>}
          <p className="text-xs text-muted">Recibirás un recordatorio por correo la mañana del día de la actividad.</p>
          <button className="btn-dark w-full">Guardar</button>
        </form>
      )}
    </div>
  );
}
