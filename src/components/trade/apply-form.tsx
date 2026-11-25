'use client';
import { useState } from 'react';
import Link from 'next/link';
import { TRADE_TIERS } from '@/lib/services/trade';
import { getUtm, track } from '../consent';

export function TradeApplyForm() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr('');
    const r = await fetch('/api/trade/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      company: f.get('company'), ruc: f.get('ruc'), tier: f.get('tier') ?? '', contact_name: f.get('contact_name'), email: f.get('email'),
      phone: f.get('phone'), city: f.get('city'), notes: f.get('notes') || '', acceptPrivacy: f.get('privacy') === 'on',
      acceptMarketing: f.get('marketing') === 'on', website: f.get('website') || '', utm: getUtm(),
    }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr((await r?.json().catch(() => null))?.error ?? 'No se pudo enviar la solicitud. Inténtalo de nuevo.');
    track('generate_lead', { source: 'cuenta_comercial' });
    setDone(true);
  }

  if (done) return (
    <div className="card p-8 text-center" role="status">
      <p className="eyebrow">Solicitud recibida</p>
      <p className="font-display mt-2 text-2xl font-extrabold">Revisaremos tu solicitud</p>
      <p className="mt-3 text-muted">Te escribiremos al correo que indicaste. Si se aprueba, recibirás un enlace para activar tu acceso y ver los precios de tu nivel.</p>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="card grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <fieldset className="sm:col-span-2">
        <legend className="label">Tipo de cuenta *</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TRADE_TIERS.map((t, i) => (
            <label key={t.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm has-[:checked]:border-brand-dark has-[:checked]:bg-surface">
              <input type="radio" name="tier" value={t.id} defaultChecked={i === 0} className="mt-1" />
              <span><b className="block">{t.label}</b><span className="text-muted">{t.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2"><label className="label" htmlFor="t-company">Razón social o nombre comercial *</label><input id="t-company" name="company" required className="input" autoComplete="organization" /></div>
      <div><label className="label" htmlFor="t-ruc">RUC *</label><input id="t-ruc" name="ruc" required inputMode="numeric" maxLength={17} className="input" placeholder="13 dígitos" /></div>
      <div><label className="label" htmlFor="t-city">Ciudad *</label><input id="t-city" name="city" required className="input" autoComplete="address-level2" /></div>
      <div><label className="label" htmlFor="t-name">Persona de contacto *</label><input id="t-name" name="contact_name" required className="input" autoComplete="name" /></div>
      <div><label className="label" htmlFor="t-phone">Teléfono / WhatsApp *</label><input id="t-phone" name="phone" type="tel" required className="input" autoComplete="tel" placeholder="+593 9X XXX XXXX" /></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="t-email">Correo de acceso *</label><input id="t-email" name="email" type="email" required className="input" autoComplete="email" /><p className="mt-1 text-xs text-muted">A este correo enviaremos el enlace para activar tu cuenta si se aprueba.</p></div>
      <div className="sm:col-span-2"><label className="label" htmlFor="t-notes">Cuéntanos sobre tu empresa</label><textarea id="t-notes" name="notes" rows={3} maxLength={1500} className="input" placeholder="Años en el mercado, proyectos instalados, zonas que atiendes, volumen estimado de compra…" /></div>
      <div className="space-y-2 text-sm text-muted sm:col-span-2">
        <label className="flex items-start gap-2"><input type="checkbox" name="privacy" className="mt-1" /> <span>Acepto la <Link href="/privacidad" target="_blank" className="underline">política de privacidad</Link> y el tratamiento de mis datos para evaluar esta solicitud. *</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="marketing" className="mt-1" /> <span>Autorizo recibir información comercial de Energy Solutions Ecuador (opcional).</span></label>
      </div>
      {err && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{err}</p>}
      <button className="btn-primary sm:col-span-2" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
    </form>
  );
}
