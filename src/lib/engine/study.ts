import { z } from 'zod';
import type { CalcParams } from './params';
import { sizeSystem, type SolarResource, round } from './solar';
import { financeScenario, type FinanceResult } from './finance';
import { kwhFromBill, type Tariff } from './tariff';

export const StudyInput = z.object({
  mode: z.enum(['rapida', 'profesional']),
  segment: z.enum(['residencial', 'comercial', 'industrial']),
  objective: z.enum(['reducir_factura', 'autoconsumo', 'respaldo', 'almacenamiento', 'inversion']),
  province: z.string().min(2).max(60),
  city: z.string().max(80).optional().default(''),
  address: z.string().max(200).optional().default(''),
  lat: z.number().min(-5.1).max(1.7).optional(),
  lng: z.number().min(-92.1).max(-75).optional(),
  distributor: z.string().max(80).optional(),
  tariffCode: z.string().max(40).optional(),
  monthlyKwh: z.number().positive().max(10_000_000).optional(),
  monthlyHistoryKwh: z.array(z.number().nonnegative()).length(12).optional(),
  monthlyBillUsd: z.number().positive().max(5_000_000).optional(),
  demandKw: z.number().nonnegative().max(100_000).optional().default(0),
  peakHours: z.enum(['manana', 'mediodia', 'tarde', 'noche', 'continuo']).optional(),
  daytimeShare: z.number().min(0.05).max(1).optional(),
  availableAreaM2: z.number().positive().max(5_000_000).optional(),
  surface: z.enum(['cubierta', 'terreno']).default('cubierta'),
  roofType: z.string().max(60).optional(),
  tilt: z.number().min(0).max(45).optional().default(10),
  shading: z.enum(['none', 'partial', 'significant']).default('none'),
  wantsBattery: z.boolean().default(false),
  backupHours: z.number().min(0).max(48).optional(),
  criticalLoadKw: z.number().min(0).max(100_000).optional(),
  budgetUsd: z.number().positive().optional(),
}).refine((v) => v.monthlyKwh || v.monthlyBillUsd || v.monthlyHistoryKwh, { message: 'Indica tu consumo en kWh o el valor de tu factura.' });
export type StudyInput = z.infer<typeof StudyInput>;

const PEAK_TO_DAYTIME: Record<string, number> = { manana: 0.55, mediodia: 0.7, tarde: 0.5, noche: 0.25, continuo: 0.45 };

export type StudyResult = {
  consumption: { monthlyKwh: number[]; estimatedFromBill: boolean; annualKwh: number };
  sizing: ReturnType<typeof sizeSystem>;
  resource: { source: string; candidates?: import('./resource').Candidate[]; notes?: string[] };
  scenarios: Record<'conservador' | 'base' | 'optimista', FinanceResult>;
  environment: { co2TonsYear: number; co2Tons25: number; treesEquivalent: number };
  tariff: { code: string; name: string; isPlaceholder: boolean; sourceNote: string };
  paramsVersion: number;
  paramsPlaceholder: boolean;
  warnings: string[];
  disclaimer: string;
};

