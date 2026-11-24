'use client';
import { useActionState } from 'react';
import { loginAction } from '../actions';
export function LoginForm({ dev }: { dev: boolean }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      {dev ? (
        <div><label className="label" htmlFor="role">Rol de prueba (solo desarrollo)</label>
          <select id="role" name="role" className="input">{['superadmin', 'gerencia', 'marketing', 'ventas', 'ingenieria', 'compras'].map((r) => <option key={r}>{r}</option>)}</select></div>
      ) : (
        <div><label className="label" htmlFor="email">Correo</label><input id="email" name="email" type="email" required className="input" autoComplete="username" /></div>
      )}
      <div><label className="label" htmlFor="password">Contraseña</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-dark w-full" disabled={pending}>{pending ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
  );
}
