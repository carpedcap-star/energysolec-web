'use client';
import { useActionState } from 'react';
import { loginAction } from '../actions';
export function LoginForm({ dev }: { dev: boolean }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <div><label className="label" htmlFor="email">Correo{dev ? ' (usuario creado en el panel)' : ''}</label><input id="email" name="email" type="email" required={!dev} className="input" autoComplete="username" /></div>
      {dev && (
        <div><label className="label" htmlFor="role">Rol de prueba (solo desarrollo)</label>
          <select id="role" name="role" className="input" aria-describedby="role-hint">{['superadmin', 'gerencia', 'marketing', 'ventas', 'ingenieria', 'compras'].map((r) => <option key={r}>{r}</option>)}</select>
          <p id="role-hint" className="mt-1 text-xs text-muted">Se usa si dejas el correo vacío, con la contraseña de desarrollo.</p></div>
      )}
      <div><label className="label" htmlFor="password">Contraseña</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-dark w-full" disabled={pending}>{pending ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
  );
}
