'use client';
import { useActionState } from 'react';
import { runJobsAction } from '../../actions';
import { summaryText } from '@/lib/services/followup';

export function RunJobsButton() {
  const [state, action, pending] = useActionState(runJobsAction, null);
  return (
    <form action={action} className="space-y-3">
      <button className="btn-dark" disabled={pending}>{pending ? 'Ejecutando…' : 'Ejecutar tareas ahora'}</button>
      {state?.ok && <p role="status" className="rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Listo. {summaryText(state.summary)}</p>}
      {state?.error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
