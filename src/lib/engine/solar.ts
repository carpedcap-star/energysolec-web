import type { CalcParams } from './params';

export type SolarResource = {
  source: string;                    // 'PVGIS-ERA5', 'NASA-POWER', 'Estimación regional'
  /** kWh/kWp por mes, ya con efectos de temperatura/irradiancia, SIN pérdidas de sistema */
  monthlyYieldPreLoss: number[];
  monthlyPoaKwhM2?: number[];
  notes: string[];
};

export type Shading = 'none' | 'partial' | 'significant';
export type Segment = 'residencial' | 'comercial' | 'industrial';
export type Objective = 'reducir_factura' | 'autoconsumo' | 'respaldo' | 'almacenamiento' | 'inversion';

export type SizingInput = {
  segment: Segment;
  objective: Objective;
  monthlyKwh: number[];             // 12 valores (si solo hay uno, se replica)
  daytimeShare?: number;            // 0..1
  shading: Shading;
  surface: 'cubierta' | 'terreno';
  availableAreaM2?: number;
  wantsBattery: boolean;
  backupHours?: number;             // horas de respaldo deseadas
  criticalLoadKw?: number;
};

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Factor único de pérdidas de sistema. Cada pérdida aparece una sola vez. */
export function systemLossFactor(p: CalcParams, shading: Shading) {
  const t = p.technical;
  const items = [
    { label: 'Suciedad', loss: t.soilingLoss },
    { label: 'Sombreado', loss: t.shadingLoss[shading] },
    { label: 'Cableado DC y mismatch', loss: t.dcWiringMismatchLoss },
    { label: 'Eficiencia de inversor', loss: 1 - t.inverterEfficiency },
    { label: 'Cableado AC', loss: t.acWiringLoss },
    { label: 'Disponibilidad', loss: 1 - t.availability },
  ];
  const factor = items.reduce((f, i) => f * (1 - i.loss), 1);
  return { factor, items };
}

export type SizingResult = {
  kwp: number;
  kwpUnconstrained: number;
  limitedByArea: boolean;
  modules: number;
  inverterKw: number;
  areaM2: number;
  specificYieldYear1: number;       // kWh/kWp/año neto, año 1 (incluye degradación inicial)
  performanceRatio: number | null;
  monthlyGeneration: number[];
  annualGeneration: number;
  monthlySelfConsumed: number[];
  monthlyExported: number[];
  selfConsumptionRatio: number;     // autoconsumido / generado
  coverage: number;                 // autoconsumido(+compensado) / consumo
  battery: { kwh: number; shiftedKwhYear: number } | null;
  annualConsumption: number;
  daytimeShare: number;
  lossItems: { label: string; loss: number }[];
  assumptions: string[];
};

