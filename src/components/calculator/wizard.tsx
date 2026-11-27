'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PROVINCES } from '@/lib/ecuador';
import type { StudyResult } from '@/lib/engine/study';
import { StudyResults } from './results';
import { getUtm, track } from '../consent';
import { TURNSTILE_ERROR, useTurnstile } from '@/components/turnstile';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';
import { BillUpload, type BillResult } from './bill-upload';

type Seg = 'residencial' | 'comercial' | 'industrial';
export type DistributorOpt = { code: string; name: string };
export type CoverageOpt = { province: string; distributor: string; cantons?: Record<string, string> };
export type TariffChoices = Record<Seg, { key: string; label: string }[]>;

const STEPS = ['Tu consumo', 'Ubicación', 'Superficie'];
const SURFACES = [
  { id: 'techo', t: 'Techo', d: 'Metálico, teja o fibrocemento' },
  { id: 'losa', t: 'Losa', d: 'Terraza plana de hormigón' },
  { id: 'terreno', t: 'Terreno', d: 'Suelo libre junto a la propiedad' },
] as const;
type SurfaceId = (typeof SURFACES)[number]['id'];
type SurfaceVal = { area: string; unknown: boolean; roof: 'techo_metalico' | 'techo_inclinado' };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const provinceName = (s?: string | null) => (s ? PROVINCES.find((p) => norm(p.name) === norm(s))?.name : undefined);

