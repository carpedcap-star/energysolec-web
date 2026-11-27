import { z } from 'zod';
import type { CalcParams } from './params';
import { systemLossFactor, type SolarResource, type SizingResult, round } from './solar';
import type { FinanceResult } from './finance';
import type { Tariff } from './tariff';
import { computeAlternatives, type Alternative, type AlternativeKey, type SurfaceResult } from './alternatives';
import { computeBill, type BillLine, type BillOptions, type PeriodKey, type TariffStructure } from './tariff-v2';
import { loadShape, nightShare, DEFAULT_PEAK } from './energy';

export const SURFACE_TYPES = ['techo_metalico', 'techo_inclinado', 'losa', 'terreno'] as const;

export const StudyInput = z.object({
  mode: z.enum(['rapida', 'profesional']),
  segment: z.enum(['residencial', 'comercial', 'industrial']),
  objective: z.enum(['reducir_factura', 'autoconsumo', 'respaldo', 'almacenamiento', 'inversion']),
  province: z.string().min(2).max(60),
  city: z.string().max(80).optional().default(''),
  address: z.string().max(200).optional().default(''),
  lat: z.number().min(-5.1).max(1.7).optional(),
  lng: z.number().min(-92.1).max(-75).optional(),
  /** Código de distribuidora del pliego (p. ej. EEQ, CNEL-GYE); si falta, se sugiere por provincia y cantón. */
  distributor: z.string().max(80).optional(),
  /** Clave de tarifa del pliego sin grupo (p. ej. RES, COM-BV-D, IND-MV-HD). */
  tariffCode: z.string().max(40).optional(),
  monthlyKwh: z.number().positive().max(10_000_000).optional(),
  monthlyHistoryKwh: z.array(z.number().nonnegative()).length(12).optional(),
  monthlyBillUsd: z.number().positive().max(5_000_000).optional(),
  demandKw: z.number().nonnegative().max(100_000).optional().default(0),
  /** kWh de un mes por franja horaria, leídos de la planilla (tarifas horarias). */
  periodKwh: z.record(z.string(), z.number().nonnegative()).optional(),
  powerFactor: z.number().min(0.1).max(1).optional(),
  peakHours: z.enum(['manana', 'mediodia', 'tarde', 'noche', 'continuo']).optional(),
  daytimeShare: z.number().min(0.05).max(1).optional(),
  availableAreaM2: z.number().positive().max(5_000_000).optional(),
  surface: z.enum(['cubierta', 'terreno']).default('cubierta'),
  /** Superficies disponibles: tipo sencillo y m² (null = «no sé»). Vacío = no se conoce el espacio. */
  surfaces: z.array(z.object({ type: z.enum(SURFACE_TYPES), areaM2: z.number().positive().max(5_000_000).nullable() })).max(6).optional(),
  roofType: z.string().max(60).optional(),
  tilt: z.number().min(0).max(45).optional().default(10),
  shading: z.enum(['none', 'partial', 'significant']).default('none'),
  wantsBattery: z.boolean().default(false),
  /** Qué respaldar durante un apagón (híbrido). */
  backup: z.enum(['ninguno', 'esencial', 'parcial', 'total']).optional(),
  backupHours: z.number().min(0).max(48).optional(),
  criticalLoadKw: z.number().min(0).max(100_000).optional(),
  budgetUsd: z.number().positive().optional(),
  /** Facturación real de referencia (lo que paga hoy): promedio de 12 meses facturados o una sola planilla. */
  billedMonthlyUsd: z.number().positive().max(5_000_000).optional(),
  billedMonths: z.number().int().min(0).max(24).optional(),
}).refine((v) => v.monthlyKwh || v.monthlyBillUsd || v.monthlyHistoryKwh, { message: 'Indica tu consumo en kWh o el valor de tu factura.' });
export type StudyInput = z.infer<typeof StudyInput>;

const r2 = (x: number) => Math.round(x * 100) / 100;
const PEAK_TO_DAYTIME: Record<string, number> = { manana: 0.55, mediodia: 0.7, tarde: 0.5, noche: 0.25, continuo: 0.45 };

