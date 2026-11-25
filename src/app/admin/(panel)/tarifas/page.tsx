import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Tarifas eléctricas', description: 'Pliego tarifario usado por la calculadora', alternates: { canonical: '/admin/tarifas' } };
const SEG: Record<string, string> = { residencial: 'Residencial', comercial: 'Comercial', industrial: 'Industrial' };

export default async function Page({ searchParams }: { searchParams: Promise<{ desactivada?: string }> }) {
  await requireStaff('tariffs');
  const { desactivada } = await searchParams;
  const tariffs = [...await getStore().listTariffs()].sort((a, b) => a.segment.localeCompare(b.segment) || a.code.localeCompare(b.code));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tarifas eléctricas</h1>
          <p className="mt-1 text-sm text-muted">Pliego tarifario ARCONEL vigente que usa la calculadora. Indica siempre la fuente.</p>
        </div>
        <Link href="/admin/tarifas/nueva" className="btn-dark">Nueva tarifa</Link>
      </div>
      {desactivada && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Tarifa {desactivada} desactivada: ya no se ofrece en la calculadora.</p>}
      <div className="card relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Tarifas activas</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>{['Tarifa', 'Segmento', 'Tensión', 'Bloques de energía', 'Demanda', 'Estado'].map((h) => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {tariffs.map((t) => (
              <tr key={t.id ?? t.code} className="border-t border-line align-top">
                <td className="px-4 py-3">{t.id ? <Link href={`/admin/tarifas/${t.id}`} className="font-medium hover:underline">{t.code}</Link> : <span className="font-medium">{t.code}</span>}<p className="text-xs text-muted">{t.name}</p></td>
                <td className="px-4 py-3">{SEG[t.segment]}</td>
                <td className="px-4 py-3">{t.voltage_level}</td>
                <td className="px-4 py-3 tabular-nums text-xs">{t.energy_blocks.map((b, i) => <span key={i} className="block">{b.from_kwh}–{b.to_kwh ?? '∞'} kWh: ${b.usd_per_kwh}</span>)}</td>
                <td className="px-4 py-3 tabular-nums">{t.has_demand_charge ? `$${t.demand_usd_per_kw}/kW` : '—'}</td>
                <td className="px-4 py-3">{t.is_placeholder ? <span className="placeholder-badge">Provisional</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Validada</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
