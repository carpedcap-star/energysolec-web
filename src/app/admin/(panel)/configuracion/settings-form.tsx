'use client';
import { startTransition, useActionState, useEffect, useRef } from 'react';
import { saveSettingsAction } from '../../actions';
import { ID_FORMATS, SOCIALS, type Contact, type Integrations, type Notifications } from '@/lib/services/site-settings';
import { Field, Section } from '../form-ui';

export function SettingsForm({ contact, notifications, integrations, whatsappDisplay }: { contact: Contact; notifications: Notifications; integrations: Integrations; whatsappDisplay: string }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  const errRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state?.error) errRef.current?.focus(); }, [state]);
  return (
    // Envío manual: con <form action>, React reiniciaría los campos al responder y se perdería lo escrito ante un error.
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="mt-6 space-y-6" noValidate>
      <Section title="Contacto público" intro="Aparece en el pie de página, el botón flotante de WhatsApp, la página de contacto, los correos, el PDF del estudio y los datos para buscadores.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="s-wa" label="WhatsApp comercial *" hint={`Con código de país. Hoy se muestra como ${whatsappDisplay}.`}><input id="s-wa" name="whatsapp" defaultValue={`+${contact.whatsapp}`} className="input" inputMode="tel" autoComplete="off" /></Field>
          <Field id="s-email" label="Correo de contacto *" hint="También es el contacto para ejercer derechos de datos (política de privacidad)."><input id="s-email" name="email" type="email" defaultValue={contact.email} className="input" /></Field>
          <Field id="s-phone" label="Teléfono fijo"><input id="s-phone" name="phone" defaultValue={contact.phone ?? ''} className="input" inputMode="tel" placeholder="Opcional" /></Field>
          <Field id="s-city" label="Ciudad *"><input id="s-city" name="city" defaultValue={contact.city} className="input" /></Field>
          <Field id="s-address" label="Dirección" className="sm:col-span-2"><input id="s-address" name="address" defaultValue={contact.address ?? ''} className="input" maxLength={200} placeholder="Opcional" /></Field>
          <Field id="s-hours" label="Horario de atención"><input id="s-hours" name="hours" defaultValue={contact.hours ?? ''} className="input" maxLength={120} placeholder="Ej.: Lunes a viernes, 8:30 a 17:30" /></Field>
          <Field id="s-maps" label="Enlace de Google Maps"><input id="s-maps" name="mapsUrl" defaultValue={contact.mapsUrl ?? ''} className="input" placeholder="https://maps.app.goo.gl/…" /></Field>
        </div>
      </Section>

      <Section title="Redes sociales" intro="Solo enlaces https del dominio de cada red. Se muestran en el pie y en la página de contacto, y se informan a los buscadores.">
        <div className="grid gap-4 sm:grid-cols-2">
          {SOCIALS.map((s) => (
            <Field key={s.id} id={`s-${s.id}`} label={s.label}><input id={`s-${s.id}`} name={`social_${s.id}`} defaultValue={contact.socials[s.id] ?? ''} className="input" placeholder={`https://${s.hosts[0]}/…`} /></Field>
          ))}
        </div>
      </Section>

      <Section title="Avisos internos" intro="Correo que recibe los avisos de leads nuevos, pedidos, solicitudes de cuentas comerciales y los recordatorios de leads sin asesor. No se muestra en el sitio.">
        <Field id="s-sales" label="Correo de avisos comerciales"><input id="s-sales" name="salesEmail" type="email" defaultValue={notifications.salesEmail ?? ''} className="input" placeholder="ventas@energysolec.com" /></Field>
      </Section>

      <Section title="Analítica y publicidad" intro="Identificadores públicos. Solo se activan si el visitante acepta las cookies correspondientes. Si usas Google Tag Manager, GA4 se configura dentro de GTM.">
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(ID_FORMATS) as (keyof typeof ID_FORMATS)[]).map((k) => (
            <Field key={k} id={`s-${k}`} label={ID_FORMATS[k].label} hint={`Formato: ${ID_FORMATS[k].example}`}><input id={`s-${k}`} name={k} defaultValue={integrations[k] ?? ''} className="input font-mono" autoComplete="off" spellCheck={false} /></Field>
          ))}
        </div>
      </Section>

      <div>
        {!pending && state?.error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{state.error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </form>
  );
}
