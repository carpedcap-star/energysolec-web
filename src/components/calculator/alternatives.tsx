import type { StudyResult } from '@/lib/engine/study';
import { fmtKwh, fmtKwp, fmtNum, fmtPct, fmtUsd, fmtYears } from '@/lib/format';

const SURFACE_LABEL: Record<string, string> = { techo_metalico: 'Techo de metal', techo_inclinado: 'Techo inclinado', losa: 'Losa', terreno: 'Terreno' };

/** Comparación de las tres alternativas (On Grid, híbrida y aislada) y del espacio disponible. Escenario base. */
export function AlternativesComparison({ r }: { r: StudyResult }) {
  const alts = r.alternatives ?? [];
  const s = r.surfaces;
  if (!alts.length) return null;
  return (
    <section className="space-y-4" aria-labelledby="alt-h">
      <div>
        <h3 id="alt-h" className="font-display text-2xl font-extrabold">Compara tus alternativas</h3>
        <p className="mt-1 text-sm text-muted">Dimensionamiento preliminar con el escenario base. La propuesta final se confirma con la visita técnica.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {alts.map((a) => {
          const f = a.scenarios.base;
          const rec = r.recommended === a.key;
          return (
            <article key={a.key} className={`card flex min-w-0 flex-col p-5 ${rec ? 'ring-2 ring-brand' : ''} ${a.applicable ? '' : 'opacity-80'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold [overflow-wrap:anywhere]">{a.name}</h4>
                {rec && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-dark">Recomendada</span>}
              </div>
              {a.labels.length > 0 && <p className="mt-1 text-xs font-medium text-brand-accent">{a.labels.join(' · ')}</p>}
              {!a.applicable ? (
                <p className="mt-3 text-sm text-muted">{a.reason ?? 'No aplica para tu caso.'}</p>
              ) : (
                <>
                  <dl className="mt-4 grid gap-2 text-sm">
                    <Row k="Potencia" v={`${fmtKwp(a.kwp)} · ${a.modules} módulos`} />
                    <Row k="Inversor" v={`${fmtNum(a.inverterKw)} kW`} />
                    {a.battery && <Row k="Baterías" v={`${fmtNum(a.battery.nominalKwh)} kWh (${fmtNum(a.battery.usableKwh)} útiles)`} />}
                    {a.battery?.backupHours != null && <Row k="Respaldo estimado" v={`${fmtNum(a.battery.backupHours, 0)} h${a.battery.backupKw ? ` a ${fmtNum(a.battery.backupKw)} kW` : ''}`} />}
                    <Row k="Área requerida" v={`${fmtNum(a.areaM2, 0)} m²`} />
                    <Row k="Generación año 1" v={fmtKwh(a.annualGenerationKwh)} />
                    <Row k="Cobertura del consumo" v={fmtPct(a.coverage)} />
                    <Row k="Inversión (IVA incl.)" v={fmtUsd(f.capex.total)} strong />
                    {a.key === 'offGrid' ? <>
                      {a.reliability != null && <Row k="Suministro simulado" v={fmtPct(a.reliability)} />}
                      {a.costOfEnergyUsdPerKwh != null && <Row k="Costo de tu energía" v={`$${a.costOfEnergyUsdPerKwh.toFixed(3)}/kWh`} />}
                      <Row k="Planilla actual evitada" v={`${fmtUsd(a.billBeforeYear)}/año`} />
                    </> : <>
                      <Row k="Ahorro año 1" v={fmtUsd(a.savingYear1)} strong />
                      <Row k="Planilla anual" v={`${fmtUsd(a.billBeforeYear)} → ${fmtUsd(a.billAfterYear)}`} />
                    </>}
                    <Row k="Retorno simple" v={fmtYears(f.simplePayback)} />
                    <Row k="VAN" v={fmtUsd(f.npv)} />
                    <Row k="TIR" v={f.irr == null ? 'n/d' : fmtPct(f.irr)} />
                  </dl>
                  {a.batteryEconomicBenefitYear1 != null && a.batteryEconomicBenefitYear1 > 0 && (
                    <p className="mt-3 text-xs text-muted">De ese ahorro, {fmtUsd(a.batteryEconomicBenefitYear1)} al año se deben a las baterías; el resto del valor de las baterías es el respaldo ante apagones.</p>
                  )}
                  {a.residualCharges.length > 0 && <p className="mt-3 text-xs text-muted">Sigues pagando: {a.residualCharges.join(', ')}.</p>}
                </>
              )}
              {a.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-amber-900">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            </article>
          );
        })}
      </div>
      {s && (
        <div className="card p-5 text-sm">
          <p className="font-semibold">Tu espacio disponible</p>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Row k="Potencia ideal para tu consumo" v={fmtKwp(s.idealKwp)} />
            <Row k="Potencia recomendada" v={fmtKwp(s.recommendedKwp)} />
            <Row k="Área que necesitarías" v={`${fmtNum(s.requiredAreaM2, 0)} m²`} />
            <Row k="Máximo instalable en tu espacio" v={s.maxKwp == null ? 'Sin dato de área' : fmtKwp(s.maxKwp)} />
            {s.coverageReachable != null && <Row k="Cobertura alcanzable" v={fmtPct(s.coverageReachable)} />}
          </dl>
          {s.perSurface.length > 0 && (
            <ul className="mt-3 space-y-1 text-muted">{s.perSurface.map((p) => (
              <li key={p.type}>{SURFACE_LABEL[p.type] ?? p.type}: {p.areaM2 == null ? 'área por confirmar' : `${fmtNum(p.areaM2, 0)} m² (hasta ${fmtKwp(p.maxKwp ?? 0)})`}{p.usedKwp > 0 ? ` · se usan ${fmtKwp(p.usedKwp)}` : ''}</li>
            ))}</ul>
          )}
          {s.additionalKwp > 0 && <p className="mt-3 text-amber-900">Para cubrir tu consumo ideal faltarían {fmtKwp(s.additionalKwp)} (unos {fmtNum(s.additionalAreaM2, 0)} m² más).</p>}
          {!s.areaKnown && <p className="mt-3 text-muted">No indicaste el área: confirmaremos el espacio en la visita técnica.</p>}
        </div>
      )}
    </section>
  );
}

const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className="flex min-w-0 justify-between gap-3 border-b border-line/70 pb-1"><dt className="text-muted">{k}</dt><dd className={`min-w-0 text-right tabular-nums [overflow-wrap:anywhere] ${strong ? 'font-semibold' : 'font-medium'}`}>{v}</dd></div>
);
