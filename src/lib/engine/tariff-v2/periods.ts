import type { PeriodKey, PeriodScheme } from './types';

export type DayType = 'laborable' | 'sabado' | 'domingo' | 'feriado';

/**
 * Franja tarifaria de una hora (0–23 = la hora que empieza a esa hora) según el pliego 2026.
 * Las horas son de reloj local de Ecuador. Las fronteras son inclusivas al inicio: 18:00 ya es 18–22, 22:00 ya es base.
 */
export function periodOf(scheme: PeriodScheme, day: DayType, hour: number): PeriodKey {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error(`hora fuera de rango: ${hour}`);
  const weekday = day === 'laborable';
  const in08_18 = hour >= 8 && hour < 18;
  const in18_22 = hour >= 18 && hour < 22;
  switch (scheme) {
    case 'UNICO':
      return 'unico';
    case 'HORARIA_2':
      return hour >= 8 && hour < 22 ? 'h08_22' : 'h22_08';
    case 'DIFERENCIADA_4':
      // 4.4.3 c-f: L-V 08-18, L-V 18-22, L-V 22-08 + S,D,F 22-18 (base), S,D,F 18-22.
      if (in18_22) return weekday ? 'lv_18_22' : 'sdf_18_22';
      if (in08_18 && weekday) return 'lv_08_18';
      return 'base';
    case 'VE_3':
      // 4.3.4.6 c-e: punta L-D 18-22; media L-V 08-18; base L-D 22-08 y sábado/domingo 08-18.
      // El texto nombra sábado y domingo (no feriados) para la base diurna: un feriado entre semana cuenta como laborable.
      if (in18_22) return 'ld_18_22';
      if (in08_18 && (day === 'laborable' || day === 'feriado')) return 'lv_08_18';
      return 'base';
  }
}

/** Tipo de día de una fecha (YYYY-MM-DD) con la lista de feriados nacionales dada. */
export function dayTypeOf(isoDate: string, holidays: ReadonlySet<string>): DayType {
  if (holidays.has(isoDate)) return 'feriado';
  const d = new Date(`${isoDate}T12:00:00Z`).getUTCDay();
  return d === 0 ? 'domingo' : d === 6 ? 'sabado' : 'laborable';
}

/**
 * Reparte un perfil horario de un mes en franjas. `profile(dayType, hour)` devuelve kWh de esa hora para ese tipo de día.
 * Se usa con perfiles de carga tipo o con la generación FV horaria.
 */
export function splitMonthByPeriod(
  scheme: PeriodScheme, year: number, month: number, holidays: ReadonlySet<string>,
  profile: (day: DayType, hour: number) => number,
): Partial<Record<PeriodKey, number>> {
  const out: Partial<Record<PeriodKey, number>> = {};
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dt = dayTypeOf(iso, holidays);
    for (let h = 0; h < 24; h++) {
      const k = periodOf(scheme, dt, h);
      out[k] = (out[k] ?? 0) + profile(dt, h);
    }
  }
  return out;
}