export function runStudy(input: StudyInput, resource: SolarResource & { candidates?: import('./resource').Candidate[] }, tariff: Tariff, p: CalcParams): StudyResult {
  const warnings: string[] = [];
  let monthly: number[];
  let estimatedFromBill = false;
  if (input.monthlyHistoryKwh) monthly = input.monthlyHistoryKwh;
  else if (input.monthlyKwh) monthly = Array(12).fill(input.monthlyKwh);
  else {
    const k = kwhFromBill(tariff, input.monthlyBillUsd!, input.demandKw);
    monthly = Array(12).fill(Math.round(k));
    estimatedFromBill = true;
    warnings.push('El consumo se estimó a partir del valor de la factura y la tarifa seleccionada. Con el dato de kWh de tu planilla el resultado es más preciso.');
  }
  if (input.monthlyKwh && input.monthlyBillUsd) {
    const k = kwhFromBill(tariff, input.monthlyBillUsd, input.demandKw);
    if (Math.abs(k - input.monthlyKwh) / input.monthlyKwh > 0.35)
      warnings.push('El consumo y el valor de la factura indicados no son coherentes con la tarifa seleccionada; revisa ambos datos.');
  }
  const daytimeShare = input.daytimeShare ?? (input.peakHours ? PEAK_TO_DAYTIME[input.peakHours] : undefined);
  const compensates = p.financial.exportCompensation !== 'none';

  const sizing = sizeSystem({
    segment: input.segment, objective: input.objective, monthlyKwh: monthly, daytimeShare,
    shading: input.shading, surface: input.surface, availableAreaM2: input.availableAreaM2,
    wantsBattery: input.wantsBattery, backupHours: input.backupHours, criticalLoadKw: input.criticalLoadKw,
  }, resource, p, compensates);

  const scenarios = {
    conservador: financeScenario(p, tariff, monthly, input.demandKw, sizing, 'conservador'),
    base: financeScenario(p, tariff, monthly, input.demandKw, sizing, 'base'),
    optimista: financeScenario(p, tariff, monthly, input.demandKw, sizing, 'optimista'),
  };

  if (input.budgetUsd && scenarios.base.capex.total > input.budgetUsd * 1.15)
    warnings.push('La inversión estimada supera el presupuesto indicado; podemos plantear un sistema por etapas o financiamiento.');
  if (sizing.limitedByArea) warnings.push('El espacio disponible limita la potencia instalable.');
  // Sin ninguna fuente de irradiación el estudio usa un rendimiento regional: el cliente debe saberlo.
  if (!resource.candidates?.length) warnings.push('No fue posible consultar las fuentes de irradiación (PVGIS y NASA POWER): se usó un rendimiento regional conservador. Recalcularemos el estudio con datos de tu ubicación.');
  if (tariff.is_placeholder) warnings.push('Tarifa eléctrica PROVISIONAL: pendiente de validar con el pliego tarifario vigente.');
  if (p.isPlaceholder) warnings.push('Parámetros de precios PROVISIONALES: pendientes de validación por Energy Solutions Ecuador.');
  if (tariff.has_demand_charge && !p.financial.demandSavingsFromPv)
    warnings.push('No se considera reducción del cargo por demanda: la generación solar no garantiza bajar el pico de potencia facturable.');
  if (input.objective === 'respaldo' && !(input.criticalLoadKw && input.backupHours))
    warnings.push('Para dimensionar el respaldo indica la potencia de cargas críticas y las horas de autonomía requeridas.');

  const co2Year = (sizing.annualGeneration * p.technical.gridCo2KgPerKwh) / 1000;
  const co2_25 = (scenarios.base.generationByYear.reduce((a, b) => a + b, 0) * p.technical.gridCo2KgPerKwh) / 1000;

  return {
    consumption: { monthlyKwh: monthly, estimatedFromBill, annualKwh: Math.round(monthly.reduce((a, b) => a + b, 0)) },
    sizing, resource: { source: resource.source, candidates: resource.candidates, notes: resource.notes }, scenarios,
    environment: { co2TonsYear: round(co2Year, 1), co2Tons25: round(co2_25, 0), treesEquivalent: Math.round((co2Year * 1000) / 21.8) },
    tariff: { code: tariff.code, name: tariff.name, isPlaceholder: tariff.is_placeholder, sourceNote: tariff.source_note },
    paramsVersion: p.version, paramsPlaceholder: p.isPlaceholder, warnings,
    disclaimer: 'Este estudio constituye una prefactibilidad técnica y económica referencial. Está sujeto a inspección en sitio, ingeniería definitiva, verificación regulatoria y cotización formal de Energy Solutions Ecuador S.A.S.',
  };
}
