'use client';
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { saveTariffAction } from '../../actions';
import type { Tariff } from '@/lib/engine/tariff';
import { buildBlocks, previewBills } from '@/lib/services/tariff-form';
import { fmtUsd2 } from '@/lib/format';
import { Field, IconBtn, Section } from '../form-ui';

type Row = { key: number; to: string; price: string };
const today = () => new Date().toISOString().slice(0, 10);

export function TariffForm({ tariff: t }: { tariff: Tariff | null }) {
  const [state, action, pending] = useActionState(saveTariffAction, null);
  const [rows, setRows] = useState<Row[]>(() => (t?.energy_blocks.length ? t.energy_blocks : [{ from_kwh: 0, to_kwh: null, usd_per_kwh: 0 }])
    .map((b, i) => ({ key: i, to: b.to_kwh == null ? '' : String(b.to_kwh), price: b.usd_per_kwh ? String(b.usd_per_kwh) : '' })));
  const [next, setNext] = useState(t?.energy_blocks.length ?? 1);
  const [hasDemand, setHasDemand] = useState(t?.has_demand_charge ?? false);
  const [demand, setDemand] = useState(t?.demand_usd_per_kw != null ? String(t.demand_usd_per_kw) : '');
  const [fixed, setFixed] = useState(String(t?.commercialization_usd ?? 0));
  const [other, setOther] = useState(t ? String(Math.round(t.other_charges_pct * 1e4) / 100) : '0');
  const errRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state?.error) errRef.current?.focus(); }, [state]);

  const setRow = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  // Inicio de cada bloque = fin del anterior (calculado, no editable).
  const froms = rows.map((_, i) => (i === 0 ? 0 : Number(rows[i - 1].to) || 0));
  const preview = useMemo(() => {
    const blocks = buildBlocks(rows.map((r, i) => ({ to: i === rows.length - 1 ? null : r.to === '' ? NaN : Number(r.to), price: Number(r.price) })));
    if (typeof blocks === 'string') return { error: blocks };
    const tt: Tariff = { code: 'X', name: 'X', segment: 'comercial', voltage_level: 'BT', has_demand_charge: hasDemand, energy_blocks: blocks,
      demand_usd_per_kw: hasDemand ? Number(demand) || 0 : null, commercialization_usd: Number(fixed) || 0, other_charges_pct: (Number(other) || 0) / 100, source_note: '', is_placeholder: true };
    return { bills: previewBills(tt) };
  }, [rows, hasDemand, demand, fixed, other]);

  return (
    // Envío manual: con <form action>, React reinicia los campos al terminar y se perdería lo escrito ante un error.
    <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }} className="mt-6 space-y-6" noValidate>
      {t?.id && <input type="hidden" name="id" value={t.id} />}
      <Section title="Tarifa">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="t-code" label="Código *" hint="Único entre las tarifas activas. Ej.: COM-BT-D."><input id="t-code" name="code" defaultValue={t?.code} maxLength={40} className="input uppercase" /></Field>
          <Field id="t-name" label="Nombre *"><input id="t-name" name="name" defaultValue={t?.name} maxLength={120} className="input" /></Field>
          <Field id="t-seg" label="Segmento *">
            <select id="t-seg" name="segment" defaultValue={t?.segment ?? 'comercial'} className="input"><option value="residencial">Residencial</option><option value="comercial">Comercial</option><option value="industrial">Industrial</option></select>
          </Field>
          <Field id="t-volt" label="Nivel de tensión *">
            <select id="t-volt" name="voltage_level" defaultValue={t?.voltage_level ?? 'BT'} className="input"><option value="BT">Baja tensión (BT)</option><option value="MT">Media tensión (MT)</option><option value="AT">Alta tensión (AT)</option></select>
          </Field>
        </div>
      </Section>

      <Section title="Cargo por energía" intro="Bloques crecientes de consumo mensual. Cada bloque empieza donde termina el anterior; el último no tiene límite.">
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Bloques de energía</caption>
            <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr><th scope="col" className="py-2">Desde (kWh)</th><th scope="col" className="py-2">Hasta (kWh)</th><th scope="col" className="py-2">USD/kWh</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const last = i === rows.length - 1;
                return (
                  <tr key={r.key} className="border-t border-line">
                    <td className="py-2 pr-2 tabular-nums text-muted">{froms[i]}</td>
                    <td className="py-2 pr-2">
                      {last ? <span className="block px-1 text-muted">Sin límite</span> : (
                        <>
                          <label htmlFor={`bt-${r.key}`} className="sr-only">Bloque {i + 1}: hasta kWh</label>
                          <input id={`bt-${r.key}`} type="number" min={0} step="any" value={r.to} onChange={(e) => setRow(r.key, { to: e.target.value })} className="input tabular-nums" />
                        </>
                      )}
                      <input type="hidden" name="block_to" value={last ? '' : r.to} />
                    </td>
                    <td className="py-2 pr-2">
                      <label htmlFor={`bp-${r.key}`} className="sr-only">Bloque {i + 1}: USD por kWh</label>
                      <input id={`bp-${r.key}`} name="block_price" type="number" min={0} step="0.0001" value={r.price} onChange={(e) => setRow(r.key, { price: e.target.value })} className="input tabular-nums" />
                    </td>
                    <td className="py-2 text-right"><IconBtn label={`Quitar bloque ${i + 1}`} disabled={rows.length <= 1} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>✕</IconBtn></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn-ghost mt-3 !py-2" onClick={() => { setRows((x) => [...x.slice(0, -1), { key: next, to: '', price: '' }, ...x.slice(-1)]); setNext((n) => n + 1); }}>Agregar bloque</button>
      </Section>

      <Section title="Otros cargos">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="t-fixed" label="Comercialización (USD/mes)"><input id="t-fixed" name="commercialization_usd" type="number" min={0} step="any" value={fixed} onChange={(e) => setFixed(e.target.value)} className="input tabular-nums" /></Field>
          <Field id="t-other" label="Otros cargos (%)" hint="Alumbrado, bomberos, etc., aproximados sobre energía y demanda."><input id="t-other" name="other_charges_pct" type="number" min={0} step="any" value={other} onChange={(e) => setOther(e.target.value)} className="input tabular-nums" /></Field>
          <div className="min-w-0">
            <label className="flex items-center gap-2 pt-7 text-sm"><input type="checkbox" name="has_demand_charge" checked={hasDemand} onChange={(e) => setHasDemand(e.target.checked)} className="h-4 w-4" /> Con cargo por demanda</label>
          </div>
          {hasDemand && <Field id="t-dem" label="Cargo por demanda (USD/kW)"><input id="t-dem" name="demand_usd_per_kw" type="number" min={0} step="any" value={demand} onChange={(e) => setDemand(e.target.value)} className="input tabular-nums" /></Field>}
        </div>
      </Section>

      <Section title="Vista previa de la factura" intro={`Mismo cálculo que usa la calculadora${hasDemand ? ', con una demanda de ejemplo de 20 kW' : ''}. Revísala contra una planilla real.`}>
        {'error' in preview ? <p className="text-sm text-muted">{preview.error}</p> : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm" aria-live="polite">
              <caption className="sr-only">Facturas de ejemplo</caption>
              <thead className="text-left text-xs uppercase tracking-wider text-muted"><tr>{['Consumo', 'Energía', 'Demanda', 'Fijo', 'Otros', 'Total'].map((h) => <th key={h} scope="col" className="py-2 pr-2">{h}</th>)}</tr></thead>
              <tbody>{preview.bills!.map((b) => (
                <tr key={b.kwh} className="border-t border-line tabular-nums">
                  <td className="py-2 pr-2">{b.kwh.toLocaleString('es-EC')} kWh</td><td className="pr-2">{fmtUsd2(b.energy)}</td><td className="pr-2">{fmtUsd2(b.demand)}</td>
                  <td className="pr-2">{fmtUsd2(b.fixed)}</td><td className="pr-2">{fmtUsd2(b.other)}</td><td className="font-semibold">{fmtUsd2(b.total)}</td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Fuente y validación">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field id="t-src" label="Fuente *" hint="Resolución ARCONEL, fecha del pliego y distribuidora."><textarea id="t-src" name="source_note" rows={2} maxLength={400} defaultValue={t?.source_note} className="input" /></Field>
          <Field id="t-from" label="Vigente desde"><input id="t-from" name="valid_from" type="date" defaultValue={t?.valid_from ?? today()} className="input" /></Field>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="is_placeholder" defaultChecked={t?.is_placeholder ?? true} className="mt-0.5 h-4 w-4" />
            <span><b>Provisional</b><span className="block text-muted">Mientras esté marcada, cada estudio advierte al cliente que la tarifa no está validada con el pliego vigente.</span></span>
          </label>
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {!pending && state?.error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{state.error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : t ? 'Guardar cambios' : 'Crear tarifa'}</button>
      </div>
    </form>
  );
}
