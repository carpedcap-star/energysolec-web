import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { can, requireStaff } from '@/lib/auth';
import { nextStatuses, TRADE_STATUS, TRADE_STATUS_STYLE as STATUS_STYLE, tierLabel } from '@/lib/services/trade';
import { staffNames } from '@/lib/staff-names';
import { fmtUsd2 } from '@/lib/format';
import { ReviewForm, TradeAccessLink } from './review-form';

export const metadata: Metadata = { title: 'Cuenta comercial', description: 'Revisión de cuenta comercial', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  const staff = await requireStaff('trade');
  const { id } = await params;
  const store = getStore();
  const [t, nameOf] = await Promise.all([store.getTradeAccount(id), staffNames()]);
  if (!t) notFound();
  const orders = await store.listOrdersForTradeAccount(t.id);
  const saved = (await searchParams).guardado === '1';
  const approver = can(staff, 'trade_approve');
  const options = nextStatuses(t.status).filter((s) => approver || (s !== 'aprobada' && s !== 'suspendida'));
  const info: [string, string | null][] = [
    ['RUC', t.ruc], ['Nivel solicitado / asignado', tierLabel(t.tier)], ['Contacto', t.contact_name], ['Correo', t.email], ['Teléfono', t.phone], ['Ciudad', t.city],
    ['Solicitud', new Date(t.created_at).toLocaleString('es-EC')], ['Sobre la empresa', t.notes],
    ['Última revisión', t.reviewed_at ? `${new Date(t.reviewed_at).toLocaleString('es-EC')}${t.approved_by ? ` · ${nameOf(t.approved_by)}` : ''}` : null], ['Nota de revisión', t.review_note],
  ];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        <nav className="mb-2 text-sm text-muted"><Link href="/admin/cuentas" className="hover:underline">Cuentas comerciales</Link> / {t.company}</nav>
        <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{t.company}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status]}`}>{TRADE_STATUS[t.status]}</span>
          {t.status === 'aprobada' && <span className="text-muted">{t.activated ? 'Acceso activado' : 'Aún no activa su acceso'}</span>}
          {t.lead_id && <Link href={`/admin/leads/${t.lead_id}`} className="underline">Ver lead</Link>}
        </p>
        {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados.</p>}
        <dl className="card mt-6 divide-y divide-line text-sm">{info.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:gap-4"><dt className="shrink-0 text-muted sm:w-48">{k}</dt><dd className="min-w-0 whitespace-pre-line [overflow-wrap:anywhere]">{v}</dd></div>)}</dl>
        <h2 className="mt-8 font-semibold">Pedidos con esta cuenta</h2>
        {orders.length === 0 ? <p className="mt-2 text-sm text-muted">Sin pedidos.</p> : (
          <ul className="card mt-3 divide-y divide-line text-sm">{orders.map((o) => <li key={o.id} className="flex flex-wrap justify-between gap-2 px-5 py-3"><Link href={`/admin/pedidos/${o.id}`} className="font-medium hover:underline">{o.number}</Link><span className="text-muted">{new Date(o.created_at).toLocaleDateString('es-EC')} · {fmtUsd2(o.total)}</span></li>)}</ul>
        )}
      </div>
      <div className="space-y-6 self-start">
        {options.length > 0
          ? <ReviewForm key={t.id} id={t.id} tier={t.tier} options={options.map((s) => [s, TRADE_STATUS[s]])} />
          : <p className="card p-5 text-sm text-muted">{t.status === 'rechazada' ? 'Solicitud rechazada. La empresa puede enviar una nueva.' : 'Solo Gerencia puede cambiar el estado de esta cuenta.'}</p>}
        {t.status === 'aprobada' && <TradeAccessLink id={t.id} activated={t.activated} />}
      </div>
    </div>
  );
}
