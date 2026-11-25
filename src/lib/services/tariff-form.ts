import { z } from 'zod';
import { monthlyBill, type EnergyBlock, type Tariff } from '../engine/tariff';

/**
 * Formulario guiado de tarifas. Los bloques se editan como «hasta X kWh» y el inicio de cada uno
 * es el final del anterior: no puede haber huecos ni superposiciones (un hueco dejaría consumo sin cobrar
 * y la calculadora subestimaría la factura y el ahorro).
 */

/** Bloques continuos desde «hasta» de cada tramo (null = sin límite, solo el último). */
export function buildBlocks(rows: { to: number | null; price: number }[]): EnergyBlock[] | string {
  if (!rows.length) return 'Agrega al menos un bloque de energía.';
  const out: EnergyBlock[] = [];
  let from = 0;
  for (let i = 0; i < rows.length; i++) {
    const { to, price } = rows[i];
    const last = i === rows.length - 1;
    if (!Number.isFinite(price) || price <= 0 || price > 2) return `Bloque ${i + 1}: el precio debe estar entre 0 y 2 USD/kWh.`;
    if (last && to !== null) return `Bloque ${i + 1}: el último bloque no tiene límite (deja vacío el «hasta»).`;
    if (!last && (to === null || !Number.isFinite(to))) return `Bloque ${i + 1}: indica hasta cuántos kWh aplica.`;
    if (!last && to! <= from) return `Bloque ${i + 1}: el límite (${to} kWh) debe ser mayor que el inicio (${from} kWh).`;
    out.push({ from_kwh: from, to_kwh: last ? null : to, usd_per_kwh: price });
    if (!last) from = to!;
  }
  return out;
}

const TariffSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  code: z.string().trim().toUpperCase().min(2, 'El código es obligatorio').max(40).regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Código: letras, números y guiones (p. ej. COM-BT-D)'),
  name: z.string().trim().min(3, 'El nombre es obligatorio').max(120),
  segment: z.enum(['residencial', 'comercial', 'industrial'], { message: 'Elige un segmento' }),
  voltage_level: z.enum(['BT', 'MT', 'AT'], { message: 'Elige el nivel de tensión' }),
  has_demand_charge: z.boolean(),
  demand_usd_per_kw: z.number().min(0).max(100).nullable(),
  commercialization_usd: z.number({ message: 'Cargo de comercialización: ingresa un número' }).min(0).max(1000),
  other_charges_pct: z.number({ message: 'Otros cargos: ingresa un número' }).min(0).max(0.5, 'Otros cargos: máximo 50 %'),
  source_note: z.string().trim().min(10, 'Indica la fuente: resolución ARCONEL, fecha y distribuidora').max(400),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vigencia no válida'),
  is_placeholder: z.boolean(),
});

const num = (fd: FormData, k: string) => { const s = String(fd.get(k) ?? '').trim().replace(',', '.'); return s === '' ? null : Number(s); };

export function parseTariffForm(fd: FormData, today = new Date().toISOString().slice(0, 10)): { data: Tariff } | { error: string } {
  const tos = fd.getAll('block_to').map(String), prices = fd.getAll('block_price').map(String);
  // Las filas totalmente vacías se ignoran; el resto se valida al armar los bloques.
  const rows = prices.map((p, i) => ({ toRaw: (tos[i] ?? '').trim(), priceRaw: p.trim() }))
    .filter((r) => r.toRaw || r.priceRaw)
    .map((r) => ({ to: r.toRaw === '' ? null : Number(r.toRaw.replace(',', '.')), price: r.priceRaw === '' ? NaN : Number(r.priceRaw.replace(',', '.')) }));
  const blocks = buildBlocks(rows);
  if (typeof blocks === 'string') return { error: blocks };
  const hasDemand = fd.get('has_demand_charge') === 'on';
  const demand = num(fd, 'demand_usd_per_kw');
  if (hasDemand && (demand == null || !(demand > 0))) return { error: 'Con cargo por demanda, indica su valor en USD/kW.' };
  const other = num(fd, 'other_charges_pct');
  const p = TariffSchema.safeParse({
    id: String(fd.get('id') ?? '') || undefined,
    code: String(fd.get('code') ?? ''), name: String(fd.get('name') ?? ''),
    segment: String(fd.get('segment') ?? ''), voltage_level: String(fd.get('voltage_level') ?? ''),
    has_demand_charge: hasDemand, demand_usd_per_kw: hasDemand ? demand : null,
    commercialization_usd: num(fd, 'commercialization_usd') ?? 0,
    other_charges_pct: other == null ? 0 : Math.round(other * 1e4) / 1e6,
    source_note: String(fd.get('source_note') ?? ''),
    valid_from: String(fd.get('valid_from') ?? '') || today,
    is_placeholder: fd.get('is_placeholder') === 'on',
  });
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
  return { data: { ...p.data, energy_blocks: blocks } };
}

/** Facturas de ejemplo para revisar la tarifa antes de guardarla (mismo cálculo que la calculadora). */
export const PREVIEW_KWH = [100, 300, 1000, 5000];
export function previewBills(t: Tariff, demandKw = 20) {
  return PREVIEW_KWH.map((kwh) => ({ kwh, ...monthlyBill(t, kwh, t.has_demand_charge ? demandKw : 0) }));
}
