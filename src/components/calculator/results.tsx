'use client';
import { useSiteContact } from '../site-contact';
import { useState } from 'react';
import type { StudyResult } from '@/lib/engine/study';
import { fmtKwh, fmtKwp, fmtNum, fmtPct, fmtUsd, fmtYears, MONTHS_ES } from '@/lib/format';
import { waLink } from '@/lib/site';
import { IconLeaf, IconWhatsapp } from '../icons';
import { track } from '../consent';
import { AlternativesComparison } from './alternatives';

type Sc = 'conservador' | 'base' | 'optimista';

export function StudyResults({ r, code, token }: { r: StudyResult; code: string; token: string }) {
  const [sc, setSc] = useState<Sc>('base');
  const f = r.scenarios[sc], z = r.sizing;
  const [visit, setVisit] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  async function requestVisit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setVisit('sending');
    const preferred = new FormData(e.currentTarget).get('preferred') as string;
    const res = await fetch('/api/study/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, token, preferred }) }).catch(() => null);
    setVisit(res?.ok ? 'ok' : 'error'); if (res?.ok) track('visit_requested', { code });
  }
  const company = useSiteContact();
  const wa = waLink(`Hola, acabo de generar mi estudio solar ${code} (${fmtKwp(z.kwp)}). Quisiera conversar con un asesor.`, company.whatsapp);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Estudio {code}</p>
          <h2 className="font-display mt-2 text-3xl font-extrabold sm:text-4xl">Tu sistema recomendado: {fmtKwp(z.kwp)}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/study/${code}/pdf?t=${token}`} target="_blank" rel="noopener" className="btn-dark" onClick={() => track('report_download', { code })}>Descargar reporte PDF</a>
          <a href={wa} target="_blank" rel="noopener" className="btn bg-[#25D366] text-white" onClick={() => track('whatsapp_click', { from: 'study' })}><IconWhatsapp className="h-5 w-5" /> Continuar por WhatsApp</a>
        </div>
      </div>

      {r.warnings.length > 0 && (
        <div className="space-y-2">{r.warnings.map((w) => <p key={w} className="rounded-xl border-l-4 border-brand bg-amber-50 px-4 py-3 text-sm text-amber-950">{w}</p>)}</div>
      )}

      <AlternativesComparison r={r} />

      {r.alternatives?.length ? <h3 className="font-display text-2xl font-extrabold">Detalle del sistema conectado a la red</h3> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi v={fmtKwp(z.kwp)} l={`${z.modules} módulos · inversor ${fmtNum(z.inverterKw)} kW`} />
        <Kpi v={fmtKwh(z.annualGeneration)} l="Generación estimada año 1" />
        <Kpi v={fmtPct(z.coverage)} l="Cobertura de tu consumo" />
        <Kpi v={`${fmtNum(z.areaM2, 0)} m²`} l="Superficie requerida" />
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">Consumo frente a generación mensual</p>
          <div className="flex gap-4 text-xs text-muted"><Lg c="#c9c6c3" t="Consumo" /><Lg c="#FDC913" t="Generación" /><Lg c="#0082AA" t="Autoconsumo" /></div>
        </div>
        <MonthlyBars cons={r.consumption.monthlyKwh} gen={z.monthlyGeneration} self={z.monthlySelfConsumed} />
        <p className="mt-3 text-xs text-muted">Consumo anual {fmtKwh(r.consumption.annualKwh)}{r.consumption.estimatedFromBill ? ' (estimado desde tu factura)' : ''}. Rendimiento específico {fmtNum(z.specificYieldYear1, 0)} kWh/kWp/año. Fuente: {r.resource.source}.{r.resource.notes?.length ? ` ${r.resource.notes.join(' ')}` : ''}</p>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-6">
          <p className="font-semibold">Resultados económicos</p>
          <div role="tablist" className="inline-flex rounded-full bg-surface p-1 text-sm">
            {(['conservador', 'base', 'optimista'] as Sc[]).map((k) => (
              <button key={k} role="tab" aria-selected={sc === k} onClick={() => setSc(k)} className={`rounded-full px-4 py-1.5 capitalize ${sc === k ? 'bg-brand-dark text-white' : 'text-muted'}`}>{k}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          <Cell v={fmtUsd(f.capex.total)} l="Inversión estimada (IVA incl.)" />
          <Cell v={fmtUsd(f.savingMonthYear1)} l="Ahorro mensual promedio" />
          <Cell v={fmtUsd(f.savingYear1)} l="Ahorro anual (año 1)" />
          <Cell v={fmtPct(f.billReduction)} l="Reducción de tu factura" />
          <Cell v={fmtYears(f.simplePayback)} l="Retorno simple" />
          <Cell v={fmtYears(f.discountedPayback)} l="Retorno descontado" />
          <Cell v={fmtUsd(f.npv)} l="Valor actual neto (VAN)" />
          <Cell v={f.irr == null ? 'n/d' : fmtPct(f.irr)} l="Tasa interna de retorno (TIR)" />
          <Cell v={`$${f.lcoe.toFixed(3)}`} l="Costo nivelado (LCOE) USD/kWh" />
          <Cell v={fmtUsd(f.savings25)} l="Ahorro proyectado a 25 años" />
          <Cell v={fmtPct(f.roi)} l="Rentabilidad neta acumulada" />
          <Cell v={f.loan ? `${fmtUsd(f.loan.monthlyPayment)}/mes` : 'Contado'} l={f.loan ? `Cuota referencial ${f.loan.years} años` : 'Modalidad considerada'} />
        </div>
        <div className="p-6">
          <p className="mb-3 text-sm font-semibold">Flujo de caja acumulado</p>
          <CashBars cum={f.cumulative} />
          <p className="mt-3 text-xs text-muted">Tu factura no desaparece: los cargos fijos{r.tariff.code.includes('-D') ? ', el cargo por demanda' : ''} y la energía nocturna se siguen pagando. Factura anual actual estimada {fmtUsd(f.billBeforeYear)} → con el sistema {fmtUsd(f.billAfterYear)}.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div className="card flex gap-4 p-6">
          <IconLeaf className="h-8 w-8 shrink-0 text-brand-accent" />
          <div><p className="font-semibold">Beneficio ambiental</p><p className="mt-1 text-sm text-muted">{fmtNum(r.environment.co2TonsYear)} t de CO₂ evitadas por año ({fmtNum(r.environment.co2Tons25, 0)} t en 25 años), equivalente a {fmtNum(r.environment.treesEquivalent, 0)} árboles al año.</p></div>
        </div>
        <form onSubmit={requestVisit} className="card bg-brand-dark p-6 text-white">
          <p className="font-semibold">Solicita una visita técnica</p>
          {visit === 'ok' ? <p className="mt-2 text-sm text-white/75" role="status">Listo. Un asesor te contactará para coordinar la visita.</p> : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input name="preferred" maxLength={200} className="input !border-white/15 !bg-white/10 !text-white placeholder:text-white/40" placeholder="Día u horario preferido (opcional)" />
              <button className="btn-primary shrink-0" disabled={visit === 'sending'}>{visit === 'sending' ? 'Enviando…' : 'Solicitar visita'}</button>
            </div>
          )}
          {visit === 'error' && <p className="mt-2 text-sm text-red-300">No se pudo registrar. Escríbenos por WhatsApp.</p>}
        </form>
      </div>

      <details className="card p-6 text-sm">
        <summary className="cursor-pointer font-semibold">Supuestos técnicos y fuentes</summary>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-muted">{z.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        <p className="mt-4 font-medium">Pérdidas del sistema</p>
        <ul className="mt-2 grid gap-1 text-muted sm:grid-cols-2">{z.lossItems.map((l) => <li key={l.label}>{l.label}: {fmtNum(l.loss * 100)} %</li>)}</ul>
        <p className="mt-4 text-muted">Tarifa: {r.tariff.name}. {r.tariff.sourceNote}</p>
      </details>
      <p className="text-xs leading-relaxed text-muted">{r.disclaimer}</p>
    </div>
  );
}

const Kpi = ({ v, l }: { v: string; l: string }) => (
  <div className="card border-l-4 !border-l-brand p-5"><p className="font-display text-2xl font-extrabold">{v}</p><p className="mt-1 text-xs text-muted">{l}</p></div>
);
const Cell = ({ v, l }: { v: string; l: string }) => (
  <div className="bg-white p-5"><p className="font-display text-xl font-bold tabular-nums">{v}</p><p className="mt-1 text-xs text-muted">{l}</p></div>
);
const Lg = ({ c, t }: { c: string; t: string }) => <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{t}</span>;

function MonthlyBars({ cons, gen, self }: { cons: number[]; gen: number[]; self: number[] }) {
  const max = Math.max(...cons, ...gen) || 1, H = 180, W = 720, bw = W / 12;
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="mt-5 w-full" role="img" aria-label="Gráfico mensual de consumo y generación">
      {cons.map((c, i) => {
        const x = i * bw, hc = (c / max) * H, hg = (gen[i] / max) * H, hs = (self[i] / max) * H;
        return (
          <g key={i}>
            <title>{`${MONTHS_ES[i]}: consumo ${fmtNum(c, 0)} kWh, generación ${fmtNum(gen[i], 0)} kWh, autoconsumo ${fmtNum(self[i], 0)} kWh`}</title>
            <rect x={x + bw * 0.14} y={H - hc} width={bw * 0.32} height={hc} fill="#c9c6c3" rx="2" />
            <rect x={x + bw * 0.5} y={H - hg} width={bw * 0.32} height={hg} fill="#FDC913" rx="2" />
            <rect x={x + bw * 0.5} y={H - hs} width={bw * 0.32} height={hs} fill="#0082AA" rx="2" />
            <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="#6b6767">{MONTHS_ES[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function CashBars({ cum }: { cum: number[] }) {
  const max = Math.max(...cum.map(Math.abs)) || 1, H = 160, W = 720, bw = W / cum.length, mid = H / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} className="w-full" role="img" aria-label="Flujo de caja acumulado por año">
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="#d9d6d3" />
      {cum.map((v, i) => {
        const h = (Math.abs(v) / max) * (mid - 4);
        return <g key={i}><title>{`Año ${i}: ${fmtUsd(v)}`}</title><rect x={i * bw + bw * 0.18} y={v >= 0 ? mid - h : mid} width={bw * 0.64} height={Math.max(1, h)} fill={v >= 0 ? '#0082AA' : '#b9b5b2'} rx="1.5" /></g>;
      })}
      <text x="0" y={H + 16} fontSize="11" fill="#6b6767">Año 0</text>
      <text x={W} y={H + 16} fontSize="11" fill="#6b6767" textAnchor="end">Año {cum.length - 1}</text>
    </svg>
  );
}
