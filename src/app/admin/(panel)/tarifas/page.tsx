import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { DISTRIBUTORS, OFFICIAL_TARIFFS, SCHEDULE } from '@/content/tarifas/pliego-2026';

export const metadata: Metadata = { title: 'Tarifas eléctricas', description: 'Pliego tarifario usado por la calculadora', alternates: { canonical: '/admin/tarifas' } };
const SEG: Record<string, string> = { residencial: 'Residencial', comercial: 'Comercial', industrial: 'Industrial' };

export default async function Page({ searchParams }: { searchParams: Promise<{ desactivada?: string }> }) {
  await requireStaff('tariffs');
  const { desactivada } = await searchParams;
  const params = await getStore().getActiveParams();
  const daysLeft = Math.ceil((Date.parse(`${SCHEDULE.validTo}T23:59:59-05:00`) - Date.now()) / 86_400_000);
  const tariffs = [...await getStore().listTariffs()].sort((a, b) => a.segment.localeCompare(b.segment) || a.code.localeCompare(b.code));
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Tarifas eléctricas</h1>
          <p className="mt-1 text-sm text-muted">Pliego oficial que usa la calculadora y tarifas manuales heredadas.</p>
        </div>
        <Link href="/admin/tarifas/nueva" className="btn-dark">Nueva tarifa</Link>
      </div>
      <section className="card mt-6 p-5 text-sm" aria-labelledby="pliego-h">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="pliego-h" className="font-semibold">Tarifa que usa la calculadora: {SCHEDULE.title}</h2>
          {params.financial.officialTariffsReviewed ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Revisado por Gerencia</span> : <span className="placeholder-badge">Provisional</span>}
        </div>
        <p className="mt-2 text-muted">Resoluciones {SCHEDULE.resolutions.join(', ')}. Vigencia del {SCHEDULE.validFrom} al {SCHEDULE.validTo}. {OFFICIAL_TARIFFS.length} tarifas (residencial, comercial e industrial) y {DISTRIBUTORS.length} distribuidoras, transcritas en el código y verificadas por pruebas contra el texto oficial. La distribuidora sale de la planilla o se sugiere por ubicación.</p>
        <p className="mt-2 text-muted">La revisión se marca en <Link href="/admin/parametros" className="text-brand-accent underline">Parámetros de cálculo</Link> (solo Gerencia). <a href={SCHEDULE.documentUrl} target="_blank" rel="noopener noreferrer" className="text-brand-accent underline">Documento oficial de ARCONEL</a>.</p>
        {daysLeft <= 45 && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-amber-950">{daysLeft > 0 ? `El pliego vence en ${daysLeft} días.` : 'El pliego venció.'} Cuando ARCONEL publique el siguiente, hay que transcribirlo y verificarlo antes de usarlo.</p>}
        <details className="mt-3">
          <summary className="cursor-pointer font-medium">Ver las {OFFICIAL_TARIFFS.length} tarifas oficiales</summary>
          <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">{OFFICIAL_TARIFFS.map((t) => <li key={t.code} className="[overflow-wrap:anywhere]"><span className="font-medium text-ink">{t.code}</span> · {t.officialName}</li>)}</ul>
        </details>
      </section>
      <p className="mt-6 text-sm text-muted">Tarifas manuales heredadas: la calculadora ya no las usa para nuevos estudios; se conservan como referencia de estudios anteriores.</p>
      {desactivada && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Tarifa {desactivada} desactivada: ya no se ofrece en la calculadora.</p>}
      <div className="card relative mt-3 overflow-x-auto">
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
