import Link from 'next/link';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { ORDER_STATUSES } from '@/lib/data/types';
import { fmtUsd2 } from '@/lib/format';
export default async function Page() {
  await requireStaff('orders');
  const orders = await getStore().listOrders();
  return (
    <div>
      <h1 className="text-2xl font-bold">Pedidos</h1>
      <div className="card mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted"><tr>{['Número', 'Fecha', 'Cliente', 'Ciudad', 'Total', 'Instalación', 'Estado'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id} className="border-t border-line hover:bg-surface">
              <td className="px-4 py-3"><Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">{o.number}</Link></td>
              <td className="px-4 py-3 text-muted">{new Date(o.created_at).toLocaleString('es-EC')}</td>
              <td className="px-4 py-3">{o.customer_name}<p className="text-xs text-muted">{o.customer_type}</p></td>
              <td className="px-4 py-3">{o.city}</td><td className="px-4 py-3 tabular-nums">{fmtUsd2(o.total)}</td>
              <td className="px-4 py-3">{o.needs_installation ? 'Sí' : 'No'}</td>
              <td className="px-4 py-3"><span className="rounded-full bg-surface px-2 py-0.5 text-xs">{ORDER_STATUSES.find((s) => s.id === o.status)?.label}</span></td>
            </tr>))}
            {!orders.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">Sin pedidos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
