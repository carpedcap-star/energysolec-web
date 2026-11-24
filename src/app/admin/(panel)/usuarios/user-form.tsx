'use client';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { createUserAction, sendAccessLinkAction, updateUserAction } from '../../actions';
import type { StaffUser } from '@/lib/data/types';
import { ROLES } from '@/lib/services/users';
import { Field, Section } from '../form-ui';

type Advisor = { id: string; full_name: string };

/** Alta (invitación) o edición de un usuario. */
export function UserForm({ user: u, self, openLeads, advisors }: { user: StaffUser | null; self: boolean; openLeads: number; advisors: Advisor[] }) {
  const [state, action, pending] = useActionState(u ? updateUserAction.bind(null, u.id) : createUserAction, null);
  const [active, setActive] = useState(u?.active ?? true);
  const [advisor, setAdvisor] = useState(u?.is_advisor ?? false);
  const errRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();
  const f = (k: string) => `${uid}-${k}`;
  useEffect(() => { if (state?.error) errRef.current?.focus(); }, [state]);
  const created = !u && state && 'ok' in state && state.ok ? (state as unknown as { id: string; emailSent: boolean; link?: string }) : null;
  const losingLeads = !!u && openLeads > 0 && (!active || !advisor);

  if (created) return <InviteResult title="Usuario creado" r={created} />;
  return (
    <form action={action} className="mt-6 space-y-6">
      <Section title="Datos">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('name')} label="Nombre completo *"><input id={f('name')} name="full_name" required maxLength={120} defaultValue={u?.full_name} className="input" /></Field>
          <Field id={f('email')} label="Correo *" hint={u ? 'El correo no se cambia: es el usuario de acceso.' : 'Recibirá aquí el enlace para activar su cuenta.'}>
            <input id={f('email')} name="email" type="email" required defaultValue={u?.email} readOnly={!!u} className={`input ${u ? 'bg-surface text-muted' : ''}`} />
          </Field>
          <Field id={f('phone')} label="Teléfono"><input id={f('phone')} name="phone" type="tel" defaultValue={u?.phone ?? ''} className="input" /></Field>
          <Field id={f('role')} label="Rol *" hint={self ? 'No puedes cambiar tu propio rol.' : undefined}>
            <select id={f('role')} name="role" defaultValue={u?.role ?? 'ventas'} className="input" disabled={self}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {self && <input type="hidden" name="role" value={u!.role} />}
          </Field>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="is_advisor" checked={advisor} onChange={(e) => setAdvisor(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span><b>Asesor comercial</b><span className="block text-muted">Recibe leads nuevos por turno rotativo.</span></span>
          </label>
          {u && <input type="hidden" name="active_field" value="1" />}
          {u && (
            <label className={`flex items-start gap-2 text-sm sm:col-span-2 ${self ? 'opacity-50' : ''}`}>
              <input type="checkbox" name="active" checked={active} disabled={self} onChange={(e) => setActive(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span><b>Activo</b><span className="block text-muted">{self ? 'No puedes desactivar tu propia cuenta.' : 'Al desactivarlo pierde el acceso de inmediato. Su historial se conserva.'}</span></span>
              {self && <input type="hidden" name="active" value="on" />}
            </label>
          )}
        </div>
      </Section>
      {losingLeads && (
        <Section title="Leads abiertos">
          <p className="text-sm">Tiene <b>{openLeads}</b> lead(s) abierto(s) asignado(s).</p>
          <div className="mt-3 sm:w-1/2">
            <Field id={f('re')} label="Reasignarlos a">
              <select id={f('re')} name="reassign_to" defaultValue="" className="input">
                <option value="">No reasignar (quedan con este usuario)</option>
                {advisors.filter((a) => a.id !== u!.id).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </Field>
          </div>
        </Section>
      )}
      <div>
        {state?.error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{state.error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : u ? 'Guardar cambios' : 'Crear e invitar'}</button>
      </div>
    </form>
  );
}

function InviteResult({ title, r }: { title: string; r: { id?: string; emailSent: boolean; link?: string } }) {
  return (
    <div role="status" className="card mt-6 p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {r.emailSent ? <p className="mt-2 text-sm">Le enviamos por correo un enlace para elegir su contraseña (vence en 24 horas).</p> : (
        <>
          <p className="mt-2 text-sm">No se pudo enviar el correo (no hay proveedor de correo configurado). Comparte este enlace personal solo con esa persona; es de un solo uso y vence en 24 horas:</p>
          <input readOnly value={r.link} aria-label="Enlace de activación" className="input mt-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
      {r.id && <Link href={`/admin/usuarios/${r.id}`} className="btn-ghost mt-4">Ver usuario</Link>}
    </div>
  );
}

/** Reenvía un enlace de acceso (activación o nueva contraseña). */
export function AccessLink({ id, activated }: { id: string; activated: boolean }) {
  const [state, action, pending] = useActionState(sendAccessLinkAction.bind(null, id), null);
  if (state && 'ok' in state && state.ok) return <InviteResult title="Enlace generado" r={state as { emailSent: boolean; link?: string }} />;
  return (
    <section className="card mt-6 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{activated ? 'Restablecer contraseña' : 'Reenviar invitación'}</h2>
      <p className="mt-1 text-sm text-muted">{activated ? 'Envía un enlace para que elija una nueva contraseña.' : 'Aún no activa su cuenta. Envía un enlace nuevo (el anterior deja de servir).'}</p>
      <form action={action} className="mt-4">
        {state?.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
        <button className="btn-ghost" disabled={pending}>{pending ? 'Generando…' : 'Enviar enlace'}</button>
      </form>
    </section>
  );
}
