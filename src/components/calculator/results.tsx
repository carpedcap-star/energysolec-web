'use client';
import { useSiteContact } from '../site-contact';
import { useState } from 'react';
import type { StudyResult } from '@/lib/engine/study';
import { fmtKwp, fmtNum, fmtUsd, fmtYears } from '@/lib/format';
import { waLink } from '@/lib/site';
import { IconWhatsapp } from '../icons';
import { track } from '../consent';
import { AlternativesComparison } from './alternatives';

/** Resultados para el cliente: lo esencial a la vista; VAN, TIR y detalles técnicos van en el informe PDF. */
export function StudyResults({ r, code, token }: { r: StudyResult; code: string; token: string }) {
  const z = r.sizing, f = r.scenarios.base;
  const [visit, setVisit] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  async function requestVisit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setVisit('sending');
    const preferred = new FormData(e.currentTarget).get('preferred') as string;
    const res = await fetch('/api/study/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, token, preferred }) }).catch(() => null);
    setVisit(res?.ok ? 'ok' : 'error'); if (res?.ok) track('visit_requested', { code });
  }
  const company = useSiteContact();
  const wa = waLink(`Hola, acabo de generar mi estudio solar ${code} (${fmtKwp(z.kwp)}). Quisiera conversar con un asesor y enviar fotos del lugar.`, company.whatsapp);
  const critical = r.criticalWarnings ?? [];
  const rest = r.warnings.filter((w) => !critical.includes(w));
  const legacy = !r.alternatives?.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Estudio {code}</p>
          <h2 className="font-display mt-2 text-3xl font-extrabold [overflow-wrap:anywhere] sm:text-4xl">Tu sistema recomendado: {fmtKwp(z.kwp)}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/study/${code}/pdf?t=${token}`} target="_blank" rel="noopener" className="btn-dark" onClick={() => track('report_download', { code })}>Descargar informe PDF</a>
          <a href={wa} target="_blank" rel="noopener" className="btn bg-[#25D366] text-white" onClick={() => track('whatsapp_click', { from: 'study' })}><IconWhatsapp className="h-5 w-5" /> Continuar por WhatsApp</a>
        </div>
      </div>

      {critical.length > 0 && (
        <div className="space-y-2" role="note">{critical.map((w) => <p key={w} className="rounded-xl border-l-4 border-brand bg-amber-50 px-4 py-3 text-sm text-amber-950">{w}</p>)}</div>
      )}

      <AlternativesComparison r={r} />

      {legacy && (
        <div className="card grid gap-px overflow-hidden bg-line sm:grid-cols-2 lg:grid-cols-4">
          {([
            [fmtKwp(z.kwp), 'Potencia'], [String(z.modules), 'Paneles'], [fmtUsd(f.capex.total), 'Inversión (IVA incl.)'], [fmtUsd(f.savingMonthYear1), 'Ahorro mensual'],
            [fmtUsd(f.savingYear1), 'Ahorro anual'], [`${fmtUsd(f.billAfterYear / 12)}/mes`, 'Factura residual'], [fmtYears(f.simplePayback), 'Retorno simple'], [`${fmtNum(z.areaM2, 0)} m²`, 'Superficie'],
          ] as [string, string][]).map(([v, l]) => <div key={l} className="bg-white p-5"><p className="font-display text-xl font-bold tabular-nums">{v}</p><p className="mt-1 text-xs text-muted">{l}</p></div>)}
        </div>
      )}

      {rest.length > 0 && (
        <details className="card p-5 text-sm">
          <summary className="cursor-pointer font-semibold">Supuestos y advertencias del cálculo ({rest.length + (r.alternatives ?? []).reduce((a, x) => a + x.warnings.length, 0)})</summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">{rest.map((w) => <li key={w}>{w}</li>)}</ul>
          {(r.alternatives ?? []).filter((a) => a.warnings.length).map((a) => (
            <div key={a.key} className="mt-3"><p className="font-medium">{a.name}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
          ))}
        </details>
      )}

      <form onSubmit={requestVisit} className="card bg-brand-dark p-6 text-white">
        <p className="font-semibold">Solicita una visita técnica</p>
        <p className="mt-1 text-sm text-white/70">Confirmamos el espacio, las sombras y tu tablero eléctrico. También puedes enviarnos fotos por WhatsApp.</p>
        {visit === 'ok' ? <p className="mt-2 text-sm text-white/75" role="status">Listo. Un asesor te contactará para coordinar la visita.</p> : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="v-pref">Día u horario preferido</label>
            <input id="v-pref" name="preferred" maxLength={200} className="input !border-white/15 !bg-white/10 !text-white placeholder:text-white/40" placeholder="Día u horario preferido (opcional)" />
            <button className="btn-primary shrink-0" disabled={visit === 'sending'}>{visit === 'sending' ? 'Enviando…' : 'Solicitar visita'}</button>
          </div>
        )}
        {visit === 'error' && <p className="mt-2 text-sm text-red-300" role="alert">No se pudo registrar. Escríbenos por WhatsApp.</p>}
      </form>
      <p className="text-xs leading-relaxed text-muted">{r.disclaimer}</p>
    </div>
  );
}
