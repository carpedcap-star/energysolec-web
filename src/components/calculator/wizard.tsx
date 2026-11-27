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

/** Superficies que el cliente puede combinar; los factores de ocupación (m²/kWp) los define Gerencia en el panel. */
const SURFACES = [
  { id: 'techo_metalico', t: 'Cubierta o techo' },
  { id: 'losa', t: 'Losa de hormigón' },
  { id: 'terreno', t: 'Terreno o piso' },
] as const;
type SurfaceId = (typeof SURFACES)[number]['id'];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const provinceName = (s?: string | null) => (s ? PROVINCES.find((p) => norm(p.name) === norm(s))?.name : undefined);
const num = (x: unknown) => (x === '' || x == null || !Number.isFinite(Number(x)) ? undefined : Number(x));

/**
 * Calculadora en una sola pantalla: el cliente sube su planilla (la IA lee consumo, valor, distribuidora, tarifa,
 * demanda, franjas y cargos), confirma la ubicación solo si no se pudo leer, indica superficies si las conoce y calcula.
 */
export function CalculatorWizard({ initialSegment, initialObjective, billUpload = false, distributors, coverage }: {
  initialSegment?: Seg; initialObjective?: string; billUpload?: boolean;
  distributors: DistributorOpt[]; coverage: CoverageOpt[]; tariffChoices?: TariffChoices;
}) {
  const [f, setF] = useState<Record<string, any>>({
    segment: initialSegment ?? 'residencial', province: '', city: '', distributor: '', tariffCode: '',
    input: 'bill', monthlyBillUsd: '', monthlyKwh: '', history: Array(12).fill(''), demandKw: '',
    periodKwh: null, powerFactor: null, billedUsd: null, billedMonths: 0, specialTariff: null, serviceUsd: null, energyUsd: null, energyBandUsd: null, lat: null, lng: null,
  });
  // Respaldo: solo si el visitante llegó buscando baterías; capacidad y autonomía las define Gerencia en el panel.
  const wantsBackup = initialObjective === 'respaldo' || initialObjective === 'almacenamiento';
  const [areas, setAreas] = useState<Partial<Record<SurfaceId, string>>>({});
  const [manual, setManual] = useState(!billUpload);
  const [editPlace, setEditPlace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [geo, setGeo] = useState('');
  const human = useTurnstile(TURNSTILE_ACTIONS.study);
  const [pending, setPending] = useState<{ code: string; teaser: { kwp: number; modules: number; annualGeneration: number } } | null>(null);
  const [done, setDone] = useState<{ r: StudyResult; token: string } | null>(null);
  const [bill, setBill] = useState<BillResult | null>(null);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const seg = f.segment as Seg;
  const placeFromBill = !!bill && !!provinceName(bill.proposal.province) && !editPlace;

  const suggested = (() => {
    const c = coverage.find((x) => norm(x.province) === norm(f.province));
    if (!c) return null;
    const byCanton = f.city ? Object.entries(c.cantons ?? {}).find(([k]) => norm(k) === norm(f.city))?.[1] : undefined;
    return distributors.find((d) => d.code === (byCanton ?? c.distributor)) ?? null;
  })();
  const distName = distributors.find((d) => d.code === f.distributor)?.name ?? suggested?.name ?? null;

  function locate() {
    if (!navigator.geolocation) return setGeo('Tu navegador no permite compartir la ubicación.');
    setGeo('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = +p.coords.latitude.toFixed(5), lng = +p.coords.longitude.toFixed(5);
        if (lat < -5.1 || lat > 1.7 || lng < -92.1 || lng > -75) { setGeo('Esa ubicación está fuera de Ecuador; usaremos la provincia.'); return; }
        setF((x) => ({ ...x, lat, lng })); setGeo('Ubicación exacta registrada.');
      },
      () => setGeo('No pudimos obtener tu ubicación; usaremos la capital de tu provincia.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function applyBill(b: BillResult) {
    const p = b.proposal;
    setF((x) => ({
      ...x, input: p.input, monthlyKwh: p.monthlyKwh, monthlyBillUsd: p.monthlyBillUsd,
      history: p.input === 'history' ? p.history : x.history, demandKw: p.demandKw || '',
      segment: p.segment ?? x.segment, tariffCode: p.tariffKey ?? '', distributor: p.distributor || '',
      province: provinceName(p.province) ?? x.province, city: p.canton ?? x.city, periodKwh: p.periodKwh ?? null, powerFactor: p.powerFactor ?? null,
      billedUsd: p.billedUsd ?? null, billedMonths: p.billedMonths ?? 0,
      specialTariff: p.specialTariff ?? null, serviceUsd: p.serviceUsd ?? null, energyUsd: p.energyUsd ?? null, energyBandUsd: p.energyBandUsd ?? null,
    }));
    setBill(b); setManual(false); setEditPlace(false); setErr('');
  }
  function discardBill() {
    setBill(null); setErr('');
    setF((x) => ({ ...x, periodKwh: null, powerFactor: null, billedUsd: null, billedMonths: 0, specialTariff: null, serviceUsd: null, energyUsd: null, tariffCode: '', demandKw: '' }));
  }

  function problem(): string {
    if (!bill && !manual) return billUpload ? 'Sube tu planilla eléctrica o ingresa tu consumo manualmente.' : 'Ingresa tu consumo mensual.';
    if (!bill) {
      if (f.input === 'kwh' && !(+f.monthlyKwh > 0)) return 'Ingresa tu consumo mensual en kWh.';
      if (f.input !== 'kwh' && !(+f.monthlyBillUsd > 0)) return 'Ingresa el valor de tu factura mensual.';
    }
    if (!f.province) return 'Selecciona la provincia donde se instalaría el sistema.';
    for (const s of SURFACES) { const a = areas[s.id]; if (a != null && a !== '' && !(+a > 0)) return `Revisa los m² de «${s.t}» o déjalos vacíos si no los conoces.`; }
    return '';
  }

  async function calculate() {
    const v = problem(); if (v) return setErr(v);
    setBusy(true); setErr('');
    const surfaces = SURFACES.filter((s) => areas[s.id] != null).map((s) => ({ type: s.id, areaM2: num(areas[s.id]) ?? null }));
    const known = surfaces.length > 0 && surfaces.every((s) => s.areaM2 != null) ? surfaces.reduce((a, s) => a + (s.areaM2 ?? 0), 0) : undefined;
    const fromBill = !!bill;
    const body = {
      mode: f.input === 'history' ? 'profesional' : 'rapida', segment: seg, objective: wantsBackup ? 'respaldo' : 'reducir_factura', province: f.province, city: f.city || '',
      lat: f.lat ?? undefined, lng: f.lng ?? undefined, distributor: f.distributor || undefined, tariffCode: fromBill ? f.tariffCode || undefined : undefined,
      monthlyBillUsd: num(f.monthlyBillUsd) || undefined,
      monthlyKwh: f.input === 'kwh' ? num(f.monthlyKwh) : undefined,
      monthlyHistoryKwh: f.input === 'history' ? f.history.map(Number) : undefined,
      demandKw: fromBill ? num(f.demandKw) ?? 0 : 0,
      periodKwh: fromBill && f.periodKwh ? f.periodKwh : undefined, powerFactor: fromBill && f.powerFactor ? f.powerFactor : undefined,
      billedMonthlyUsd: fromBill && f.billedUsd ? f.billedUsd : undefined, billedMonths: fromBill && f.billedUsd ? f.billedMonths : undefined,
      specialTariff: fromBill && f.specialTariff ? f.specialTariff : undefined, serviceUsd: fromBill && f.serviceUsd ? f.serviceUsd : undefined,
      energyChargesUsd: fromBill && f.energyUsd ? f.energyUsd : undefined, energyBandUsd: fromBill && f.energyBandUsd ? f.energyBandUsd : undefined,
      surface: surfaces.length && surfaces.every((s) => s.type === 'terreno') ? 'terreno' : 'cubierta', surfaces: surfaces.length ? surfaces : undefined, availableAreaM2: known,
      tilt: 10, shading: 'none', wantsBattery: wantsBackup, backup: wantsBackup ? 'esencial' : 'ninguno',
      // Al calcular, el cliente confirma los datos leídos de su planilla.
      billUploadId: bill ? bill.uploadId : undefined,
    };
    track('calculator_submit', { segment: seg, mode: body.mode, bill: fromBill });
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
          <h2 className="font-display mt-3 text-2xl font-extrabold sm:text-3xl">Tu estudio de ahorro está listo.</h2>
          <p className="mt-2 text-white/70">Registra tus datos para ver tu ahorro, la inversión y el retorno, y recibir el informe por correo.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/10 p-4"><p className="text-white/60">Potencia recomendada</p><p className="font-display text-2xl font-bold text-brand">{pending.teaser.kwp.toLocaleString('es-EC')} kWp</p></div>
            <div className="rounded-xl bg-white/10 p-4 blur-[1px]"><p className="text-white/60">Ahorro y retorno</p><p className="font-display text-2xl font-bold">$ ••••</p></div>
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
      <div className="card space-y-8 p-5 sm:p-8">
        <section aria-labelledby="c-bill-h">
          <h2 id="c-bill-h" className="font-semibold">Tu planilla eléctrica</h2>
          {billUpload && !manual && (
            <div className="mt-3">
              <BillUpload mode="profesional" result={bill} onRead={applyBill} onDiscard={discardBill} />
              {!bill && <button type="button" className="mt-3 text-sm text-brand-accent underline" onClick={() => setManual(true)}>¿No tienes tu planilla a mano? Ingresa tu consumo</button>}
            </div>
          )}
          {manual && !bill && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Tipo de cliente" className="sm:col-span-2">
                <Choice value={seg} onChange={(v) => set('segment', v)} options={[['residencial', 'Residencial'], ['comercial', 'Comercial'], ['industrial', 'Industrial']]} />
              </Field>
              <Field label="¿Qué dato tienes?" className="sm:col-span-2">
                <Choice value={f.input === 'kwh' ? 'kwh' : 'bill'} onChange={(v) => set('input', v)} options={[['bill', 'Valor de la factura (USD)'], ['kwh', 'Consumo mensual (kWh)']]} />
              </Field>
              {f.input === 'kwh' ? <>
                <Field label="Consumo mensual promedio (kWh) *" htmlFor="c-kwh"><input id="c-kwh" className="input" type="number" min={1} inputMode="numeric" value={f.monthlyKwh} onChange={(e) => set('monthlyKwh', e.target.value)} /></Field>
                <Field label="Valor de la factura (USD, opcional)" htmlFor="c-usd"><input id="c-usd" className="input" type="number" min={1} step="any" inputMode="decimal" value={f.monthlyBillUsd} onChange={(e) => set('monthlyBillUsd', e.target.value)} /></Field>
              </> : <Field label="Factura mensual promedio (USD) *" htmlFor="c-bill"><input id="c-bill" className="input" type="number" min={1} step="any" inputMode="decimal" value={f.monthlyBillUsd} onChange={(e) => set('monthlyBillUsd', e.target.value)} /></Field>}
              {billUpload && <button type="button" className="text-left text-sm text-brand-accent underline sm:col-span-2" onClick={() => { setManual(false); set('input', 'bill'); }}>Prefiero subir mi planilla</button>}
            </div>
          )}
        </section>

        <section aria-labelledby="c-place-h">
          <h2 id="c-place-h" className="font-semibold">Ubicación</h2>
          {placeFromBill ? (
            <p className="mt-2 text-sm">
              {[f.city, f.province].filter(Boolean).join(', ')}{distName ? ` · ${distName}` : ''} <span className="text-muted">(de tu planilla)</span>{' '}
              <button type="button" className="text-brand-accent underline" onClick={() => setEditPlace(true)}>Cambiar</button>
            </p>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Provincia *" htmlFor="c-prov">
                <select id="c-prov" className="input" value={f.province} onChange={(e) => { set('province', e.target.value); set('distributor', ''); }}>
                  <option value="">Selecciona tu provincia</option>
                  {PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Cantón o ciudad" htmlFor="c-city"><input id="c-city" className="input" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={80} autoComplete="address-level2" /></Field>
              <div className="flex flex-wrap items-center gap-3 text-sm sm:col-span-2">
                <button type="button" onClick={locate} className="btn-ghost !py-2">Usar mi ubicación actual</button>
                <span className="text-muted" role="status">{geo || 'Opcional: mejora la precisión de la radiación solar.'}</span>
              </div>
              {f.province && (
                <Field label="Empresa distribuidora" htmlFor="c-dist" className="sm:col-span-2">
                  <select id="c-dist" className="input" value={f.distributor} onChange={(e) => set('distributor', e.target.value)}>
                    <option value="">{suggested ? `Según mi ubicación: ${suggested.name}` : 'No lo sé'}</option>
                    {distributors.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="c-surf-h">
          <h2 id="c-surf-h" className="font-semibold">Superficie disponible <span className="font-normal text-muted">(opcional)</span></h2>
          <p className="mt-1 text-sm text-muted">Marca dónde podrían ir los paneles; puedes combinar varias. Si no sabes los m², déjalos vacíos.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {SURFACES.map((s) => {
              const on = areas[s.id] != null;
              return (
                <div key={s.id} className={`rounded-xl border p-4 text-sm ${on ? 'border-brand-dark bg-surface' : 'border-line'}`}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={on} onChange={(e) => setAreas((x) => { const n = { ...x }; if (e.target.checked) n[s.id] = ''; else delete n[s.id]; return n; })} />
                    <span className="font-medium">{s.t}</span>
                  </label>
                  {on && (
                    <div className="mt-3">
                      <label className="text-xs text-muted" htmlFor={`a-${s.id}`}>m² disponibles</label>
                      <input id={`a-${s.id}`} className="input mt-1" type="number" min={1} inputMode="decimal" placeholder="No lo sé" value={areas[s.id]} onChange={(e) => setAreas((x) => ({ ...x, [s.id]: e.target.value }))} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div>
          {err && <p className="mb-3 text-sm text-red-600" role="alert">{err}</p>}
          <button type="button" className="btn-primary w-full sm:w-auto" onClick={calculate} disabled={busy}>{busy ? 'Calculando tu ahorro…' : 'Calcular mi ahorro'}</button>
          {bill && <p className="mt-2 text-xs text-muted">Al calcular confirmas que los datos leídos de tu planilla son correctos. ¿Fotos del lugar? Envíalas luego por WhatsApp a tu asesor.</p>}
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