export function CalculatorWizard({ initialSegment, initialObjective, billUpload = false, distributors, coverage, tariffChoices }: {
  initialSegment?: Seg; initialObjective?: string; billUpload?: boolean;
  distributors: DistributorOpt[]; coverage: CoverageOpt[]; tariffChoices: TariffChoices;
}) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Record<string, any>>({
    segment: initialSegment ?? 'residencial', province: 'Guayas', city: '', address: '', distributor: '', tariffCode: '',
    input: 'bill', monthlyBillUsd: '', monthlyKwh: '', history: Array(12).fill(''), demandKw: '',
    periodKwh: null, powerFactor: null, billedUsd: null, billedMonths: 0, lat: null, lng: null,
  });
  // Respaldo: solo si el visitante llegó buscando baterías; la autonomía híbrida es la predeterminada del administrador.
  const wantsBackup = initialObjective === 'respaldo' || initialObjective === 'almacenamiento';
  const [surfaces, setSurfaces] = useState<Partial<Record<SurfaceId, SurfaceVal>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [geo, setGeo] = useState('');
  const human = useTurnstile(TURNSTILE_ACTIONS.study);
  const [pending, setPending] = useState<{ code: string; teaser: { kwp: number; modules: number; annualGeneration: number } } | null>(null);
  const [done, setDone] = useState<{ r: StudyResult; token: string } | null>(null);
  // Planilla leída con IA: los datos propuestos llenan el formulario; el cliente debe revisarlos y confirmarlos.
  const [bill, setBill] = useState<BillResult | null>(null);
  const [billOk, setBillOk] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const seg = f.segment as Seg;

  const suggested = (() => {
    const c = coverage.find((x) => norm(x.province) === norm(f.province));
    if (!c) return null;
    const byCanton = f.city ? Object.entries(c.cantons ?? {}).find(([k]) => norm(k) === norm(f.city))?.[1] : undefined;
    return distributors.find((d) => d.code === (byCanton ?? c.distributor)) ?? null;
  })();

  function locate() {
    if (!navigator.geolocation) return setGeo('Tu navegador no permite compartir la ubicación.');
    setGeo('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = +p.coords.latitude.toFixed(5), lng = +p.coords.longitude.toFixed(5);
        if (lat < -5.1 || lat > 1.7 || lng < -92.1 || lng > -75) { setGeo('Esa ubicación está fuera de Ecuador; usaremos la provincia.'); return; }
        setF((x) => ({ ...x, lat, lng })); setGeo('');
      },
      () => setGeo('No pudimos obtener tu ubicación; usaremos la capital de tu provincia.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function applyBill(b: BillResult) {
    const p = b.proposal;
    setF((x) => ({
      ...x, input: p.input, monthlyKwh: p.monthlyKwh, monthlyBillUsd: p.monthlyBillUsd,
      history: p.input === 'history' ? p.history : x.history, demandKw: p.demandKw || x.demandKw,
      segment: p.segment ?? x.segment, tariffCode: p.tariffKey ?? x.tariffCode, distributor: p.distributor || x.distributor,
      province: provinceName(p.province) ?? x.province, city: p.canton ?? x.city, periodKwh: p.periodKwh ?? null, powerFactor: p.powerFactor ?? null,
      billedUsd: p.billedUsd ?? null, billedMonths: p.billedMonths ?? 0,
    }));
    setBill(b); setBillOk(false); setErr('');
  }

  function validStep(): string {
    if (step === 0) {
      if (bill && !billOk) return 'Revisa los datos leídos de tu planilla y confirma que son correctos.';
      if (f.input === 'history' && f.history.filter((h: string) => +h > 0).length < 12) return 'Indica tu consumo mensual promedio.';
      if (f.input === 'bill' && !(+f.monthlyBillUsd > 0)) return 'Ingresa el valor de tu factura mensual.';
      if (f.input === 'kwh' && !(+f.monthlyKwh > 0)) return 'Ingresa tu consumo mensual en kWh.';
    }
    if (step === 2) {
      for (const s of SURFACES) {
        const v = surfaces[s.id];
        if (v && !v.unknown && !(+v.area > 0)) return `Indica los m² de «${s.t}» o marca «No conozco el área».`;
      }
    }
    return '';
  }

  async function calculate() {
    const v = validStep(); if (v) return setErr(v);
    setBusy(true); setErr('');
    const num = (x: string) => (x === '' || x == null ? undefined : Number(x));
    const list = SURFACES.filter((s) => surfaces[s.id]).map((s) => {
      const v = surfaces[s.id]!;
      return { type: s.id === 'techo' ? v.roof : s.id, areaM2: v.unknown ? null : Number(v.area) };
    });
    const known = list.every((s) => s.areaM2 != null) && list.length > 0 ? list.reduce((a, s) => a + (s.areaM2 ?? 0), 0) : undefined;
    const objective = wantsBackup ? 'respaldo' : initialObjective === 'inversion' ? 'inversion' : 'reducir_factura';
    const fromBill = !!(bill && billOk);
    const body = {
      mode: f.input === 'history' ? 'profesional' : 'rapida', segment: seg, objective, province: f.province, city: f.city, address: f.address,
      lat: f.lat ?? undefined, lng: f.lng ?? undefined, distributor: f.distributor || undefined, tariffCode: f.tariffCode || undefined,
      monthlyBillUsd: num(f.monthlyBillUsd) || undefined,
      monthlyKwh: f.input === 'kwh' ? num(f.monthlyKwh) : undefined,
      monthlyHistoryKwh: f.input === 'history' ? f.history.map(Number) : undefined,
      demandKw: fromBill ? num(f.demandKw) ?? 0 : 0,
      periodKwh: fromBill && f.periodKwh ? f.periodKwh : undefined, powerFactor: fromBill && f.powerFactor ? f.powerFactor : undefined,
      billedMonthlyUsd: fromBill && f.billedUsd ? f.billedUsd : undefined, billedMonths: fromBill && f.billedUsd ? f.billedMonths : undefined,
      surface: list.length && list.every((s) => s.type === 'terreno') ? 'terreno' : 'cubierta', surfaces: list.length ? list : undefined, availableAreaM2: known,
      tilt: 10, shading: 'none', wantsBattery: wantsBackup, backup: wantsBackup ? 'esencial' : 'ninguno',
      billUploadId: bill && billOk ? bill.uploadId : undefined,
    };
    track('calculator_submit', { segment: seg, mode: body.mode });
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
    track('generate_lead', { source: 'calculadora', segment: seg, value: j.results.scenarios.base.capex.total, currency: 'USD' });
    setDone({ r: j.results, token: j.token });
    history.replaceState(null, '', `/calculadora/estudio/${pending!.code}?t=${j.token}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) return <StudyResults r={done.r} code={pending!.code} token={done.token} />;

  if (pending) return (
    <div className="mx-auto max-w-2xl">
      <div className="card overflow-hidden">
        <div className="bg-brand-dark p-6 text-white sm:p-8">
          <p className="eyebrow !text-brand">Estudio {pending.code}</p>
          <h2 className="font-display mt-3 text-2xl font-extrabold sm:text-3xl">Tu estudio energético personalizado está listo.</h2>
          <p className="mt-2 text-white/70">Registra tus datos para ver las alternativas On Grid, híbrida y aislada, y recibir el informe por correo.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 p-4"><p className="text-white/60">Sistema recomendado</p><p className="font-display text-2xl font-bold text-brand">{pending.teaser.kwp.toLocaleString('es-EC')} kWp</p></div>
            <div className="rounded-xl bg-white/10 p-4 blur-[1px]"><p className="text-white/60">Ahorro, retorno, VAN y TIR</p><p className="font-display text-2xl font-bold">$ ••••</p></div>
          </div>
        </div>
        <form onSubmit={unlock} className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <div><label className="label" htmlFor="u-name">Nombre *</label><input id="u-name" name="name" required minLength={2} className="input" autoComplete="name" /></div>
          <div><label className="label" htmlFor="u-email">Correo electrónico *</label><input id="u-email" name="email" type="email" required className="input" autoComplete="email" /></div>
          <div><label className="label" htmlFor="u-phone">WhatsApp</label><input id="u-phone" name="phone" type="tel" className="input" placeholder="+593 9X XXX XXXX" autoComplete="tel" /></div>
          {seg !== 'residencial' && <div><label className="label" htmlFor="u-company">Empresa</label><input id="u-company" name="company" className="input" autoComplete="organization" /></div>}
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
      <ol className="mb-8 grid grid-cols-3 gap-2" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0 text-xs" aria-current={i === step ? 'step' : undefined}><div className={`h-1 rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} /><p className={`mt-2 truncate ${i === step ? 'font-semibold' : 'text-muted'}`}>{i + 1}. {s}</p></li>
        ))}
      </ol>
      <div className="card p-5 sm:p-8">
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tipo de cliente" className="sm:col-span-2">
              <Choice value={seg} onChange={(v) => { set('segment', v); set('tariffCode', ''); }} options={[['residencial', 'Residencial'], ['comercial', 'Comercial'], ['industrial', 'Industrial']]} />
            </Field>
            {billUpload && <div className="sm:col-span-2"><BillUpload mode="profesional" result={bill} onRead={applyBill} onDiscard={() => { setBill(null); setBillOk(false); setErr(''); set('periodKwh', null); set('powerFactor', null); }} /></div>}
            <Field label={bill ? 'Consumo leído de tu planilla' : '¿Prefieres escribir tu consumo? ¿Qué dato tienes?'} className="sm:col-span-2">
              <Choice value={f.input === 'history' ? 'history' : f.input} onChange={(v) => set('input', v)} options={[
                ['bill', 'Valor de la factura (USD)'], ['kwh', 'Consumo mensual (kWh)'],
                ...(f.input === 'history' ? [['history', '12 meses de mi planilla']] as [string, string][] : []),
              ]} />
            </Field>
            {f.input === 'bill' && <Field label="Factura mensual promedio (USD) *" htmlFor="c-bill"><input id="c-bill" className="input" type="number" min={1} step="any" inputMode="decimal" value={f.monthlyBillUsd} onChange={(e) => set('monthlyBillUsd', e.target.value)} /></Field>}
            {f.input === 'kwh' && <>
              <Field label="Consumo mensual promedio (kWh) *" htmlFor="c-kwh"><input id="c-kwh" className="input" type="number" min={1} inputMode="numeric" value={f.monthlyKwh} onChange={(e) => set('monthlyKwh', e.target.value)} /></Field>
              <Field label="Valor de la factura (USD, opcional)" htmlFor="c-usd"><input id="c-usd" className="input" type="number" min={1} step="any" inputMode="decimal" value={f.monthlyBillUsd} onChange={(e) => set('monthlyBillUsd', e.target.value)} /></Field>
            </>}
            {f.input === 'history' && (
              <p className="text-sm text-muted sm:col-span-2">Usaremos los 12 meses de consumo de tu planilla ({Math.round(f.history.reduce((a: number, h: string) => a + (+h || 0), 0) / 12).toLocaleString('es-EC')} kWh al mes en promedio).</p>
            )}
            {bill && (
              <label className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-sm sm:col-span-2">
                <input type="checkbox" checked={billOk} onChange={(e) => { setBillOk(e.target.checked); setErr(''); }} className="mt-1" />
                <span><b>Revisé los datos de consumo y son correctos.</b> El estudio se calculará con los valores de este formulario.</span>
              </label>
            )}
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Provincia *" htmlFor="c-prov"><select id="c-prov" className="input" value={f.province} onChange={(e) => { set('province', e.target.value); set('distributor', ''); }}>{PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}</select></Field>
            <Field label="Cantón o ciudad" htmlFor="c-city"><input id="c-city" className="input" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={80} autoComplete="address-level2" /></Field>
            <Field label="Referencia (opcional)" htmlFor="c-addr" className="sm:col-span-2"><input id="c-addr" className="input" value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={200} placeholder="Sector o referencia; no es necesaria para el cálculo" /></Field>
            <div className="rounded-xl border border-line p-4 text-sm sm:col-span-2">
              <p className="font-medium">Ubicación exacta del sitio (opcional)</p>
              <p className="mt-1 text-muted">Si la compartes, consultamos la irradiación solar de ese punto. Solo la usamos para el cálculo; si no, usamos la capital de tu provincia.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" onClick={locate} className="btn-ghost !py-2">Usar mi ubicación actual</button>
                {f.lat != null && <>
                  <span className="tabular-nums">{f.lat}, {f.lng}</span>
                  <a className="text-brand-accent underline" href={`https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lng}#map=17/${f.lat}/${f.lng}`} target="_blank" rel="noopener noreferrer">Ver en el mapa</a>
                  <button type="button" className="text-muted underline" onClick={() => setF((x) => ({ ...x, lat: null, lng: null }))}>Quitar</button>
                </>}
              </div>
              {geo && <p className="mt-2 text-muted" role="status">{geo}</p>}
            </div>
            <Field label="Empresa distribuidora" htmlFor="c-dist" className="sm:col-span-2">
              <select id="c-dist" className="input" value={f.distributor} onChange={(e) => set('distributor', e.target.value)}>
                <option value="">{suggested ? `Según mi ubicación: ${suggested.name}` : 'No lo sé'}</option>
                {distributors.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted">{f.distributor ? 'Tomada de tu planilla o elegida por ti.' : 'Sugerida por la provincia y el cantón: confírmala con tu planilla.'}</p>
            </Field>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <p className="label">¿Dónde se podrían instalar los paneles? <span className="font-normal text-muted">(elige una o varias)</span></p>
              <div className="grid gap-3 sm:grid-cols-3">
                {SURFACES.map((s) => {
                  const v = surfaces[s.id];
                  return (
                    <div key={s.id} className={`rounded-xl border p-4 text-sm ${v ? 'border-brand-dark bg-surface' : 'border-line'}`}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" className="mt-1" checked={!!v} onChange={(e) => setSurfaces((x) => { const n = { ...x }; if (e.target.checked) n[s.id] = { area: '', unknown: false, roof: 'techo_metalico' }; else delete n[s.id]; return n; })} />
                        <span><span className="font-medium">{s.t}</span><span className="block text-xs text-muted">{s.d}</span></span>
                      </label>
                      {v && (
                        <div className="mt-3 grid gap-2">
                          {s.id === 'techo' && (
                            <><label className="text-xs text-muted" htmlFor="a-roof">Tipo de techo</label>
                            <select id="a-roof" className="input" value={v.roof} onChange={(e) => setSurfaces((x) => ({ ...x, techo: { ...v, roof: e.target.value as SurfaceVal['roof'] } }))}>
                              <option value="techo_metalico">Metálico (galvalume, steel panel)</option><option value="techo_inclinado">Teja o fibrocemento</option>
                            </select></>
                          )}
                          <label className="text-xs text-muted" htmlFor={`a-${s.id}`}>Área aproximada (m²)</label>
                          <input id={`a-${s.id}`} className="input" type="number" min={1} inputMode="decimal" disabled={v.unknown} value={v.area}
                            onChange={(e) => setSurfaces((x) => ({ ...x, [s.id]: { ...v, area: e.target.value } }))} />
                          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={v.unknown} onChange={(e) => setSurfaces((x) => ({ ...x, [s.id]: { ...v, area: '', unknown: e.target.checked } }))} /> No conozco el área</label>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted">Si aún no lo sabes, continúa: calcularemos el área que necesitarías.</p>
            </div>
            <p className="rounded-xl bg-surface p-4 text-sm text-muted">¿Tienes fotos del lugar? Envíalas por WhatsApp a tu asesor desde la página de resultados: nos ayudan a confirmar el espacio y las sombras.</p>
          </div>
        )}
        {err && <p className="mt-5 text-sm text-red-600" role="alert">{err}</p>}
        <div className="mt-8 flex justify-between gap-3">
          <button type="button" className="btn-ghost" onClick={() => { setErr(''); setStep(step - 1); }} disabled={step === 0}>Atrás</button>
          {step < STEPS.length - 1
            ? <button type="button" className="btn-dark" onClick={() => { const v = validStep(); if (v) return setErr(v); setErr(''); setStep(step + 1); window.scrollTo({ top: 0 }); }}>Continuar</button>
            : <button type="button" className="btn-primary" onClick={calculate} disabled={busy}>{busy ? 'Consultando irradiación y calculando…' : 'Calcular mi estudio'}</button>}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = '', htmlFor }: { label: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return <div className={className}>{htmlFor ? <label className="label" htmlFor={htmlFor}>{label}</label> : <p className="label">{label}</p>}{children}</div>;
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
