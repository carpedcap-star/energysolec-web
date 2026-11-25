'use client';
import { useActionState, useState } from 'react';
import { reviewTradeAction, sendTradeAccessLinkAction } from '../../../actions';
import { TRADE_TIERS } from '@/lib/services/trade';

type Result = { error?: string; ok?: boolean; emailSent?: boolean; link?: string } | null;

function LinkResult({ title, r }: { title: string; r: Result }) {
  return (
    <div role="status" className="card p-5">
      <h2 className="font-semibold">{title}</h2>
      {r?.emailSent ? <p className="mt-2 text-sm">Le enviamos por correo el enlace para activar su acceso (vence en 24 horas).</p> : (
        <>
          <p className="mt-2 text-sm">No se pudo enviar el correo (no hay proveedor configurado). Comparte este enlace personal solo con el contacto de la empresa; es de un solo uso y vence en 24 horas:</p>
          <input readOnly value={r?.link ?? ''} aria-label="Enlace de activación" className="input mt-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </>
      )}
      <a href="" className="btn-ghost mt-4">Actualizar la ficha</a>
    </div>
  );
}

export function ReviewForm({ id, tier, options }: { id: string; tier: string; options: [string, string][] }) {
  const [state, action, pending] = useActionState<Result, FormData>(reviewTradeAction.bind(null, id), null);
  const [status, setStatus] = useState(options[0][0]);
  if (state?.ok) return <LinkResult title="Cuenta aprobada" r={state} />;
  return (
    <form action={action} className="card space-y-4 p-5" noValidate>
      <h2 className="font-semibold">Revisión</h2>
      <fieldset>
        <legend className="label">Nuevo estado</legend>
        <div className="space-y-2">{options.map(([v, l]) => (
          <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="status" value={v} checked={status === v} onChange={() => setStatus(v)} /> {l}</label>
        ))}</div>
      </fieldset>
      <div>
        <label className="label" htmlFor="rv-tier">Nivel de precios</label>
        <select id="rv-tier" name="tier" defaultValue={tier} className="input">{TRADE_TIERS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      </div>
      <div>
        <label className="label" htmlFor="rv-note">Nota {status === 'aprobada' ? '(opcional)' : '*'}</label>
        <textarea id="rv-note" name="review_note" rows={3} maxLength={1000} className="input" placeholder={status === 'aprobada' ? 'Ej.: RUC verificado en el SRI.' : 'Motivo (queda en el historial).'} />
      </div>
      {status === 'aprobada' && <p className="text-xs text-muted">Al aprobar se crea el acceso y se envía al contacto un enlace para elegir su contraseña. Verifica antes el RUC en el SRI.</p>}
      {state?.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-dark w-full" disabled={pending}>{pending ? 'Guardando…' : 'Guardar revisión'}</button>
    </form>
  );
}

export function TradeAccessLink({ id, activated }: { id: string; activated: boolean }) {
  const [state, action, pending] = useActionState<Result, FormData>(sendTradeAccessLinkAction.bind(null, id), null);
  if (state?.ok) return <LinkResult title="Enlace generado" r={state} />;
  return (
    <form action={action} className="card p-5">
      <h2 className="font-semibold">{activated ? 'Restablecer contraseña' : 'Reenviar enlace de activación'}</h2>
      <p className="mt-1 text-sm text-muted">{activated ? 'Envía un enlace para que elija una nueva contraseña.' : 'Aún no activa su acceso. El enlace anterior deja de servir.'}</p>
      {state?.error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn-ghost mt-4" disabled={pending}>{pending ? 'Generando…' : 'Enviar enlace'}</button>
    </form>
  );
}
