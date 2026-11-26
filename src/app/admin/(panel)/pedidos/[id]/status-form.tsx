'use client';
import { useActionState } from 'react';
import { updateOrderAction } from '../../../actions';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/data/types';
export function OrderStatusForm({ id, status, canVerify, verified }: { id: string; status: OrderStatus; canVerify: boolean; verified: boolean }) {
  const [state, action, pending] = useActionState(updateOrderAction.bind(null, id), null);
  return (
    <form action={action} className="card space-y-4 self-start p-5">
      <label htmlFor="order-status" className="block font-semibold">Estado del pedido</label>
      <select id="order-status" name="status" defaultValue={status} className="input">{ORDER_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
      {!verified && canVerify && <div><label className="label" htmlFor="ref">Referencia verificable del pago</label><input id="ref" name="payment_reference" className="input" placeholder="N.º de transferencia, voucher…" /><p className="mt-1 text-xs text-muted">Obligatoria para marcar como Pagado o estados posteriores.</p></div>}
      {!verified && !canVerify && <p className="text-xs text-muted">Solo Gerencia puede verificar pagos.</p>}
      {state?.error && <p className="text-sm text-red-600" role="alert">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700" role="status">Actualizado.</p>}
      <button className="btn-dark w-full" disabled={pending}>Guardar</button>
    </form>
  );
}
