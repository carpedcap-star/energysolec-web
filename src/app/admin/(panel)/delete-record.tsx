'use client';
import { useActionState } from 'react';

type Action = (prev: unknown, fd: FormData) => Promise<{ error?: string }>;

/** Zona de eliminación con confirmación. La acción llega ligada al id desde el componente de servidor. */
export function DeleteRecord({ action, name, title, note, confirmText }: { action: Action; name: string; title: string; note: string; confirmText?: string }) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <section className="card mt-10 border-red-200 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{note}</p>
      <form action={run} onSubmit={(e) => { if (!confirm(confirmText ?? `¿Eliminar definitivamente «${name}»?`)) e.preventDefault(); }} className="mt-4">
        {state?.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
        <button className="btn border border-red-300 bg-white text-red-700 hover:bg-red-50" disabled={pending}>{pending ? 'Eliminando…' : title}</button>
      </form>
    </section>
  );
}
