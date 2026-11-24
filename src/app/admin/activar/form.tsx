'use client';
import { useActionState } from 'react';
import { activateAction } from '../actions';

export function ActivateForm({ token, type }: { token: string; type: 'invite' | 'recovery' }) {
  const [state, action, pending] = useActionState(activateAction, null);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      <input type="hidden" name="token_hash" value={token} />
      <input type="hidden" name="type" value={type} />
      <div><label className="label" htmlFor="password">Nueva contraseña</label><input id="password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
      <div><label className="label" htmlFor="confirm">Repite la contraseña</label><input id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" className="input" /></div>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-dark w-full" disabled={pending}>{pending ? 'Guardando…' : 'Guardar y entrar'}</button>
    </form>
  );
}