export function sizeSystem(input: SizingInput, res: SolarResource, p: CalcParams, compensatesExport: boolean): SizingResult {
  const t = p.technical;
  const cons = input.monthlyKwh.length === 12 ? input.monthlyKwh : Array(12).fill(input.monthlyKwh[0] ?? 0);
  const annualConsumption = cons.reduce((a, b) => a + b, 0);
  const d = clamp(input.daytimeShare ?? t.defaultDaytimeShare[input.segment], 0.05, 1);
  const { factor, items } = systemLossFactor(p, input.shading);
  const yieldNet = res.monthlyYieldPreLoss.map((y) => y * factor * (1 - t.firstYearDegradation));
  const specific = sum(yieldNet);
  const assumptions: string[] = [];

  // Energía objetivo anual según objetivo y régimen de excedentes
  const battery = input.wantsBattery || input.objective === 'almacenamiento' || input.objective === 'respaldo';
  let targetEnergy: number;
  if (compensatesExport) {
    targetEnergy = annualConsumption * t.coverageTarget;
    assumptions.push(`Dimensionado para cubrir el ${(t.coverageTarget * 100).toFixed(0)} % del consumo anual (régimen de compensación de excedentes configurado).`);
  } else if (battery) {
    targetEnergy = annualConsumption * Math.min(t.coverageTarget, d + 0.3);
    assumptions.push('Sin compensación de excedentes: el sistema se dimensiona para consumo diurno más la energía que las baterías desplazan a la noche.');
  } else {
    targetEnergy = annualConsumption * d;
    assumptions.push(`Sin compensación de excedentes: el sistema se dimensiona al consumo diurno estimado (${(d * 100).toFixed(0)} %) para no generar energía que no se aprovecha.`);
  }

  // Potencia FV = energía objetivo / rendimiento específico
  const kwpUnconstrained = targetEnergy / specific;
  const m2PerKwp = input.surface === 'terreno' ? t.groundM2PerKwp : t.roofM2PerKwp;
  let kwp = kwpUnconstrained;
  let limitedByArea = false;
  if (input.availableAreaM2 && input.availableAreaM2 > 0) {
    const maxKwp = input.availableAreaM2 / m2PerKwp;
    if (maxKwp < kwp) { kwp = maxKwp; limitedByArea = true; assumptions.push('La potencia se limitó por la superficie disponible indicada.'); }
  }
  const modules = Math.max(1, Math.round((kwp * 1000) / t.moduleWp));
  kwp = (modules * t.moduleWp) / 1000;
  const inverterKw = roundInverter(kwp / t.dcAcRatio);

  const gen = yieldNet.map((y) => y * kwp);
  // Autoconsumo mensual: la generación cubre como máximo el consumo diurno del mes
  const daily = cons.map((c) => c * d);
  const directSelf = gen.map((g, i) => Math.min(g, daily[i]));
  let excess = gen.map((g, i) => g - directSelf[i]);
  const night = cons.map((c, i) => c - directSelf[i]);

  let batt: SizingResult['battery'] = null;
  let shifted = Array(12).fill(0);
  if (battery) {
    // Batería dimensionada para desplazar el excedente diario promedio o cubrir el respaldo pedido
    const avgDailyExcess = sum(excess) / 365;
    const backupKwh = (input.backupHours ?? 0) * (input.criticalLoadKw ?? 0);
    const usableNeeded = Math.max(avgDailyExcess, backupKwh);
    const kwh = Math.max(5, Math.ceil(usableNeeded / t.batteryUsableDoD / 5) * 5);
    shifted = excess.map((e, i) => Math.min(e * t.batteryRoundTrip, kwh * t.batteryUsableDoD * DAYS_IN_MONTH[i] * t.batteryRoundTrip, night[i]));
    excess = excess.map((e, i) => e - shifted[i] / t.batteryRoundTrip);
    batt = { kwh, shiftedKwhYear: sum(shifted) };
    assumptions.push(`Batería de ${kwh} kWh nominales (${(t.batteryUsableDoD * 100).toFixed(0)} % utilizable, eficiencia ida-vuelta ${(t.batteryRoundTrip * 100).toFixed(0)} %).`);
  }
  const self = directSelf.map((s, i) => s + shifted[i]);
  const exported = excess.map((e) => Math.max(0, e));
  const annualGeneration = sum(gen);
  const credited = compensatesExport ? Math.min(sum(exported), annualConsumption - sum(self)) : 0;

  const poa = res.monthlyPoaKwhM2 ? sum(res.monthlyPoaKwhM2) : null;
  assumptions.push(`Recurso solar: ${res.source}. Pérdidas de sistema aplicadas una sola vez: ${((1 - factor) * 100).toFixed(1)} %.`);
  assumptions.push(`Módulo de referencia ${t.moduleWp} Wp, relación DC/AC ${t.dcAcRatio}.`);
  assumptions.push('Supuesto de autoconsumo mensual: la generación cubre como máximo el consumo diurno. Una curva de carga horaria afina este resultado.');

  return {
    kwp: round(kwp, 2), kwpUnconstrained: round(kwpUnconstrained, 2), limitedByArea, modules, inverterKw,
    areaM2: Math.round(kwp * m2PerKwp),
    specificYieldYear1: Math.round(specific),
    performanceRatio: poa ? round(specific / poa, 3) : null,
    monthlyGeneration: gen.map(Math.round), annualGeneration: Math.round(annualGeneration),
    monthlySelfConsumed: self.map(Math.round), monthlyExported: exported.map(Math.round),
    selfConsumptionRatio: round(sum(self) / annualGeneration, 3),
    coverage: round((sum(self) + credited) / annualConsumption, 3),
    battery: batt, annualConsumption: Math.round(annualConsumption), daytimeShare: d,
    lossItems: items, assumptions: [...res.notes, ...assumptions],
  };
}

const STD_INVERTERS = [3, 3.6, 5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 36, 40, 50, 60, 75, 100, 110, 125, 150, 185, 215, 250, 330];
function roundInverter(kw: number) {
  const hit = STD_INVERTERS.find((s) => s >= kw * 0.98);
  if (hit) return hit;
  return Math.ceil(kw / 330) * 330; // múltiplos de inversores string de gran potencia / centrales
}
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
export const round = (x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
