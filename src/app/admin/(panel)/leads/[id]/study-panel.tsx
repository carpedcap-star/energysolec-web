import type { Study } from '@/lib/data/types';
import { fmtEc } from '@/lib/services/followup';
import { summaryOf } from '@/components/calculator/alternatives';
import { fmtKwh, fmtKwp, fmtNum, fmtPct, fmtUsd, fmtYears } from '@/lib/format';

const SURFACE: Record<string, string> = { techo_metalico: 'Techo de metal', techo_inclinado: 'Techo inclinado', losa: 'Losa', terreno: 'Terreno' };

/** Resumen del estudio en la ficha del lead: alternativas, inversión, ahorro, retorno, área y almacenamiento (escenario base). */
export function StudyPanel({ studies }: { studies: Study[] }) {
  return (
    <section className="mt-8" aria-labelledby="studies-h">
      <h2 id="studies-h" className="font-semibold">Estudios de la calculadora</h2>
      {studies.map((st) => {
        const r = st.results;
        const inp = st.inputs as { surfaces?: { type: string; areaM2: number | null }[]; backup?: string; backupHours?: number; tariffCode?: string };
        const alts = r.alternatives ?? [];
        return (
          <article key={st.id} className="card mt-3 p-5 text-sm">
            <p className="font-medium">{st.code} <span className="font-normal text-muted">· {fmtEc(st.created_at)} · {r.tariff.name}{r.tariff.isPlaceholder ? ' (provisional)' : ''}</span></p>
            <p className="mt-1 text-muted">
              Consumo {fmtKwh(r.consumption.annualKwh)}/año{r.consumption.estimatedFromBill ? ' (estimado desde la factura)' : ''}
              {inp.surfaces?.length ? ` · Superficies: ${inp.surfaces.map((s) => `${SURFACE[s.type] ?? s.type} ${s.areaM2 == null ? '(área por confirmar)' : `${fmtNum(s.areaM2, 0)} m²`}`).join(', ')}` : ' · Superficie no indicada'}
              {inp.backup && inp.backup !== 'ninguno' ? ` · Respaldo ${inp.backup}${inp.backupHours ? ` ${inp.backupHours} h` : ''}` : ''}
            </p>
            {alts.length > 0 ? (
              <div className="relative mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">Alternativas del estudio {st.code}</caption>
                  <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr>{['Alternativa', 'Potencia', 'Baterías', 'Área', 'Inversión', 'Ahorro anual', 'Retorno simple', 'TIR'].map((h) => <th key={h} scope="col" className="py-2 pr-3">{h}</th>)}</tr></thead>
                  <tbody>{alts.map((a) => {
                    const f = a.scenarios.base;
                    return (
                      <tr key={a.key} className="border-t border-line">
                        <th scope="row" className="py-2 pr-3 text-left font-medium">{a.name}{r.recommended === a.key ? ' ★' : ''}</th>
                        {a.applicable ? <>
                          <td className="py-2 pr-3 tabular-nums">{fmtKwp(a.kwp)}</td>
                          <td className="py-2 pr-3 tabular-nums">{a.battery ? `${fmtNum(a.battery.nominalKwh)} kWh` : '—'}</td>
                          <td className="py-2 pr-3 tabular-nums">{fmtNum(a.areaM2, 0)} m²</td>
                          <td className="py-2 pr-3 tabular-nums">{fmtUsd(summaryOf(a).investmentUsd)}</td>
                          <td className="py-2 pr-3 tabular-nums">{fmtUsd(summaryOf(a).savingYearUsd)}</td>
                          <td className="py-2 pr-3 tabular-nums">{fmtYears(summaryOf(a).paybackYears)}</td>
                          <td className="py-2 pr-3 tabular-nums">{f.irr == null ? 'n/d' : fmtPct(f.irr)}</td>
                        </> : <td colSpan={7} className="py-2 pr-3 text-muted">No aplica: {a.reason ?? '—'}</td>}
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2">Sistema {fmtKwp(r.sizing.kwp)} · inversión {fmtUsd(r.scenarios.base.capex.total)} · ahorro año 1 {fmtUsd(r.scenarios.base.savingYear1)} · retorno {fmtYears(r.scenarios.base.simplePayback)}.</p>
            )}
            {r.surfaces && <p className="mt-2 text-muted">Potencia ideal {fmtKwp(r.surfaces.idealKwp)} · área necesaria {fmtNum(r.surfaces.requiredAreaM2, 0)} m² · máximo instalable {r.surfaces.maxKwp == null ? 'sin dato de área' : fmtKwp(r.surfaces.maxKwp)}.</p>}
          </article>
        );
      })}
    </section>
  );
}
