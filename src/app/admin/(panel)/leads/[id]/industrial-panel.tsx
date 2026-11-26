'use client';
import { startTransition, useActionState, useState } from 'react';
import { evaluateIndustrialAction } from '../../../actions';
import type { IndustrialRequestRecord } from '@/lib/data/types';
import { docKindLabel, EVAL_STATUS, EVAL_STYLE, OPERATING_HOURS, solutionLabel, VOLTAGE_LEVELS, type EvalStatus } from '@/lib/services/industrial';

const n = (v: number | null | undefined, unit: string) => (v == null ? null : `${v.toLocaleString('es-EC')} ${unit}`);
const pick = (list: readonly (readonly [string, string])[], v: string | null) => list.find(([k]) => k === v)?.[1] ?? null;
const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Solicitud industrial del lead: datos, documentos y evaluación de ingeniería. */
export function IndustrialPanel({ r, canEval, evaluatorName }: { r: IndustrialRequestRecord; canEval: boolean; evaluatorName: string | null }) {
  const [state, action, pending] = useActionState(evaluateIndustrialAction.bind(null, r.id), null);
  const [status, setStatus] = useState<EvalStatus>(r.eval_status);
  const d = r.details;
  const rows: [string, string | null][] = [
    ['Soluciones', r.solutions.map(solutionLabel).join(', ')], ['Sector', r.sector], ['RUC', r.ruc], ['Cargo del contacto', d.position || null],
    ['Ubicación', [d.site, d.city, d.province].filter(Boolean).join(' · ') || null],
    ['Consumo mensual', n(d.monthlyKwh, 'kWh')], ['Factura mensual', d.monthlyBillUsd == null ? null : `$${d.monthlyBillUsd.toLocaleString('es-EC')}`],
    ['Demanda', n(d.demandKw, 'kW')], ['Tensión', pick(VOLTAGE_LEVELS, d.voltage)], ['Operación', pick(OPERATING_HOURS, d.hours)], ['Superficie', n(d.areaM2, 'm²')],
    ['Mensaje', d.message || null],
  ];
  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Solicitud industrial</h2>
        <span className={`rounded-full px-2 py-0.5 text-xs ${EVAL_STYLE[r.eval_status]}`}>{EVAL_STATUS[r.eval_status]}</span>
      </div>
      <dl className="card mt-3 divide-y divide-line text-sm">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex flex-col gap-1 px-5 py-2.5 sm:flex-row sm:gap-4"><dt className="shrink-0 text-muted sm:w-40">{k}</dt><dd className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">{v}</dd></div>)}</dl>

      <h3 className="mt-5 text-sm font-semibold">Documentos ({r.documents.length})</h3>
      {r.documents.length === 0 ? <p className="mt-1 text-sm text-muted">El cliente no adjuntó documentos.</p> : (
        <ul className="card mt-2 divide-y divide-line text-sm">
          {r.documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
              <a href={`/admin/industrial/documentos/${doc.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 font-medium underline [overflow-wrap:anywhere]">{doc.filename}</a>
              <span className="text-xs text-muted">{docKindLabel(doc.kind)} · {fmtSize(doc.size_bytes)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Documentos de la empresa cliente: no los reenvíes fuera del equipo del proyecto.</p>

      <h3 className="mt-5 text-sm font-semibold">Evaluación de ingeniería</h3>
      {r.eval_notes || r.eval_kwp ? (
        <div className="card mt-2 p-4 text-sm">
          {r.eval_kwp != null && <p><span className="text-muted">Potencia estimada:</span> <b>{r.eval_kwp.toLocaleString('es-EC')} kWp</b></p>}
          {r.eval_notes && <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{r.eval_notes}</p>}
          {r.evaluated_at && <p className="mt-2 text-xs text-muted">Cerrada {new Date(r.evaluated_at).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil' })}{evaluatorName ? ` por ${evaluatorName}` : ''}</p>}
        </div>
      ) : <p className="mt-1 text-sm text-muted">Aún sin evaluación.</p>}

      {canEval && (
        // Envío manual: con <form action>, React reiniciaría el campo de observaciones ante un error.
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="card mt-3 grid gap-4 p-4 sm:grid-cols-2" noValidate>
          <div><label className="label" htmlFor="ev-status">Estado</label>
            <select id="ev-status" name="status" className="input" value={status} onChange={(e) => setStatus(e.target.value as EvalStatus)}>{(Object.keys(EVAL_STATUS) as EvalStatus[]).map((s) => <option key={s} value={s}>{EVAL_STATUS[s]}</option>)}</select></div>
          <div><label className="label" htmlFor="ev-kwp">Potencia estimada (kWp)</label><input id="ev-kwp" name="kwp" className="input" inputMode="decimal" defaultValue={r.eval_kwp ?? ''} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="ev-notes">Criterio y observaciones{status === 'evaluada' || status === 'descartada' ? ' *' : ''}</label>
            <textarea id="ev-notes" name="notes" rows={4} maxLength={4000} className="input" defaultValue={r.eval_notes ?? ''} placeholder="Cubierta o terreno, conexión, tensión, restricciones, alcance recomendado…" /></div>
          {!pending && state?.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 sm:col-span-2">{state.error}</p>}
          {!pending && state?.ok && <p role="status" className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800 sm:col-span-2">Evaluación guardada.</p>}
          <button className="btn-dark sm:col-span-2 sm:justify-self-start" disabled={pending}>{pending ? 'Guardando…' : 'Guardar evaluación'}</button>
        </form>
      )}
    </section>
  );
}
