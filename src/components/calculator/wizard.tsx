'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PROVINCES, DISTRIBUTORS } from '@/lib/ecuador';
import { MONTHS_ES } from '@/lib/format';
import type { StudyResult } from '@/lib/engine/study';
import { StudyResults } from './results';
import { getUtm, track } from '../consent';
import { TURNSTILE_ERROR, useTurnstile } from '@/components/turnstile';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';
import { BillUpload, type BillResult } from './bill-upload';

type TariffOpt = { code: string; name: string; segment: string; voltage_level: string; has_demand_charge: boolean; is_placeholder: boolean };
type Seg = 'residencial' | 'comercial' | 'industrial';

const OBJECTIVES = [
  { id: 'reducir_factura', t: 'Reducir la factura eléctrica' },
  { id: 'autoconsumo', t: 'Maximizar el autoconsumo' },
  { id: 'respaldo', t: 'Respaldo ante apagones' },
  { id: 'almacenamiento', t: 'Incorporar almacenamiento' },
  { id: 'inversion', t: 'Evaluar una inversión fotovoltaica' },
];
const STEPS = ['Perfil', 'Ubicación', 'Consumo', 'Sitio'];

export function CalculatorWizard({ tariffs, initialSegment, initialObjective, billUpload = false }: { tariffs: TariffOpt[]; initialSegment?: Seg; initialObjective?: string; billUpload?: boolean }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Record<string, any>>({
    mode: 'rapida', segment: initialSegment ?? 'residencial', objective: initialObjective ?? 'reducir_factura', province: 'Guayas', city: '', address: '',
    distributor: '', tariffCode: '', input: 'bill', monthlyBillUsd: '', monthlyKwh: '', history: Array(12).fill(''), demandKw: '', peakHours: '', daytimePct: '',
    surface: 'cubierta', availableAreaM2: '', roofType: '', tilt: '10', shading: 'none', wantsBattery: false, backupHours: '', criticalLoadKw: '', budgetUsd: '', lat: null, lng: null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const human = useTurnstile(TURNSTILE_ACTIONS.study);
  const [pending, setPending] = useState<{ code: string; teaser: { kwp: number; modules: number; annualGeneration: number } } | null>(null);
  const [done, setDone] = useState<{ r: StudyResult; token: string } | null>(null);
  // Planilla leída con IA: los datos propuestos llenan el formulario; el cliente debe revisarlos y confirmarlos.
  const [bill, setBill] = useState<BillResult | null>(null);
  const [billOk, setBillOk] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const segTariffs = useMemo(() => tariffs.filter((t) => t.segment === f.segment), [tariffs, f.segment]);
  const pro = f.mode === 'profesional';

  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => { set('lat', +p.coords.latitude.toFixed(5)); set('lng', +p.coords.longitude.toFixed(5)); }, () => setErr('No pudimos obtener tu ubicación; usaremos la provincia.'));
  }

  function applyBill(b: BillResult) {
    const p = b.proposal;
    setF((x) => ({
      ...x, input: p.input, monthlyKwh: p.monthlyKwh, monthlyBillUsd: p.monthlyBillUsd,
      history: p.input === 'history' ? p.history : x.history, demandKw: p.demandKw || x.demandKw, distributor: p.distributor || x.distributor,
    }));
    setBill(b); setBillOk(false); setErr('');
  }

  function validStep(): string {
    if (step === 2) {
      if (bill && !billOk) return 'Revisa los datos leídos de tu planilla y confirma que son correctos.';
      if (pro && f.input === 'history' && f.history.filter((h: string) => +h > 0).length < 12) return 'Completa los 12 meses de consumo.';
      if (f.input === 'bill' && !(+f.monthlyBillUsd > 0)) return 'Ingresa el valor de tu factura mensual.';
      if (f.input === 'kwh' && !(+f.monthlyKwh > 0)) return 'Ingresa tu consumo mensual en kWh.';
    }
    return '';
  }

  async function calculate() {
    const v = validStep(); if (v) return setErr(v);
    setBusy(true); setErr('');
    const num = (x: string) => (x === '' || x == null ? undefined : Number(x));
    const body = {
      mode: f.mode, segment: f.segment, objective: f.objective, province: f.province, city: f.city, address: f.address,
      lat: f.lat ?? undefined, lng: f.lng ?? undefined, distributor: f.distributor || undefined, tariffCode: f.tariffCode || undefined,
      monthlyBillUsd: f.input === 'bill' ? num(f.monthlyBillUsd) : num(f.monthlyBillUsd) || undefined,
      monthlyKwh: f.input === 'kwh' ? num(f.monthlyKwh) : undefined,
      monthlyHistoryKwh: f.input === 'history' ? f.history.map(Number) : undefined,
      demandKw: num(f.demandKw) ?? 0, peakHours: f.peakHours || undefined, daytimeShare: f.daytimePct ? Number(f.daytimePct) / 100 : undefined,
      surface: f.surface, availableAreaM2: num(f.availableAreaM2), roofType: f.roofType || undefined, tilt: num(f.tilt) ?? 10, shading: f.shading,
      wantsBattery: f.wantsBattery, backupHours: num(f.backupHours), criticalLoadKw: num(f.criticalLoadKw), budgetUsd: num(f.budgetUsd),
      billUploadId: bill && billOk ? bill.uploadId : undefined,
    };
    track('calculator_submit', { segment: f.segment, mode: f.mode });
    const r = await fetch('/api/study', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr((await r?.json().catch(() => null))?.error ?? 'No se pudo calcular. Inténtalo de nuevo.');
    setPending(await r.json());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function unlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    const turnstileToken = await human.getToken().catch(() => null);
    if (turnstileToken === null) { setBusy(false); return setErr(TURNSTILE_ERROR); }
    const r = await fetch('/api/study/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      code: pending!.code, name: d.get('name'), email: d.get('email'), phone: d.get('phone') || '', company: d.get('company') || '',
      acceptPrivacy: d.get('privacy') === 'on', acceptMarketing: d.get('marketing') === 'on', utm: getUtm(), website: d.get('website') || '', turnstileToken,
    }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr((await r?.json().catch(() => null))?.error ?? 'No se pudo enviar. Inténtalo de nuevo.');
    const j = await r.json();
    track('generate_lead', { source: 'calculadora', segment: f.segment, value: j.results.scenarios.base.capex.total, currency: 'USD' });
    setDone({ r: j.results, token: j.token });
    history.replaceState(null, '', `/calculadora/estudio/${pending!.code}?t=${j.token}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) return <StudyResults r={done.r} code={pending!.code} token={done.token} />;

  if (pending) return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="bg-brand-dark p-8 text-white">
          <p className="eyebrow !text-brand">Estudio {pending.code}</p>
          <h2 className="font-display mt-3 text-2xl font-extrabold sm:text-3xl">Tu estudio energético personalizado está listo.</h2>
          <p className="mt-2 text-white/70">Descubre cuánto puedes ahorrar con Energy Solutions Ecuador.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 p-4"><p className="text-white/60">Sistema recomendado</p><p className="font-display text-2xl font-bold text-brand">{pending.teaser.kwp.toLocaleString('es-EC')} kWp</p></div>
            <div className="rounded-xl bg-white/10 p-4 blur-[1px]"><p className="text-white/60">Ahorro, retorno, VAN y TIR</p><p className="font-display text-2xl font-bold">$ ••••</p></div>
          </div>
        </div>
        <form onSubmit={unlock} className="grid gap-4 p-8 sm:grid-cols-2">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <div><label className="label" htmlFor="u-name">Nombre *</label><input id="u-name" name="name" required minLength={2} className="input" autoComplete="name" /></div>
          <div><label className="label" htmlFor="u-email">Correo electrónico *</label><input id="u-email" name="email" type="email" required className="input" autoComplete="email" /></div>
          <div><label className="label" htmlFor="u-phone">WhatsApp</label><input id="u-phone" name="phone" type="tel" className="input" placeholder="+593 9X XXX XXXX" autoComplete="tel" /></div>
          {f.segment !== 'residencial' && <div><label className="label" htmlFor="u-company">Empresa</label><input id="u-company" name="company" className="input" autoComplete="organization" /></div>}
          <div className="space-y-2 text-sm text-muted sm:col-span-2">
            <label className="flex items-start gap-2"><input type="checkbox" name="privacy" required className="mt-1" /> <span>Acepto la <Link href="/privacidad" target="_blank" className="underline">política de privacidad</Link> y el tratamiento de mis datos para generar y enviarme este estudio. *</span></label>
            <label className="flex items-start gap-2"><input type="checkbox" name="marketing" className="mt-1" /> <span>Autorizo recibir información comercial de Energy Solutions Ecuador (opcional; no es necesario para recibir tu estudio).</span></label>
          </div>
          {human.slot && <div className="sm:col-span-2">{human.slot}</div>}
          {err && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{err}</p>}
          <button className="btn-primary sm:col-span-2" disabled={busy}>{busy ? 'Preparando…' : 'Ver mi estudio y recibirlo por correo'}</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className="text-xs"><div className={`h-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} /><p className={`mt-2 ${i === step ? 'font-semibold' : 'text-muted'}`}>{i + 1}. {s}</p></li>
        ))}
      </ol>
      <div className="card p-6 sm:p-8">
        {step === 0 && (
          <div className="space-y-7">
            <Field label="Modalidad">
              <Choice value={f.mode} onChange={(v) => { set('mode', v); if (v === 'rapida' && f.input === 'history') set('input', 'bill'); }} options={[['rapida', 'Calculadora rápida', 'Solo conozco el valor de mi factura'], ['profesional', 'Calculadora profesional', 'Tengo consumos históricos, tarifa y demanda']]} />
            </Field>
            <Field label="Tipo de cliente">
              <Choice value={f.segment} onChange={(v) => { set('segment', v); set('tariffCode', ''); }} options={[['residencial', 'Residencial'], ['comercial', 'Comercial'], ['industrial', 'Industrial']]} />
            </Field>
            <Field label="Objetivo del sistema">
              <div className="grid gap-2 sm:grid-cols-2">{OBJECTIVES.map((o) => (
                <label key={o.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${f.objective === o.id ? 'border-brand-dark bg-surface font-medium' : 'border-line'}`}>
                  <input type="radio" name="objective" checked={f.objective === o.id} onChange={() => set('objective', o.id)} /> {o.t}
                </label>))}</div>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Provincia *"><select className="input" value={f.province} onChange={(e) => set('province', e.target.value)}>{PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}</select></Field>
            <Field label="Ciudad"><input className="input" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={80} /></Field>
            <Field label="Dirección o referencia" className="sm:col-span-2"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={200} /></Field>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3 text-sm">
              <button type="button" onClick={locate} className="btn-ghost !py-2">Usar mi ubicación actual</button>
              <span className="text-muted">{f.lat ? `Ubicación: ${f.lat}, ${f.lng}` : 'Si no la compartes, usamos la capital de tu provincia.'}</span>
            </div>
            <Field label="Empresa distribuidora"><select className="input" value={f.distributor} onChange={(e) => set('distributor', e.target.value)}><option value="">No lo sé</option>{DISTRIBUTORS.map((d) => <option key={d}>{d}</option>)}</select></Field>
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-5 sm:grid-cols-2">
            {billUpload && <div className="sm:col-span-2"><BillUpload mode={f.mode} result={bill} onRead={applyBill} onDiscard={() => { setBill(null); setBillOk(false); setErr(''); }} /></div>}
            <Field label="¿Qué dato tienes?" className="sm:col-span-2">
              <Choice value={f.input} onChange={(v) => set('input', v)} options={[['bill', 'Valor de la factura (USD)'], ['kwh', 'Consumo mensual (kWh)'], ...(pro ? [['history', '12 meses de consumo']] as [string, string][] : [])]} />
            </Field>
            {f.input === 'bill' && <Field label="Factura mensual promedio (USD) *"><input className="input" type="number" min={1} step="any" inputMode="decimal" value={f.monthlyBillUsd} onChange={(e) => set('monthlyBillUsd', e.target.value)} /></Field>}
            {f.input === 'kwh' && <>
              <Field label="Consumo mensual promedio (kWh) *"><input className="input" type="number" min={1} inputMode="numeric" value={f.monthlyKwh} onChange={(e) => set('monthlyKwh', e.target.value)} /></Field>
              <Field label="Valor de la factura (USD, opcional)"><input className="input" type="number" min={1} step="any" value={f.monthlyBillUsd} onChange={(e) => set('monthlyBillUsd', e.target.value)} /></Field>
            </>}
            {f.input === 'history' && (
              <div className="sm:col-span-2"><p className="label">Consumo de los últimos 12 meses (kWh) *</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{MONTHS_ES.map((m, i) => (
                  <label key={m} className="text-xs text-muted">{m}<input className="input mt-1 !px-2" type="number" min={0} value={f.history[i]} onChange={(e) => set('history', f.history.map((h: string, j: number) => (j === i ? e.target.value : h)))} /></label>
                ))}</div>
              </div>
            )}
            <Field label="Tarifa eléctrica">
              <select className="input" value={f.tariffCode} onChange={(e) => set('tariffCode', e.target.value)}>
                <option value="">Asignar según tipo de cliente</option>
                {segTariffs.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.voltage_level}){t.is_placeholder ? ' — provisional' : ''}</option>)}
              </select>
            </Field>
            {(pro || f.segment !== 'residencial') && <Field label="Demanda facturable (kW)"><input className="input" type="number" min={0} value={f.demandKw} onChange={(e) => set('demandKw', e.target.value)} /></Field>}
            <Field label="Horario de mayor consumo">
              <select className="input" value={f.peakHours} onChange={(e) => set('peakHours', e.target.value)}>
                <option value="">No lo sé</option><option value="manana">Mañana</option><option value="mediodia">Mediodía</option><option value="tarde">Tarde</option><option value="noche">Noche</option><option value="continuo">24 horas / continuo</option>
              </select>
            </Field>
            {pro && <Field label="% de consumo diurno (6h–18h)"><input className="input" type="number" min={5} max={100} value={f.daytimePct} onChange={(e) => set('daytimePct', e.target.value)} /></Field>}
            {bill && (
              <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm sm:col-span-2">
                <input type="checkbox" checked={billOk} onChange={(e) => { setBillOk(e.target.checked); setErr(''); }} className="mt-1" />
                <span><b>Revisé los datos de consumo y son correctos.</b> El estudio se calculará con los valores de este formulario.</span>
              </label>
            )}
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Dónde se instalaría"><Choice value={f.surface} onChange={(v) => set('surface', v)} options={[['cubierta', 'Cubierta / techo'], ['terreno', 'Terreno']]} /></Field>
            <Field label="Superficie disponible (m²)"><input className="input" type="number" min={1} value={f.availableAreaM2} onChange={(e) => set('availableAreaM2', e.target.value)} placeholder="Opcional" /></Field>
            <Field label="Tipo de cubierta o terreno"><select className="input" value={f.roofType} onChange={(e) => set('roofType', e.target.value)}><option value="">Selecciona</option>{['Losa de hormigón', 'Metálica (galvalume/steel panel)', 'Teja', 'Fibrocemento', 'Terreno plano', 'Terreno con pendiente', 'Reservorio / agua'].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Inclinación (°)"><input className="input" type="number" min={0} max={45} value={f.tilt} onChange={(e) => set('tilt', e.target.value)} /></Field>
            <Field label="Sombras sobre el área" className="sm:col-span-2"><Choice value={f.shading} onChange={(v) => set('shading', v)} options={[['none', 'Sin sombras'], ['partial', 'Sombras parciales'], ['significant', 'Sombras importantes']]} /></Field>
            <label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={f.wantsBattery} onChange={(e) => set('wantsBattery', e.target.checked)} /> Necesito baterías / respaldo</label>
            {(f.wantsBattery || f.objective === 'respaldo') && <>
              <Field label="Potencia de cargas críticas (kW)"><input className="input" type="number" min={0} step="any" value={f.criticalLoadKw} onChange={(e) => set('criticalLoadKw', e.target.value)} /></Field>
              <Field label="Horas de respaldo deseadas"><input className="input" type="number" min={0} max={48} value={f.backupHours} onChange={(e) => set('backupHours', e.target.value)} /></Field>
            </>}
            <Field label="Presupuesto aproximado (USD)"><input className="input" type="number" min={0} value={f.budgetUsd} onChange={(e) => set('budgetUsd', e.target.value)} placeholder="Opcional" /></Field>
          </div>
        )}
        {err && <p className="mt-5 text-sm text-red-600" role="alert">{err}</p>}
        <div className="mt-8 flex justify-between gap-3">
          <button type="button" className="btn-ghost" onClick={() => { setErr(''); setStep(step - 1); }} disabled={step === 0}>Atrás</button>
          {step < 3
            ? <button type="button" className="btn-dark" onClick={() => { const v = validStep(); if (v) return setErr(v); setErr(''); setStep(step + 1); }}>Continuar</button>
            : <button type="button" className="btn-primary" onClick={calculate} disabled={busy}>{busy ? 'Consultando irradiación y calculando…' : 'Calcular mi estudio'}</button>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><p className="label">{label}</p>{children}</div>;
}
function Choice({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: ([string, string] | [string, string, string])[] }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map(([v, t, d]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={`rounded-xl border px-4 py-2.5 text-left text-sm transition ${value === v ? 'border-brand-dark bg-brand-dark text-white' : 'border-line bg-white hover:border-ink'}`}>
          <span className="font-medium">{t}</span>{d && <span className={`block text-xs ${value === v ? 'text-white/70' : 'text-muted'}`}>{d}</span>}
        </button>
      ))}
    </div>
  );
}
