import type { StudyResult } from '@/lib/engine/study';
import type { Alternative, AlternativeSummary } from '@/lib/engine/alternatives';
import { fmtKwp, fmtNum, fmtUsd, fmtYears } from '@/lib/format';

/** Resumen comercial de una alternativa; los estudios anteriores (sin `summary`) se resumen con la factura del motor. */
export function summaryOf(a: Alternative): AlternativeSummary {
  if (a.summary) return a.summary;
  const cur = a.billBeforeYear / 12, res = a.key === 'offGrid' ? 0 : a.billAfterYear / 12, inv = a.scenarios.base.capex.total;
  const sav = Math.max(0, cur - res);
  return { currentMonthlyUsd: cur, residualMonthlyUsd: res, savingMonthlyUsd: sav, savingYearUsd: sav * 12, investmentUsd: inv, paybackYears: sav > 0 ? inv / (sav * 12) : null };
}

const SOURCE: Record<string, string> = {
  planillas_12: 'promedio de tus últimas 12 planillas', planilla: 'tu planilla (referencia preliminar)', declarada: 'el valor que indicaste', estimada: 'estimado con la tarifa oficial',
};

/** Lo que el cliente necesita ver: hoy, con solar, ahorro, inversión y retorno; luego las tres alternativas. */
export function AlternativesComparison({ r }: { r: StudyResult }) {
  const alts = r.alternatives ?? [];
  if (!alts.length) return null;
  const rec = alts.find((a) => a.key === r.recommended && a.applicable) ?? alts.find((a) => a.applicable);
  const s = rec ? summaryOf(rec) : null;
  return (
    <section className="space-y-5" aria-labelledby="alt-h">
      {rec && s && (
        <div className="card overflow-hidden">
          <div className="bg-brand-dark p-5 text-white sm:p-6">
            <p className="text-sm text-white/70">Con {rec.name} ({fmtKwp(rec.kwp)})</p>
            <div className="mt-3 grid grid-cols-2 gap-4 lg:grid-cols-5">
              <Big l="Hoy pagas al mes" v={fmtUsd(s.currentMonthlyUsd)} />
              <Big l="Con energía solar pagarías" v={rec.key === 'offGrid' ? 'Sin planilla' : fmtUsd(s.residualMonthlyUsd)} />
              <Big l="Ahorras al mes" v={fmtUsd(s.savingMonthlyUsd)} accent />
              <Big l="Inviertes (IVA incl.)" v={fmtUsd(s.investmentUsd)} />
              <Big l="Recuperas tu inversión en" v={fmtYears(s.paybackYears)} accent />
            </div>
          </div>
          <p className="px-5 py-3 text-xs text-muted sm:px-6">Lo que pagas hoy: {SOURCE[r.billing?.source ?? 'estimada']}. Retorno simple = inversión ÷ ahorro anual ({fmtUsd(s.savingYearUsd)}), sin descontar mantenimiento.</p>
        </div>
      )}
      <h3 id="alt-h" className="font-display text-2xl font-extrabold">Compara tus alternativas</h3>
      <div className="grid gap-4 lg:grid-cols-3">
        {alts.map((a) => {
          const x = summaryOf(a);
          const isRec = r.recommended === a.key;
          return (
            <article key={a.key} className={`card flex min-w-0 flex-col p-5 ${isRec ? 'ring-2 ring-brand' : ''} ${a.applicable ? '' : 'opacity-80'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold [overflow-wrap:anywhere]">{a.name}</h4>
                {isRec && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-dark">Recomendada</span>}
              </div>
              {!a.applicable ? <p className="mt-3 text-sm text-muted">{a.reason ?? 'No aplica para tu caso.'}</p> : (
                <dl className="mt-4 grid gap-2 text-sm">
                  <Row k="Potencia" v={fmtKwp(a.kwp)} />
                  <Row k="Paneles" v={String(a.modules)} />
                  {a.battery && <Row k="Baterías" v={`${fmtNum(a.battery.nominalKwh, 0)} kWh · ${fmtNum(a.battery.backupHours ?? 0, 0)} h de respaldo`} />}
                  <Row k="Superficie" v={`${fmtNum(a.areaM2, 0)} m²`} />
                  <Row k="Inversión (IVA incl.)" v={fmtUsd(x.investmentUsd)} strong />
                  <Row k="Ahorro mensual" v={fmtUsd(x.savingMonthlyUsd)} strong />
                  <Row k="Ahorro anual" v={fmtUsd(x.savingYearUsd)} />
                  <Row k="Factura residual" v={a.key === 'offGrid' ? 'Sin planilla eléctrica' : `${fmtUsd(x.residualMonthlyUsd)}/mes`} />
                  <Row k="Retorno simple" v={fmtYears(x.paybackYears)} strong />
                </dl>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-xs text-muted">VAN, TIR, flujo de caja, escenarios y supuestos técnicos están en el informe PDF.</p>
    </section>
  );
}

const Big = ({ l, v, accent }: { l: string; v: string; accent?: boolean }) => (
  <div className="min-w-0"><p className="text-xs text-white/60">{l}</p><p className={`font-display mt-1 text-xl font-extrabold tabular-nums [overflow-wrap:anywhere] sm:text-2xl ${accent ? 'text-brand' : ''}`}>{v}</p></div>
);
const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className="flex min-w-0 justify-between gap-3 border-b border-line/70 pb-1"><dt className="text-muted">{k}</dt><dd className={`min-w-0 text-right tabular-nums [overflow-wrap:anywhere] ${strong ? 'font-semibold' : 'font-medium'}`}>{v}</dd></div>
);
