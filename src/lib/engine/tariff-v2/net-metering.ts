import { computeBill, energyChargeFor, maxEnergyCharge, type BillOptions } from './bill';
import { SCHEME_PERIODS, type BillResult, type MonthUsage, type PeriodKey, type TariffStructure } from './types';

/**
 * Facturación con generación distribuida para autoabastecimiento (Regulación ARCONEL-005/24 codificada, art. 26–27 y
 * Anexo E), modalidad 1a:
 * - Energía neta del mes = tomada de la red − inyectada. En tarifas horarias, energía EQUIVALENTE ponderada por el cargo
 *   de cada franja: Σ(E_k·T_k)/T_m.
 * - Si la neta es ≤ 0, la energía facturable es 0 y el sobrante pasa a crédito (kWh).
 * - Si es > 0, se descuenta del saldo acumulado; lo que falte se factura (en horarias, al mayor cargo T_m).
 * - El saldo se reinicia a cero cada 24 meses desde la puesta en operación, sin pago.
 * - Comercialización y demanda se facturan siempre; la demanda facturable es la máxima tomada de la red.
 */
export type NetMonth = MonthUsage & {
  /** Energía tomada de la red por franja (reemplaza kwhByPeriod para la neta). */
  importedByPeriod: Partial<Record<PeriodKey, number>>;
  injectedByPeriod: Partial<Record<PeriodKey, number>>;
};

export type NetMonthResult = {
  netKwh: number;
  creditGeneratedKwh: number;
  creditUsedKwh: number;
  balanceKwh: number;
  billableKwh: number;
  expiredKwh: number;
  bill: BillResult;
};

export function simulateNetMetering(s: TariffStructure, months: NetMonth[], opt: BillOptions = {}): NetMonthResult[] {
  const periods = SCHEME_PERIODS[s.scheme];
  const hourly = s.scheme !== 'UNICO';
  let balance = 0;
  return months.map((m, i) => {
    let expired = 0;
    if (i > 0 && i % 24 === 0) { expired = balance; balance = 0; }
    const tm = maxEnergyCharge(s, m.month);
    const sum = (rec: Partial<Record<PeriodKey, number>>, weight: (p: PeriodKey) => number) =>
      periods.reduce((a, p) => a + (rec[p] ?? 0) * weight(p), 0);
    const w = (p: PeriodKey) => (hourly ? (energyChargeFor(s, p, m.month)?.blocks[0]?.usdPerKwh ?? 0) / tm : 1);
    const net = sum(m.importedByPeriod, w) - sum(m.injectedByPeriod, w);

    let generated = 0, used = 0, billable = 0;
    if (net <= 0) { generated = -net; balance += generated; }
    else { used = Math.min(balance, net); balance -= used; billable = net - used; }

    // Lo que queda por facturar: en horarias, al mayor cargo (se factura en la franja que tiene T_m);
    // en residencial y general sin demanda, con los bloques de la tarifa.
    let kwhByPeriod: Partial<Record<PeriodKey, number>>;
    if (!hourly) kwhByPeriod = { unico: billable };
    else {
      const top = periods.find((p) => (energyChargeFor(s, p, m.month)?.blocks[0]?.usdPerKwh ?? 0) === tm)!;
      kwhByPeriod = Object.fromEntries(periods.map((p) => [p, p === top ? billable : 0]));
    }
    const bill = computeBill(s, { ...m, kwhByPeriod }, { ...opt, withSgda: true });
    return { netKwh: net, creditGeneratedKwh: generated, creditUsedKwh: used, balanceKwh: balance, billableKwh: billable, expiredKwh: expired, bill };
  });
}
