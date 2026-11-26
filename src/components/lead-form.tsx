'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getUtm, track } from './consent';
import { PROVINCES } from '@/lib/ecuador';
import { TURNSTILE_ERROR, useTurnstile } from '@/components/turnstile';
import { TURNSTILE_ACTIONS } from '@/lib/turnstile';

type Props = {
  source: 'contacto' | 'cotizacion' | 'catalogo' | 'financiamiento' | 'capacitacion' | 'servicio';
  segment?: 'residencial' | 'comercial' | 'industrial';
  topic?: string;
  title?: string;
  askBill?: boolean;
  askCompany?: boolean;
  dark?: boolean;
  submitLabel?: string;
};

/** Formulario comercial reutilizable: valida, guarda en el CRM y confirma. */
export function LeadForm({ source, segment, topic, title, askBill = true, askCompany = true, dark, submitLabel = 'Enviar solicitud' }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState('');
  const human = useTurnstile(TURNSTILE_ACTIONS.lead, { theme: dark ? 'dark' : 'light' });
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState('sending'); setError('');
    const turnstileToken = await human.getToken().catch(() => null);
    if (turnstileToken === null) { setState('error'); setError(TURNSTILE_ERROR); return; }
    const body = {
      source, segment: (f.get('segment') as string) || segment, topic: topic ?? (f.get('topic') as string) ?? undefined,
      name: f.get('name'), email: f.get('email'), phone: f.get('phone') || '', company: f.get('company') || '',
      province: f.get('province') || undefined, city: f.get('city') || undefined,
      monthlyBillUsd: f.get('bill') ? Number(f.get('bill')) : undefined, message: f.get('message') || undefined,
      acceptPrivacy: f.get('privacy') === 'on', acceptMarketing: f.get('marketing') === 'on', utm: getUtm(), website: f.get('website') || '', turnstileToken,
    };
    const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) { setState('ok'); track('generate_lead', { source, segment: body.segment }); }
    else { setState('error'); setError((await r?.json().catch(() => null))?.error ?? 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.'); }
  }
  const lab = dark ? 'label text-white/85' : 'label';
  if (state === 'ok') return (
    <div className={`rounded-2xl p-6 ${dark ? 'bg-white/10 text-white' : 'card'}`} role="status">
      <p className="font-display text-xl font-semibold">Gracias, recibimos tu solicitud.</p>
      <p className="mt-2 text-sm opacity-80">Te enviamos una confirmación por correo y un asesor te contactará pronto.</p>
    </div>
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate={false}>
      {title && <p className={`font-display text-xl font-semibold sm:col-span-2 ${dark ? 'text-white' : ''}`}>{title}</p>}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <div><label className={lab} htmlFor={`${source}-name`}>Nombre *</label><input id={`${source}-name`} name="name" required minLength={2} className="input" autoComplete="name" /></div>
      <div><label className={lab} htmlFor={`${source}-email`}>Correo electrónico *</label><input id={`${source}-email`} name="email" type="email" required className="input" autoComplete="email" /></div>
      <div><label className={lab} htmlFor={`${source}-phone`}>WhatsApp</label><input id={`${source}-phone`} name="phone" type="tel" className="input" placeholder="+593 9X XXX XXXX" autoComplete="tel" /></div>
      {askCompany && <div><label className={lab} htmlFor={`${source}-company`}>Empresa</label><input id={`${source}-company`} name="company" className="input" autoComplete="organization" /></div>}
      {!segment && <div><label className={lab} htmlFor={`${source}-segment`}>Tipo de cliente</label><select id={`${source}-segment`} name="segment" className="input"><option value="">Selecciona</option><option value="residencial">Residencial</option><option value="comercial">Comercial</option><option value="industrial">Industrial</option></select></div>}
      <div><label className={lab} htmlFor={`${source}-province`}>Provincia</label><select id={`${source}-province`} name="province" className="input"><option value="">Selecciona</option>{PROVINCES.map((p) => <option key={p.name}>{p.name}</option>)}</select></div>
      {askBill && <div><label className={lab} htmlFor={`${source}-bill`}>Factura eléctrica mensual (USD)</label><input id={`${source}-bill`} name="bill" type="number" min={1} step="any" className="input" inputMode="decimal" /></div>}
      <div className="sm:col-span-2"><label className={lab} htmlFor={`${source}-message`}>Cuéntanos tu requerimiento</label><textarea id={`${source}-message`} name="message" rows={3} maxLength={3000} className="input" /></div>
      <div className={`space-y-2 text-sm sm:col-span-2 ${dark ? 'text-white/80' : 'text-muted'}`}>
        <label className="flex items-start gap-2"><input type="checkbox" name="privacy" required className="mt-1" /> <span>Acepto la <Link href="/privacidad" className="underline" target="_blank">política de privacidad</Link> y el tratamiento de mis datos para atender esta solicitud. *</span></label>
        <label className="flex items-start gap-2"><input type="checkbox" name="marketing" className="mt-1" /> <span>Autorizo recibir información comercial y novedades de Energy Solutions Ecuador (opcional).</span></label>
      </div>
      {human.slot && <div className="sm:col-span-2">{human.slot}</div>}
      {state === 'error' && <p className="text-sm text-red-600 sm:col-span-2" role="alert">{error}</p>}
      <div className="sm:col-span-2"><button className="btn-primary w-full sm:w-auto" disabled={state === 'sending'}>{state === 'sending' ? 'Enviando…' : submitLabel}</button></div>
    </form>
  );
}
