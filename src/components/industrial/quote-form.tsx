'use client';
import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import { PROVINCES } from '@/lib/ecuador';
import { DOC_KINDS, DOC_MAX_FILES, INDUSTRIAL_SOLUTIONS, OPERATING_HOURS, SECTORS, VOLTAGE_LEVELS, type DocKind } from '@/lib/services/industrial';
import { getUtm, track } from '../consent';
import { TURNSTILE_ERROR, useTurnstile } from '@/components/turnstile';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';

type Doc = { id: string; filename: string; size: number; type: string; kind: DocKind };
const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.dwg,application/pdf,image/jpeg,image/png,image/webp';

function Box({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-5 sm:p-7">
      <legend className="sr-only">{title}</legend>
      <p className="flex items-center gap-3 font-semibold"><span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-brand-dark text-xs text-white">{n}</span>{title}</p>
      <div className="mt-5">{children}</div>
    </fieldset>
  );
}

export function IndustrialQuoteForm() {
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const [privacy, setPrivacy] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [kind, setKind] = useState<DocKind>('planilla');
  const [uploading, setUploading] = useState<string | null>(null);
  const [docErr, setDocErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const humanDoc = useTurnstile(TURNSTILE_ACTIONS.industrialDoc);
  const human = useTurnstile(TURNSTILE_ACTIONS.industrial);
  const fileRef = useRef<HTMLInputElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setDocErr('');
    for (const f of Array.from(files)) {
      if (docs.length >= DOC_MAX_FILES) { setDocErr(`Máximo ${DOC_MAX_FILES} documentos.`); break; }
      setUploading(f.name);
      const turnstileToken = await humanDoc.getToken().catch(() => null);
      if (turnstileToken === null) { setDocErr(TURNSTILE_ERROR); break; }
      const fd = new FormData();
      if (turnstileToken) fd.set('turnstileToken', turnstileToken);
      fd.set('file', f); fd.set('consent', 'on'); fd.set('website', '');
      const r = await fetch('/api/industrial/upload', { method: 'POST', body: fd }).catch(() => null);
      const j = await r?.json().catch(() => null);
      if (!r?.ok || !j?.id) { setDocErr(j?.error ?? `No pudimos subir «${f.name}».`); continue; }
      setDocs((d) => [...d, { ...j, kind }]);
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => { const v = String(f.get(k) ?? '').replace(',', '.').trim(); return v === '' ? null : Number(v); };
    setBusy(true); setErr('');
    const turnstileToken = await human.getToken().catch(() => null);
    if (turnstileToken === null) { setBusy(false); setErr(TURNSTILE_ERROR); requestAnimationFrame(() => errRef.current?.focus()); return; }
    const r = await fetch('/api/industrial', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      solutions: f.getAll('solutions'), company: f.get('company'), ruc: f.get('ruc') ?? '', sector: f.get('sector') ?? '', province: f.get('province'), city: f.get('city') ?? '',
      monthlyKwh: n('monthlyKwh'), monthlyBillUsd: n('monthlyBillUsd'), demandKw: n('demandKw'), voltage: f.get('voltage') || 'no_se', hours: f.get('hours') || undefined,
      areaM2: n('areaM2'), site: f.get('site') ?? '', message: f.get('message') ?? '', documents: docs.map((d) => ({ id: d.id, kind: d.kind })),
      name: f.get('name'), position: f.get('position') ?? '', email: f.get('email'), phone: f.get('phone'),
      acceptPrivacy: privacy, acceptMarketing: f.get('marketing') === 'on', utm: getUtm(), website: f.get('website') || '', turnstileToken,
    }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr((await r?.json().catch(() => null))?.error ?? 'No se pudo enviar la solicitud. Inténtalo de nuevo.'); requestAnimationFrame(() => errRef.current?.focus()); return; }
    track('generate_lead', { source: 'cotizacion_industrial', documents: docs.length });
    setDone(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (done) return (
    <div className="card p-8 text-center" role="status">
      <p className="eyebrow">Solicitud recibida</p>
      <p className="font-display mt-2 text-2xl font-extrabold">Gracias, ya la estamos revisando</p>
      <p className="mx-auto mt-3 max-w-lg text-muted">Un asesor comercial y nuestro equipo de ingeniería evaluarán tu información{docs.length ? ` y los ${docs.length} documento(s) adjuntos` : ''} y te contactarán. Te enviamos una confirmación por correo.</p>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Box n={1} title="¿Qué solución te interesa?">
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Soluciones de interés">
          {INDUSTRIAL_SOLUTIONS.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3 text-sm has-[:checked]:border-brand-dark has-[:checked]:bg-surface">
              <input type="checkbox" name="solutions" value={s.id} className="mt-0.5" /> {s.label}
            </label>
          ))}
        </div>
      </Box>

      <Box n={2} title="Empresa y ubicación">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="label" htmlFor={id('company')}>Razón social *</label><input id={id('company')} name="company" className="input" autoComplete="organization" /></div>
          <div><label className="label" htmlFor={id('ruc')}>RUC</label><input id={id('ruc')} name="ruc" className="input" inputMode="numeric" maxLength={17} placeholder="Opcional" /></div>
          <div><label className="label" htmlFor={id('sector')}>Sector *</label><select id={id('sector')} name="sector" className="input" defaultValue=""><option value="" disabled>Elige</option>{SECTORS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label className="label" htmlFor={id('province')}>Provincia *</label><select id={id('province')} name="province" className="input" defaultValue="Guayas">{PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}</select></div>
          <div><label className="label" htmlFor={id('city')}>Ciudad o cantón</label><input id={id('city')} name="city" className="input" maxLength={80} /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor={id('site')}>Sitio del proyecto</label><input id={id('site')} name="site" className="input" maxLength={120} placeholder="Ej.: planta de Durán, piscinas en Santa Rosa" /></div>
        </div>
      </Box>

      <Box n={3} title="Datos energéticos">
        <p className="-mt-2 mb-4 text-sm text-muted">Indica al menos tu consumo o tu factura mensual, o adjunta tus planillas en el paso 5.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label" htmlFor={id('kwh')}>Consumo mensual (kWh)</label><input id={id('kwh')} name="monthlyKwh" className="input" inputMode="decimal" /></div>
          <div><label className="label" htmlFor={id('usd')}>Factura mensual (USD)</label><input id={id('usd')} name="monthlyBillUsd" className="input" inputMode="decimal" /></div>
          <div><label className="label" htmlFor={id('kw')}>Demanda facturada (kW)</label><input id={id('kw')} name="demandKw" className="input" inputMode="decimal" /></div>
          <div><label className="label" htmlFor={id('volt')}>Nivel de tensión</label><select id={id('volt')} name="voltage" className="input" defaultValue="no_se">{VOLTAGE_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor={id('hours')}>Horario de operación</label><select id={id('hours')} name="hours" className="input" defaultValue=""><option value="">No lo sé</option>{OPERATING_HOURS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="label" htmlFor={id('area')}>Superficie disponible (m²)</label><input id={id('area')} name="areaM2" className="input" inputMode="decimal" placeholder="Cubierta o terreno" /></div>
        </div>
      </Box>

      <Box n={4} title="Persona de contacto">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label" htmlFor={id('name')}>Nombre *</label><input id={id('name')} name="name" className="input" autoComplete="name" /></div>
          <div><label className="label" htmlFor={id('pos')}>Cargo</label><input id={id('pos')} name="position" className="input" maxLength={80} autoComplete="organization-title" /></div>
          <div><label className="label" htmlFor={id('email')}>Correo *</label><input id={id('email')} name="email" type="email" className="input" autoComplete="email" /></div>
          <div><label className="label" htmlFor={id('phone')}>Teléfono / WhatsApp *</label><input id={id('phone')} name="phone" type="tel" className="input" autoComplete="tel" placeholder="+593 9X XXX XXXX" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor={id('msg')}>Cuéntanos más</label><textarea id={id('msg')} name="message" rows={3} maxLength={2000} className="input" placeholder="Plazos, presupuesto, problemas de calidad de energía, generadores existentes…" /></div>
        </div>
        <div className="mt-5 space-y-2 text-sm text-muted">
          <label className="flex items-start gap-2"><input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-1" /> <span>Acepto la <Link href="/privacidad" target="_blank" className="underline">política de privacidad</Link> y el tratamiento de los datos y documentos de mi empresa para evaluar esta solicitud. *</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="marketing" className="mt-1" /> <span>Autorizo recibir información comercial de Energy Solutions Ecuador (opcional).</span></label>
        </div>
      </Box>

      <Box n={5} title="Documentos (opcional)">
        <p className="-mt-2 text-sm text-muted">Planillas eléctricas (idealmente 12 meses), curva de carga del medidor y planos o implantación. PDF, fotos, Excel (.xlsx), CSV o DWG; hasta {DOC_MAX_FILES} archivos de 4 MB. Si tus planos pesan más, tu asesor te los pedirá después.</p>
        {!privacy && <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm">Acepta la política de privacidad (paso 4) para adjuntar documentos.</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-[14rem_1fr] sm:items-end">
          <div><label className="label" htmlFor={id('kind')}>Tipo de documento</label><select id={id('kind')} className="input" value={kind} onChange={(e) => setKind(e.target.value as DocKind)} disabled={!privacy}>{DOC_KINDS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></div>
          <div className="min-w-0"><label className="label" htmlFor={id('file')}>Archivo</label>
            <input ref={fileRef} id={id('file')} type="file" multiple accept={ACCEPT} disabled={!privacy || !!uploading || docs.length >= DOC_MAX_FILES} onChange={(e) => upload(e.target.files)}
              className="block w-full max-w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-dark file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:opacity-50" /></div>
        </div>
        <p className="mt-2 text-sm text-muted" aria-live="polite">{uploading ? `Subiendo «${uploading}»…` : ''}</p>
        {humanDoc.slot && <div className="mt-3">{humanDoc.slot}</div>}
        {docErr && <p className="mt-2 text-sm text-red-600" role="alert">{docErr}</p>}
        {docs.length > 0 && (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line text-sm" aria-label="Documentos adjuntos">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{d.filename}</span>
                <span className="text-xs text-muted">{DOC_KINDS.find((k) => k.id === d.kind)?.label} · {d.type} · {fmtSize(d.size)}</span>
                <button type="button" className="text-xs underline" onClick={() => setDocs((x) => x.filter((y) => y.id !== d.id))} aria-label={`Quitar ${d.filename}`}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </Box>

      {human.slot}
      {err && <p ref={errRef} tabIndex={-1} className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 outline-none" role="alert">{err}</p>}
      <button className="btn-primary w-full sm:w-auto" disabled={busy || !!uploading}>{busy ? 'Enviando…' : 'Enviar solicitud de cotización'}</button>
    </form>
  );
}
