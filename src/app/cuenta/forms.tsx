'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { tradeActivateAction, tradeLoginAction, tradeRecoverAction } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(tradeLoginAction, null);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <div><label className="label" htmlFor="c-email">Correo</label><input id="c-email" name="email" type="email" required autoComplete="email" className="input" defaultValue={state?.email ?? ''} key={state?.email ?? ''} /></div>
      <div><label className="label" htmlFor="c-pass">Contraseña</label><input id="c-pass" name="password" type="password" required autoComplete="current-password" className="input" /></div>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-dark w-full" disabled={pending}>{pending ? 'Ingresando…' : 'Ingresar'}</button>
      <p className="text-center text-sm"><Link href="/cuenta/recuperar" className="text-muted underline">¿Olvidaste tu contraseña?</Link></p>
    </form>
  );
}

export function ActivateForm({ token, type }: { token: string; type: 'invite' | 'recovery' }) {
  const [state, action, pending] = useActionState(tradeActivateAction, null);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token_hash" value={token} />
      <input type="hidden" name="type" value={type} />
      <div><label className="label" htmlFor="a-pass">Nueva contraseña</label><input id="a-pass" name="password" type="password" required autoComplete="new-password" className="input" /></div>
      <div><label className="label" htmlFor="a-confirm">Repite la contraseña</label><input id="a-confirm" name="confirm" type="password" required autoComplete="new-password" className="input" /></div>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-dark w-full" disabled={pending}>{pending ? 'Guardando…' : 'Guardar y entrar'}</button>
    </form>
  );
}

export function RecoverForm() {
  const [state, action, pending] = useActionState(tradeRecoverAction, null);
  if (state?.done) return <p className="mt-6 rounded-xl bg-surface p-4 text-sm" role="status">Si el correo corresponde a una cuenta comercial aprobada, te enviamos un enlace para elegir una nueva contraseña. Revisa también tu carpeta de spam.</p>;
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <div><label className="label" htmlFor="r-email">Correo de tu cuenta</label><input id="r-email" name="email" type="email" required autoComplete="email" className="input" /></div>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-dark w-full" disabled={pending}>{pending ? 'Enviando…' : 'Enviarme un enlace'}</button>
    </form>
  );
}
