import type { Tariff } from './tariff';

/**
 * TARIFAS PROVISIONALES de referencia para desarrollo y pruebas.
 * DEBEN reemplazarse desde /admin/tarifas con el pliego tarifario vigente de ARCONEL
 * (resolución, fecha y distribuidora). Mientras is_placeholder=true el estudio lo advierte.
 */
const NOTE = 'PROVISIONAL — valores aproximados de referencia; validar contra el pliego tarifario ARCONEL vigente.';

export const DEFAULT_TARIFFS: Tariff[] = [
  {
    code: 'RES-BT', name: 'Residencial baja tensión (referencial)', segment: 'residencial', voltage_level: 'BT',
    has_demand_charge: false, demand_usd_per_kw: null, commercialization_usd: 1.41, other_charges_pct: 0.1,
    energy_blocks: [
      { from_kwh: 0, to_kwh: 130, usd_per_kwh: 0.04 },       // tarifa dignidad (umbral Costa; Sierra 110 kWh)
      { from_kwh: 130, to_kwh: 500, usd_per_kwh: 0.092 },
      { from_kwh: 500, to_kwh: null, usd_per_kwh: 0.105 },
    ],
    source_note: NOTE, is_placeholder: true,
  },
  {
    code: 'COM-BT', name: 'Comercial baja tensión sin demanda (referencial)', segment: 'comercial', voltage_level: 'BT',
    has_demand_charge: false, demand_usd_per_kw: null, commercialization_usd: 1.41, other_charges_pct: 0.1,
    energy_blocks: [{ from_kwh: 0, to_kwh: null, usd_per_kwh: 0.092 }],
    source_note: NOTE, is_placeholder: true,
  },
  {
    code: 'COM-BT-D', name: 'Comercial baja tensión con demanda (referencial)', segment: 'comercial', voltage_level: 'BT',
    has_demand_charge: true, demand_usd_per_kw: 4.79, commercialization_usd: 1.41, other_charges_pct: 0.08,
    energy_blocks: [{ from_kwh: 0, to_kwh: null, usd_per_kwh: 0.09 }],
    source_note: NOTE, is_placeholder: true,
  },
  {
    code: 'IND-MT-D', name: 'Industrial media tensión con demanda (referencial)', segment: 'industrial', voltage_level: 'MT',
    has_demand_charge: true, demand_usd_per_kw: 4.79, commercialization_usd: 1.41, other_charges_pct: 0.06,
    energy_blocks: [{ from_kwh: 0, to_kwh: null, usd_per_kwh: 0.08 }],
    source_note: NOTE, is_placeholder: true,
  },
];

export function defaultTariffFor(segment: Tariff['segment'], code?: string) {
  return DEFAULT_TARIFFS.find((t) => t.code === code) ?? DEFAULT_TARIFFS.find((t) => t.segment === segment)!;
}
