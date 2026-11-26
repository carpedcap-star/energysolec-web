import { computeBill, SCHEME_PERIODS, type PeriodKey } from '../engine/tariff-v2';
import type { CalcParams } from '../engine/params';
import type { BillData } from './bill';
import { selectTariff } from './tariff-select';

/**
 * Comprobación determinista de una planilla leída: se recalcula el servicio eléctrico con el pliego oficial y se compara
 * con lo que la planilla cobra por energía, demanda, comercialización y pérdidas. La IA solo leyó; aquí no interviene.
 */
export type BillCheck = { tariffCode: string; computedUsd: number; billedUsd: number; diffShare: number; ok: boolean } | null;

const SERVICE_KINDS = new Set(['energia', 'demanda', 'comercializacion', 'perdidas_transformador', 'penalizacion_fp']);

export function checkBill(d: BillData, p: CalcParams, tolerance = 0.12): BillCheck {
  if (!d.segment || d.energyKwh == null) return null;
  const fromCharges = d.charges.filter((c) => SERVICE_KINDS.has(c.kind)).reduce((a, c) => a + c.usd, 0);
  const billed = fromCharges > 0 ? fromCharges : d.electricityUsd;
  if (!billed) return null;
  const t = selectTariff({ segment: d.segment, province: d.province ?? '', city: d.canton ?? undefined, distributor: d.distributor ?? undefined, tariffKey: d.tariffKey ?? undefined, monthlyKwh: d.energyKwh, demandKw: d.demandKw ?? undefined, p });
  const month = d.billingPeriod ? Number(d.billingPeriod.slice(5)) : new Date().getMonth() + 1;
  const periods = SCHEME_PERIODS[t.structure.scheme];
  let kwhByPeriod: Partial<Record<PeriodKey, number>>;
  if (t.structure.scheme === 'UNICO') kwhByPeriod = { unico: d.energyKwh };
  else if (d.timeOfUse && d.timeOfUse.scheme === t.structure.scheme) kwhByPeriod = d.timeOfUse.kwh;
  else return null; // tarifa horaria sin franjas leídas: no se puede comparar con justicia
  if (!periods.every((k) => kwhByPeriod[k] != null) && t.structure.scheme !== 'UNICO') return null;
  const demand = d.demandKw ?? d.demandRegisteredKw ?? undefined;
  // El aporte al subsidio cruzado depende de condiciones del cliente: se compara sin él.
  const bill = computeBill(t.structure, { month, kwhByPeriod, demandKw: demand, peakDemandKw: demand, dmMax12Kw: demand, powerFactor: d.powerFactor ?? undefined });
  const diffShare = Math.abs(bill.spee - billed) / billed;
  return { tariffCode: t.code, computedUsd: bill.spee, billedUsd: Math.round(billed * 100) / 100, diffShare: Math.round(diffShare * 1000) / 1000, ok: diffShare <= tolerance };
}
