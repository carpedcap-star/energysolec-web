import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { TRADE_STATUS, TRADE_STATUS_STYLE as STATUS_STYLE, tierLabel } from '@/lib/services/trade';

export const metadata: Metadata = { title: 'Cuentas comerciales', description: 'Instaladores y distribuidores', robots: { index: false } };

const FILTERS: [string, string][] = [['', 'Todas'], ['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['suspendida', 'Suspendidas'], ['rechazada', 'Rechazadas']];

export default async function Page({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await requireStaff('trade');
  const { estado = '' } = await searchParams;
  const all = await getStore().listTradeAccounts();
  const list = estado ? all.filter((t) => t.status === estado) : all;
  const pending = all.filter((t) => t.status === 'pendiente').length;
  return (
    <div>
      <h1 className="text-2xl font-bold">Cuentas comerciales</h1>
      <p className="mt-1 text-sm text-muted">Instaladores y distribuidores que compran con precios de su nivel. Solicitan en <Link href="/profesionales" className="underline" target="_blank">/profesionales</Link>; solo Gerencia aprueba o suspende.</p>
      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filtrar por estado">
        {FILTERS.map(([v, l]) => <Link key={v} href={v ? `/admin/cuentas?estado=${v}` : '/admin/cuentas'} aria-current={estado === v ? 'page' : undefined} className={`rounded-full border px-3 py-1 text-sm ${estado === v ? 'border-brand-dark bg-brand-dark text-white' : 'border-line bg-white'}`}>{l}{v === 'pendiente' && pending ? ` (${pending})` : ''}</Link>)}
      </nav>
      <div className="card relative mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Cuentas comerciales</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>{['Empresa', 'Nivel', 'Contacto', 'Ciudad', 'Solicitud', 'Estado'].map((h) => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="border-t border-line align-top">
                <td className="px-4 py-3"><Link href={`/admin/cuentas/${t.id}`} className="font-medium hover:underline">{t.company}</Link><p className="text-xs text-muted">RUC {t.ruc}</p></td>
                <td className="px-4 py-3">{tierLabel(t.tier)}</td>
                <td className="px-4 py-3">{t.contact_name}<p className="text-xs text-muted">{t.email}</p></td>
                <td className="px-4 py-3">{t.city ?? '—'}</td>
                <td className="px-4 py-3 whitespace-nowrap">{new Date(t.created_at).toLocaleDateString('es-EC')}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[t.status]}`}>{TRADE_STATUS[t.status]}</span>{t.status === 'aprobada' && !t.activated && <p className="mt-1 text-xs text-muted">Sin activar</p>}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No hay cuentas {estado ? 'con ese estado' : 'todavía'}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
