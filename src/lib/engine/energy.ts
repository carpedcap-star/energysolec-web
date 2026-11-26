import { periodOf, type DayType } from './tariff-v2/periods';
import type { PeriodKey, PeriodScheme } from './tariff-v2/types';

/**
 * Simulación horaria de un día típico por mes (laborable y fin de semana): FV → carga → batería → red.
 * Preliminar y transparente: sin curva de carga medida, la carga sigue un perfil tipo según el horario de mayor
 * consumo; la generación sigue la forma diaria solar de Ecuador (día de unas 12 h todo el año, cerca del ecuador).
 */
export type PeakHours = 'manana' | 'mediodia' | 'tarde' | 'noche' | 'continuo';
export type Segment = 'residencial' | 'comercial' | 'industrial';

export const DEFAULT_PEAK: Record<Segment, PeakHours> = { residencial: 'noche', comercial: 'mediodia', industrial: 'mediodia' };
/** Consumo de un día de fin de semana respecto de uno laborable (supuesto del perfil tipo). */
export const WEEKEND_FACTOR: Record<Segment, number> = { residencial: 1, comercial: 0.6, industrial: 0.5 };

const CENTER: Record<Exclude<PeakHours, 'continuo'>, number> = { manana: 9.5, mediodia: 13, tarde: 16, noche: 20 };

/** Perfil de carga de 24 h (suma 1). */
export function loadShape(peak: PeakHours): number[] {
  const raw = Array.from({ length: 24 }, (_, h) => {
    if (peak === 'continuo') return 1;
    const c = CENTER[peak];
    const d = Math.min(Math.abs(h + 0.5 - c), 24 - Math.abs(h + 0.5 - c));
    return 0.35 + 1.6 * Math.exp(-(d * d) / (2 * 2.5 * 2.5));
  });
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / s);
}

/** Forma diaria de la generación FV (suma 1): semiseno de 06:00 a 18:00. */
export function pvShape(): number[] {
  const raw = Array.from({ length: 24 }, (_, h) => (h >= 6 && h < 18 ? Math.sin(((h + 0.5 - 6) / 12) * Math.PI) : 0));
  const s = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / s);
}

/** Fracción de la carga diaria fuera de las horas de sol (18:00–06:00). */
export const nightShare = (shape: number[]) => shape.reduce((a, v, h) => a + (h < 6 || h >= 18 ? v : 0), 0);

export type Battery = {
  /** Energía utilizable para el ciclo diario (sin la reserva de respaldo), kWh. */
  cyclingKwh: number;
  /** Potencia máxima de carga y descarga, kW. */
  powerKw: number;
  /** Eficiencia de ida y vuelta (se reparte por igual entre carga y descarga). */
  roundTrip: number;
};

export type MonthFlows = {
  loadKwh: number; pvKwh: number; selfKwh: number; batteryToLoadKwh: number;
  importByPeriod: Partial<Record<PeriodKey, number>>; exportByPeriod: Partial<Record<PeriodKey, number>>;
  loadByPeriod: Partial<Record<PeriodKey, number>>;
  importKwh: number; exportKwh: number;
};

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Días laborables y de fin de semana de un mes (año de referencia). */
export function dayCounts(year: number, month: number) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let we = 0;
  for (let d = 1; d <= days; d++) { const w = new Date(Date.UTC(year, month - 1, d)).getUTCDay(); if (w === 0 || w === 6) we++; }
  return { days, weekdays: days - we, weekends: we };
}

function day(loadH: number[], pvH: number[], scheme: PeriodScheme, dt: DayType, bat: Battery | null, soc0: number) {
  const imp: Partial<Record<PeriodKey, number>> = {}, exp: Partial<Record<PeriodKey, number>> = {}, ld: Partial<Record<PeriodKey, number>> = {};
  let soc = soc0, self = 0, fromBat = 0;
  const ce = bat ? Math.sqrt(bat.roundTrip) : 1;
  for (let h = 0; h < 24; h++) {
    const k = periodOf(scheme, dt, h);
    const l = loadH[h], g = pvH[h];
    ld[k] = (ld[k] ?? 0) + l;
    const direct = Math.min(l, g);
    self += direct;
    let surplus = g - direct, deficit = l - direct;
    if (bat) {
      if (surplus > 0) { const c = Math.min(surplus, bat.powerKw, (bat.cyclingKwh - soc) / ce); soc += c * ce; surplus -= c; }
      if (deficit > 0) { const d = Math.min(deficit, bat.powerKw, soc * ce); soc -= d / ce; deficit -= d; fromBat += d; }
    }
    if (deficit > 0) imp[k] = (imp[k] ?? 0) + deficit;
    if (surplus > 0) exp[k] = (exp[k] ?? 0) + surplus;
  }
  return { imp, exp, ld, self, fromBat, soc };
}

const add = (a: Partial<Record<PeriodKey, number>>, b: Partial<Record<PeriodKey, number>>, f: number) => {
  for (const [k, v] of Object.entries(b)) a[k as PeriodKey] = (a[k as PeriodKey] ?? 0) + (v ?? 0) * f;
};

/**
 * Un mes: la carga mensual se reparte en días laborables y de fin de semana; la generación es igual todos los días.
 * La batería se simula hasta su régimen diario estable (se corre el día dos veces).
 */
export function simulateMonth(o: {
  year: number; month: number; loadKwh: number; pvKwh: number; shape: number[]; weekendFactor: number;
  scheme: PeriodScheme; battery?: Battery | null;
}): MonthFlows {
  const { days, weekdays, weekends } = dayCounts(o.year, o.month);
  const weightSum = weekdays + weekends * o.weekendFactor;
  const lWd = weightSum > 0 ? o.loadKwh / weightSum : 0;
  const pvDay = o.pvKwh / days;
  const ps = pvShape();
  const out: MonthFlows = { loadKwh: 0, pvKwh: 0, selfKwh: 0, batteryToLoadKwh: 0, importByPeriod: {}, exportByPeriod: {}, loadByPeriod: {}, importKwh: 0, exportKwh: 0 };
  for (const [dt, n, f] of [['laborable', weekdays, 1], ['sabado', weekends, o.weekendFactor]] as const) {
    if (!n) continue;
    const loadH = o.shape.map((s) => s * lWd * f), pvH = ps.map((s) => s * pvDay);
    let r = day(loadH, pvH, o.scheme, dt, o.battery ?? null, 0);
    if (o.battery) r = day(loadH, pvH, o.scheme, dt, o.battery, r.soc);
    add(out.importByPeriod, r.imp, n); add(out.exportByPeriod, r.exp, n); add(out.loadByPeriod, r.ld, n);
    out.selfKwh += r.self * n; out.batteryToLoadKwh += r.fromBat * n;
    out.loadKwh += loadH.reduce((a, b) => a + b, 0) * n; out.pvKwh += pvDay * n;
  }
  out.importKwh = Object.values(out.importByPeriod).reduce((a, b) => a + (b ?? 0), 0);
  out.exportKwh = Object.values(out.exportByPeriod).reduce((a, b) => a + (b ?? 0), 0);
  return out;
}

export const daysInMonth = (m: number) => DAYS[m - 1];
