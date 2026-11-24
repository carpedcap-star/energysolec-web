import { notFound } from 'next/navigation';
import { getStore } from '@/lib/data/store';
import { requireStaff, can } from '@/lib/auth';
import { fmtUsd2 } from '@/lib/format';
import { waLink } from '@/lib/site';
import { OrderStatusForm } from './status-form';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff('orders');
  const { id } = await params;
  const o = await getStore().getOrder(id);
  if (!o) notFound();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-2xl font-bold">Pedido {o.number}</h1>
        <p className="mt-1 text-sm text-muted">{new Date(o.created_at).toLocaleString('es-EC')}</p>
        <div className="card mt-6 grid gap-2 p-5 text-sm sm:grid-cols-2">
          <p><span className="text-muted">Cliente:</span> {o.customer_name} ({o.customer_type})</p><p><span className="text-muted">Correo:</span> {o.email}</p>
          <p><span className="text-muted">Teléfono:</span> {o.phone}</p><p><span className="text-muted">Ciudad:</span> {o.city}</p>
          <p className="sm:col-span-2"><span className="text-muted">Dirección:</span> {o.address}</p>
          <p><span className="text-muted">Instalación:</span> {o.needs_installation ? 'Sí' : 'No'}</p>
          {o.notes && <p className="sm:col-span-2"><span className="text-muted">Observaciones:</span> {o.notes}</p>}
          {o.payment_verified_at && <p className="sm:col-span-2 text-green-800">Pago verificado: ref. {o.payment_reference} · {new Date(o.payment_verified_at).toLocaleString('es-EC')}</p>}
        </div>
        <table className="card mt-6 w-full text-sm">
          <thead className="bg-surface text-left text-xs uppercase text-muted"><tr><th className="px-4 py-2">Producto</th><th className="px-4 py-2">Cant.</th><th className="px-4 py-2">P. unit.</th><th className="px-4 py-2 text-right">Subtotal</th></tr></thead>
          <tbody>{o.items.map((i) => <tr key={i.sku} className="border-t border-line"><td className="px-4 py-2">{i.name}<p className="text-xs text-muted">{i.sku}</p></td><td className="px-4 py-2">{i.qty}</td><td className="px-4 py-2">{fmtUsd2(i.unit_price)}</td><td className="px-4 py-2 text-right">{fmtUsd2(i.line_subtotal)}</td></tr>)}</tbody>
          <tfoot className="border-t border-line"><tr><td colSpan={3} className="px-4 py-2 text-right text-muted">Subtotal / IVA / Total</td><td className="px-4 py-2 text-right font-semibold">{fmtUsd2(o.subtotal)} / {fmtUsd2(o.tax)} / {fmtUsd2(o.total)}</td></tr></tfoot>
        </table>
        <a className="btn mt-4 !bg-[#25D366] text-white" target="_blank" rel="noopener" href={waLink(`Hola ${o.customer_name.split(' ')[0]}, le escribimos de Energy Solutions Ecuador sobre su pedido ${o.number}.`, o.phone.replace(/\D/g, '').replace(/^0/, '593'))}>Contactar por WhatsApp</a>
      </div>
      <OrderStatusForm id={o.id} status={o.status} canVerify={can(staff, 'verify_payment')} verified={!!o.payment_verified_by} />
    </div>
  );
}
