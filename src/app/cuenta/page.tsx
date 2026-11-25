import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getStore } from '@/lib/data/store';
import { getTradeAccount } from '@/lib/trade-auth';
import { tierLabel } from '@/lib/services/trade';
import { fmtUsd2 } from '@/lib/format';
import { tradeLogoutAction } from './actions';

export const metadata: Metadata = { title: 'Mi cuenta comercial', description: 'Tu cuenta de instalador o distribuidor y tus pedidos.', alternates: { canonical: '/cuenta' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, string> = { nuevo: 'Recibido', pendiente_contacto: 'Recibido', contactado: 'En revisión con un asesor', cotizado: 'Cotizado', confirmado: 'Confirmado', pagado: 'Pagado', en_preparacion: 'En preparación', despachado: 'Despachado', entregado: 'Entregado', cancelado: 'Cancelado' };

export default async function Page({ searchParams }: { searchParams: Promise<{ activada?: string }> }) {
  const t = await getTradeAccount();
  if (!t) redirect('/cuenta/ingresar');
  const { activada } = await searchParams;
  const orders = await getStore().listOrdersForTradeAccount(t.id);
  return (
    <section className="pb-24 pt-32">
      <div className="container-site">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Cuenta comercial · {tierLabel(t.tier)}</p>
            <h1 className="font-display mt-2 text-3xl font-extrabold [overflow-wrap:anywhere] sm:text-4xl">{t.company}</h1>
          </div>
          <form action={tradeLogoutAction}><button className="btn-ghost !py-2">Cerrar sesión</button></form>
        </div>
        {activada && <p className="mt-6 rounded-xl border-l-4 border-brand bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">Tu cuenta está activa. En la tienda ya ves los precios de {tierLabel(t.tier).toLowerCase()}.</p>}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
          <dl className="card divide-y divide-line self-start text-sm">
            {([['Contacto', t.contact_name], ['Correo', t.email], ['Teléfono', t.phone], ['Ciudad', t.city], ['RUC', t.ruc], ['Nivel de precios', tierLabel(t.tier)]] as [string, string | null][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3"><dt className="text-muted">{k}</dt><dd className="min-w-0 text-right font-medium [overflow-wrap:anywhere]">{v ?? '—'}</dd></div>
            ))}
          </dl>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Tus pedidos</h2><Link href="/tienda" className="btn-primary !py-2">Ir a la tienda</Link></div>
            {orders.length === 0 ? <p className="card mt-4 p-6 text-sm text-muted">Aún no registras pedidos con esta cuenta.</p> : (
              <div className="card relative mt-4 overflow-x-auto">
                <table className="w-full min-w-[30rem] text-left text-sm">
                  <thead className="text-xs text-muted"><tr><th className="px-5 py-3 font-medium">Pedido</th><th className="px-5 py-3 font-medium">Fecha</th><th className="px-5 py-3 font-medium">Estado</th><th className="px-5 py-3 text-right font-medium">Total estimado</th></tr></thead>
                  <tbody className="divide-y divide-line">{orders.map((o) => (
                    <tr key={o.id}><td className="px-5 py-3 font-medium">{o.number}</td><td className="px-5 py-3">{new Date(o.created_at).toLocaleDateString('es-EC')}</td><td className="px-5 py-3">{STATUS[o.status] ?? o.status}</td><td className="px-5 py-3 text-right tabular-nums">{fmtUsd2(o.total)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <p className="mt-4 text-xs text-muted">Para cambiar los datos de tu empresa o agregar otra persona de contacto, escríbenos por WhatsApp o correo.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
