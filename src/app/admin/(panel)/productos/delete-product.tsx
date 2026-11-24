'use client';
import { useActionState } from 'react';
import { deleteProductAction } from '../../actions';

export function DeleteProduct({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteProductAction.bind(null, id), null);
  return (
    <section className="card mt-10 border-red-200 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Eliminar producto</h2>
      <p className="mt-1 text-sm text-muted">Si el producto ya figura en pedidos no se puede eliminar: despublícalo para conservar el historial.</p>
      <form action={action} onSubmit={(e) => { if (!confirm(`¿Eliminar definitivamente «${name}»?`)) e.preventDefault(); }} className="mt-4">
        {state?.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
        <button className="btn border border-red-300 bg-white text-red-700 hover:bg-red-50" disabled={pending}>{pending ? 'Eliminando…' : 'Eliminar producto'}</button>
      </form>
    </section>
  );
}