/** Tarifa con la que se calcula: del pliego oficial (estructura completa) o una tarifa manual heredada. */
export type SelectedTariff = {
  code: string; name: string; sourceNote: string; isPlaceholder: boolean;
  structure: TariffStructure; options?: BillOptions;
  distributor?: { code: string; name: string; suggested: boolean } | null;
  assumed?: boolean;
};

/** Tarifas manuales de la versión anterior (tabla `tariffs`): bloques, demanda plana y «otros cargos» como tercero provisional. */
export function fromLegacyTariff(t: Tariff): SelectedTariff {
  return {
    code: t.code, name: t.name, sourceNote: t.source_note, isPlaceholder: t.is_placeholder,
    structure: {
      scheme: 'UNICO', commercialization: { usdPerMonth: t.commercialization_usd },
      energy: [{ period: 'unico', blocks: t.energy_blocks.map((b) => ({ fromKwh: b.from_kwh, toKwh: b.to_kwh, usdPerKwh: b.usd_per_kwh })) }],
      ...(t.has_demand_charge && t.demand_usd_per_kw ? { demand: { usdPerKwMonth: t.demand_usd_per_kw, factor: 'ninguno' as const, minShareOfMax12: null } } : {}),
    },
    options: t.other_charges_pct > 0 ? { thirdParty: [{ code: 'otros', name: 'Otros cargos (aproximado)', method: 'porcentaje_spee', value: t.other_charges_pct, reducibleByPv: true, status: 'provisional', sourceNote: t.source_note }] } : undefined,
  };
}

export type StudyResult = {
  consumption: { monthlyKwh: number[]; estimatedFromBill: boolean; annualKwh: number };
  sizing: SizingResult;
  resource: { source: string; candidates?: import('./resource').Candidate[]; notes?: string[] };
  scenarios: Record<'conservador' | 'base' | 'optimista', FinanceResult>;
  environment: { co2TonsYear: number; co2Tons25: number; treesEquivalent: number };
  tariff: { code: string; name: string; isPlaceholder: boolean; sourceNote: string; distributor?: string | null; scheme?: string; structure?: TariffStructure; options?: BillOptions | null };
  /** Factura actual típica (mes promedio) por rubros. */
  billLines?: BillLine[];
  surfaces?: SurfaceResult;
  alternatives?: Alternative[];
  recommended?: AlternativeKey | null;
  engine?: 2;
  paramsVersion: number;
  paramsPlaceholder: boolean;
  /** Facturación actual de referencia para el resumen comercial y el retorno simple. */
  billing?: { currentMonthlyUsd: number; source: 'planillas_12' | 'planilla' | 'declarada' | 'estimada' };
  /** Limitaciones que el cliente debe ver siempre (las demás advertencias van plegadas). */
  criticalWarnings?: string[];
  warnings: string[];
  disclaimer: string;
};

