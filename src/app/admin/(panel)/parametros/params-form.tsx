'use client';
import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { saveParamsAction } from '../../actions';
import { PARAM_SECTIONS, SCENARIO_FIELDS, SCENARIOS, type ParamField } from '@/lib/services/params-form';
import { fmtUsd } from '@/lib/format';
import { IconBtn, Section } from '../form-ui';

type Tier = { key: number; up: string; price: string };
const SAMPLE_KWP = [3, 10, 50, 200, 1000];

export function ParamsForm({ values, tiers: initialTiers, validated, canValidate }: { values: Record<string, string>; tiers: { up: string; price: string }[]; validated: boolean; canValidate: boolean }) {
  const [state, action, pending] = useActionState(saveParamsAction, null);
  const [exportMode, setExportMode] = useState(values['financial.exportCompensation']);
  const [tiers, setTiers] = useState<Tier[]>(() => initialTiers.map((t, i) => ({ key: i, ...t })));
  const [next, setNext] = useState(initialTiers.length);
  const errRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state?.error) errRef.current?.focus(); }, [state]);

  const tierFor = (kwp: number) => {
    const list = tiers.map((t, i) => ({ up: i === tiers.length - 1 || t.up === '' ? Infinity : Number(t.up), price: Number(t.price) }));
    return list.find((t) => kwp <= t.up) ?? list.at(-1);
  };
  const setTier = (key: number, patch: Partial<Tier>) => setTiers((t) => t.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  return (
    // Envío manual: con <form action>, React reinicia los campos al terminar y se perdería lo escrito ante un error.
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="mt-6 space-y-6" noValidate>
      <Section title="Precio llave en mano por kWp" intro="USD por kWp sin IVA, por tramo de tamaño. Cada tramo aplica hasta la potencia indicada; el último cubre cualquier tamaño mayor.">
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Tramos de precio por kWp</caption>
            <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th scope="col" className="py-2">Tramo</th><th scope="col" className="py-2">Hasta (kWp)</th><th scope="col" className="py-2">USD/kWp</th><th /></tr></thead>
            <tbody>
              {tiers.map((t, i) => {
                const last = i === tiers.length - 1;
                return (
                  <tr key={t.key} className="border-t border-line">
                    <td className="py-2 pr-2 text-muted">{i + 1}</td>
                    <td className="py-2 pr-2">
                      {last ? (
                        <><span className="block px-1 text-muted">Sin límite</span><input type="hidden" name="tier_up" value="" /></>
                      ) : (
                        <>
                          <label htmlFor={`tu-${t.key}`} className="sr-only">Tramo {i + 1}: hasta kWp</label>
                          <input id={`tu-${t.key}`} name="tier_up" type="number" min={0} step="any" value={t.up} onChange={(e) => setTier(t.key, { up: e.target.value })} className="input tabular-nums" />
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <label htmlFor={`tp-${t.key}`} className="sr-only">Tramo {i + 1}: USD por kWp</label>
                      <input id={`tp-${t.key}`} name="tier_price" type="number" min={0} step="any" value={t.price} onChange={(e) => setTier(t.key, { price: e.target.value })} className="input tabular-nums" />
                    </td>
                    <td className="py-2 text-right"><IconBtn label={`Quitar tramo ${i + 1}`} disabled={tiers.length <= 1} onClick={() => setTiers((x) => x.filter((y) => y.key !== t.key))}>✕</IconBtn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-ghost mt-3 !py-2" onClick={() => {
          // El nuevo tramo se inserta antes del último (que siempre queda «sin límite»).
          setTiers((x) => [...x.slice(0, -1), { key: next, up: '', price: '' }, ...x.slice(-1)]); setNext((n) => n + 1);
        }}>Agregar tramo</button>
        <div className="mt-5 rounded-xl bg-surface p-4">
          <p className="text-sm font-semibold">Comprobación de tramos</p>
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2" aria-live="polite">
            {SAMPLE_KWP.map((k) => { const t = tierFor(k); const ok = t && Number.isFinite(t.price) && t.price > 0;
              return <li key={k} className="flex justify-between gap-3"><span className="text-muted">{k} kWp</span><span className="tabular-nums">{ok ? `${fmtUsd(t!.price)}/kWp · ${fmtUsd(t!.price * k)} base` : '—'}</span></li>; })}
          </ul>
          <p className="mt-2 text-xs text-muted">Precio base sin ingeniería ni IVA, para verificar qué tramo aplica a cada tamaño.</p>
        </div>
      </Section>

      {PARAM_SECTIONS.map((s) => (
        <Section key={s.id} title={s.title} intro={s.id === 'precios' ? undefined : s.intro}>
          <div className="grid gap-4 sm:grid-cols-2">
            {s.fields.map((f) => <ParamInput key={f.path} f={f} value={values[f.path]} exportMode={exportMode} onExportMode={setExportMode} />)}
          </div>
        </Section>
      ))}

      <Section title="Escenarios" intro="Factores sobre el escenario base. Conservador ≤ base ≤ optimista en generación y alza de tarifa; al revés en inversión.">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Factores por escenario</caption>
            <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th scope="col" className="py-2">Escenario</th>{SCENARIO_FIELDS.map(([k, l]) => <th key={k} scope="col" className="py-2">{l} (%)</th>)}</tr></thead>
            <tbody>
              {SCENARIOS.map(([sc, label]) => (
                <tr key={sc} className="border-t border-line">
                  <th scope="row" className="py-2 pr-2 text-left font-medium">{label}</th>
                  {SCENARIO_FIELDS.map(([k, l]) => {
                    const name = `financial.scenarios.${sc}.${k}`;
                    return <td key={k} className="py-2 pr-2"><label htmlFor={name} className="sr-only">{l} — {label}</label><input id={name} name={name} type="number" step="any" defaultValue={values[name]} className="input tabular-nums" /></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Validación">
        <label className={`flex items-start gap-2 text-sm ${canValidate ? '' : 'opacity-60'}`}>
          <input type="checkbox" name="validated" defaultChecked={validated} disabled={!canValidate} className="mt-0.5 h-4 w-4" />
          <span><b>Valores validados por Gerencia</b><span className="block text-muted">{canValidate
            ? 'Mientras no lo estén, cada estudio advierte al cliente que los precios son provisionales.'
            : 'Solo Gerencia puede validar. Al guardar, estos parámetros quedarán pendientes de su revisión.'}</span></span>
        </label>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {!pending && state?.error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{state.error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : 'Guardar como nueva versión'}</button>
      </div>
    </form>
  );
}

function ParamInput({ f, value, exportMode, onExportMode }: { f: ParamField; value: string; exportMode: string; onExportMode: (v: string) => void }) {
  const id = `p-${f.path}`;
  const hint = f.hint && <p id={`${id}-h`} className="mt-1 text-xs text-muted">{f.hint}</p>;
  if (f.kind === 'bool') return (
    <label className="flex items-start gap-2 text-sm sm:col-span-2">
      <input type="checkbox" name={f.path} defaultChecked={value === 'true'} className="mt-0.5 h-4 w-4" aria-describedby={f.hint ? `${id}-h` : undefined} />
      <span><b>{f.label}</b>{hint}</span>
    </label>
  );
  if (f.kind === 'enum') return (
    <div className="min-w-0 sm:col-span-2">
      <label htmlFor={id} className="label">{f.label}</label>
      <select id={id} name={f.path} value={exportMode} onChange={(e) => onExportMode(e.target.value)} className="input">
        {f.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {hint}
    </div>
  );
  const disabled = f.path === 'financial.exportPriceUsdPerKwh' && exportMode !== 'fixed_price';
  return (
    <div className={`min-w-0 ${disabled ? 'opacity-60' : ''}`}>
      <label htmlFor={id} className="label">{f.label}{f.unit ? <span className="font-normal text-muted"> ({f.unit})</span> : null}</label>
      <input id={id} name={f.path} type="number" step={f.step ?? 'any'} defaultValue={value} readOnly={disabled} aria-describedby={f.hint ? `${id}-h` : undefined} className="input tabular-nums" />
      {hint}
    </div>
  );
}