/** kWh que producen una factura del SPEE dada (búsqueda binaria sobre la factura por rubros). */
export function kwhFromBillV2(s: TariffStructure, billUsd: number, month: number, demandKw: number | undefined, opt?: BillOptions): number {
  const scheme = s.scheme;
  const bill = (kwh: number) => {
    const by: Partial<Record<PeriodKey, number>> = scheme === 'UNICO' ? { unico: kwh } : Object.fromEntries(s.energy.filter((e) => !e.months || e.months.includes(month)).map((e) => [e.period, kwh / new Set(s.energy.map((x) => x.period)).size]));
    return computeBill(s, { month, kwhByPeriod: by, demandKw, dmMax12Kw: demandKw, peakDemandKw: demandKw }, opt).total;
  };
  if (bill(0) >= billUsd) return 0;
  let lo = 0, hi = 5_000_000;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (bill(mid) < billUsd) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

export function runStudy(input: StudyInput, resource: SolarResource & { candidates?: import('./resource').Candidate[] }, tariffIn: Tariff | SelectedTariff, p: CalcParams): StudyResult {
  const tariff: SelectedTariff = 'structure' in tariffIn ? tariffIn : fromLegacyTariff(tariffIn);
  const s = tariff.structure;
  const warnings: string[] = [];
  const demandKw = input.demandKw && input.demandKw > 0 ? input.demandKw : undefined;
  const month = new Date().getMonth() + 1;
  let monthly: number[];
  let estimatedFromBill = false;
  if (input.monthlyHistoryKwh) monthly = input.monthlyHistoryKwh;
  else if (input.monthlyKwh) monthly = Array(12).fill(input.monthlyKwh);
  else {
    monthly = Array(12).fill(Math.round(kwhFromBillV2(s, input.monthlyBillUsd!, month, demandKw, tariff.options)));
    estimatedFromBill = true;
    warnings.push('El consumo se estimó a partir del valor de la factura y la tarifa seleccionada. Con el dato de kWh de tu planilla el resultado es más preciso.');
  }
  if (input.monthlyKwh && input.monthlyBillUsd) {
    const k = kwhFromBillV2(s, input.monthlyBillUsd, month, demandKw, tariff.options);
    if (Math.abs(k - input.monthlyKwh) / input.monthlyKwh > 0.35)
      warnings.push('El consumo y el valor de la factura indicados no son coherentes con la tarifa seleccionada; revisa ambos datos (la factura puede incluir tasas municipales o deudas).');
  }

  // Rendimiento neto por kWp y mes: pérdidas de sistema una sola vez (la fuente se consulta con loss=0) y degradación del primer año.
  const { factor, items } = systemLossFactor(p, input.shading);
  const yieldPerKwp = resource.monthlyYieldPreLoss.map((y) => y * factor * (1 - p.technical.firstYearDegradation));

  // Superficies: las nuevas; si solo viene el área de la versión anterior, se traduce.
  const surfaces = input.surfaces ?? (input.availableAreaM2 ? [{ type: input.surface === 'terreno' ? 'terreno' as const : 'techo_metalico' as const, areaM2: input.availableAreaM2 }] : []);
  const backup = input.backup ?? (input.wantsBattery || input.objective === 'respaldo' || input.objective === 'almacenamiento' ? 'esencial' : 'ninguno');
  const peakHours = input.peakHours ?? (input.daytimeShare != null ? (input.daytimeShare >= 0.6 ? 'mediodia' : input.daytimeShare <= 0.3 ? 'noche' : 'tarde') : undefined);
  const periodShares = input.periodKwh as Partial<Record<PeriodKey, number>> | undefined;

  const alt = computeAlternatives({
    segment: input.segment, monthlyKwh: monthly, peakHours, periodShares, demandKw, yieldPerKwp,
    tariff: { structure: s, options: tariff.options }, surfaces, backup, backupHours: input.backupHours || undefined,
    objective: input.objective, p,
  });
  const on = alt.alternatives.find((a) => a.key === 'onGrid')!;
  const genYear = on.annualGenerationKwh;
  const annual = monthly.reduce((a, b) => a + b, 0);
  const poa = resource.monthlyPoaKwhM2 ? resource.monthlyPoaKwhM2.reduce((a, b) => a + b, 0) : null;
  const specific = yieldPerKwp.reduce((a, b) => a + b, 0);
  const shape = loadShape(peakHours ?? DEFAULT_PEAK[input.segment]);
  const sizing: SizingResult = {
    kwp: on.kwp, kwpUnconstrained: alt.surfaces.idealKwp, limitedByArea: alt.surfaces.additionalKwp > 0, modules: on.modules, inverterKw: on.inverterKw,
    areaM2: on.areaM2, specificYieldYear1: Math.round(specific), performanceRatio: poa ? round(specific / poa, 3) : null,
    monthlyGeneration: on.monthly.generation, annualGeneration: genYear, monthlySelfConsumed: on.monthly.self, monthlyExported: on.monthly.exports,
    selfConsumptionRatio: on.selfConsumption, coverage: on.coverage, battery: null, annualConsumption: Math.round(annual), daytimeShare: round(1 - nightShare(shape), 2),
    lossItems: items,
    assumptions: [
      ...resource.notes,
      `Recurso solar: ${resource.source}. Pérdidas de sistema aplicadas una sola vez: ${((1 - factor) * 100).toFixed(1)} %.`,
      `Módulo de referencia ${p.technical.moduleWp} Wp, relación CC/CA ${p.technical.dcAcRatio}.`,
      periodShares ? 'Consumo por franjas horarias tomado de tu planilla.' : `Perfil de consumo tipo «${peakHours ?? DEFAULT_PEAK[input.segment]}»: con una curva de carga medida el resultado es más preciso.`,
      'Autoconsumo calculado hora a hora en un día típico de cada mes (laborable y fin de semana).',
    ],
  };

  if (input.budgetUsd && on.scenarios.base.capex.total > input.budgetUsd * 1.15)
    warnings.push('La inversión estimada supera el presupuesto indicado; podemos plantear un sistema por etapas o financiamiento.');
  if (!resource.candidates?.length) warnings.push('No fue posible consultar las fuentes de irradiación (PVGIS y NASA POWER): se usó un rendimiento regional conservador. Recalcularemos el estudio con datos de tu ubicación.');
  if (tariff.isPlaceholder) warnings.push(`Tarifa PROVISIONAL: ${tariff.sourceNote.startsWith('Pliego') ? 'transcrita del pliego oficial ARCONEL, pendiente de la revisión de Energy Solutions' : 'pendiente de validar con el pliego tarifario vigente'}.`);
  if (tariff.assumed) warnings.push(`Tarifa supuesta (${tariff.name}): confírmala con tu planilla; la categoría la asigna la distribuidora.`);
  if (tariff.distributor?.suggested) warnings.push(`Distribuidora sugerida por tu ubicación: ${tariff.distributor.name}. Si tu planilla dice otra, corrígela.`);
  if (p.isPlaceholder) warnings.push('Parámetros de precios PROVISIONALES: pendientes de validación por Energy Solutions Ecuador.');
  if (s.demand && !p.financial.demandSavingsFromPv)
    warnings.push('No se considera reducción del cargo por demanda: la generación solar no garantiza bajar el pico de potencia facturable.');
  if (s.demand && !demandKw) warnings.push('Sin el dato de demanda de tu planilla, el cargo por demanda se estimó con un perfil típico.');
  warnings.push('Tasas de terceros (alumbrado público, bomberos, recolección de basura) no incluidas: dependen de tu municipio y no se reducen necesariamente con paneles.');
  if (p.financial.exportCompensation === 'net_balance')
    warnings.push('Excedentes valorados como créditos de energía (Regulación ARCONEL-005/24): se descuentan en meses siguientes y caducan a los 24 meses, sin pago en dinero. Requiere el trámite de autoabastecimiento con la distribuidora.');

  // ---- Resumen comercial: lo que paga hoy (facturación real), lo que pagaría, ahorro, inversión y retorno simple bruto.
  // Retorno simple = inversión total / [(factura mensual actual − factura mensual residual) × 12]. El residual parte de la
  // factura actual y descuenta solo el ahorro que el motor calcula (cobertura alcanzable, superficie, cargos fijos).
  const engineMonthly = on.billBeforeYear / 12;
  const billing: NonNullable<StudyResult['billing']> = input.billedMonthlyUsd
    ? { currentMonthlyUsd: r2(input.billedMonthlyUsd), source: (input.billedMonths ?? 0) >= 12 ? 'planillas_12' : (input.billedMonths ?? 0) >= 1 ? 'planilla' : 'declarada' }
    : input.monthlyBillUsd ? { currentMonthlyUsd: r2(input.monthlyBillUsd), source: 'declarada' } : { currentMonthlyUsd: r2(engineMonthly), source: 'estimada' };
  const critical: string[] = [];
  for (const a of alt.alternatives) {
    const inv = r2(a.scenarios.base.capex.total);
    const cur = billing.currentMonthlyUsd;
    const residual = a.key === 'offGrid' ? 0 : Math.max(a.billAfterYear / 12, cur - a.savingYear1 / 12);
    const saving = Math.max(0, cur - residual);
    a.summary = { currentMonthlyUsd: r2(cur), residualMonthlyUsd: r2(residual), savingMonthlyUsd: r2(saving), savingYearUsd: r2(saving * 12), investmentUsd: inv, paybackYears: saving > 0 ? round(inv / (saving * 12), 1) : null };
    if (a.applicable && (a.summary.paybackYears == null || a.summary.paybackYears > p.financial.lifetimeYears))
      a.warnings.unshift(`Con los precios y la tarifa actuales, esta alternativa no recupera la inversión dentro de la vida útil de ${p.financial.lifetimeYears} años.`);
  }
  if (billing.source === 'planilla') warnings.push('El ahorro y el retorno toman como referencia el valor de una sola planilla: es una estimación preliminar. Con 12 meses facturados el resultado es más preciso.');
  if (billing.source === 'estimada') warnings.push('No tenemos el valor de tu factura: lo que pagas hoy se estimó con la tarifa oficial y tu consumo.');
  const rec = alt.alternatives.find((a) => a.key === alt.recommended);
  if (rec?.summary && (rec.summary.paybackYears == null || rec.summary.paybackYears > p.financial.lifetimeYears))
    critical.push(`Con los precios y la tarifa actuales, la alternativa recomendada no recupera la inversión dentro de la vida útil de ${p.financial.lifetimeYears} años.`);
  if (tariff.isPlaceholder) critical.push('Tarifa y resultados PROVISIONALES: pendientes de la revisión de Energy Solutions Ecuador.');
  else if (p.isPlaceholder) critical.push('Precios PROVISIONALES: pendientes de validación por Energy Solutions Ecuador.');
  if (!resource.candidates?.length) critical.push('Usamos un rendimiento solar regional conservador: recalcularemos con datos de tu ubicación.');
  if (alt.surfaces.additionalKwp > 0) critical.push(`Tu espacio limita el sistema: cubrirías cerca del ${Math.round((alt.surfaces.coverageReachable ?? 0) * 100)} % de tu consumo.`);

  const co2Year = (genYear * p.technical.gridCo2KgPerKwh) / 1000;
  const co2_25 = (on.scenarios.base.generationByYear.reduce((a, b) => a + b, 0) * p.technical.gridCo2KgPerKwh) / 1000;
  const avgMonth = Math.round(annual / 12);
  const billLines = computeBill(s, { month, kwhByPeriod: s.scheme === 'UNICO' ? { unico: avgMonth } : Object.fromEntries(Object.entries(periodShares ?? {}).map(([k, v]) => [k, v])), demandKw, dmMax12Kw: demandKw, peakDemandKw: demandKw, powerFactor: input.powerFactor }, tariff.options).lines;

  return {
    consumption: { monthlyKwh: monthly, estimatedFromBill, annualKwh: Math.round(annual) },
    sizing, resource: { source: resource.source, candidates: resource.candidates, notes: resource.notes }, scenarios: on.scenarios,
    environment: { co2TonsYear: round(co2Year, 1), co2Tons25: round(co2_25, 0), treesEquivalent: Math.round((co2Year * 1000) / 21.8) },
    tariff: { code: tariff.code, name: tariff.name, isPlaceholder: tariff.isPlaceholder, sourceNote: tariff.sourceNote, distributor: tariff.distributor?.name ?? null, scheme: s.scheme },
    billLines: s.scheme === 'UNICO' ? billLines : undefined,
    surfaces: alt.surfaces, alternatives: alt.alternatives, recommended: alt.recommended, engine: 2,
    paramsVersion: p.version, paramsPlaceholder: p.isPlaceholder, billing, criticalWarnings: critical, warnings,
    disclaimer: 'Este estudio constituye una prefactibilidad técnica y económica referencial. No es una oferta ni una cotización formal: está sujeto a inspección en sitio, ingeniería definitiva, verificación regulatoria y cotización de Energy Solutions Ecuador S.A.S.',
  };
}

export { PEAK_TO_DAYTIME };
