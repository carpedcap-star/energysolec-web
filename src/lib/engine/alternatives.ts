import type { CalcParams } from './params';
import { DEFAULT_PEAK, WEEKEND_FACTOR, daysInMonth, loadShape, nightShare, simulateMonth, type Battery, type MonthFlows, type PeakHours, type Segment } from './energy';
import { evaluateInvestment, type FinanceResult, type MountingPriceKey, type ScenarioName } from './finance';
import { roundInverter } from './solar';
import { computeBill, simulateNetMetering, SCHEME_PERIODS, type BillOptions, type BillResult, type MonthUsage, type PeriodKey, type TariffStructure } from './tariff-v2';

/** Tipos de superficie que el cliente elige (en palabras sencillas) y su estructura para el precio. */
export type SurfaceType = 'techo_metalico' | 'techo_inclinado' | 'losa' | 'terreno';
export const SURFACE_MOUNTING: Record<SurfaceType, MountingPriceKey> = {
  techo_metalico: 'cubierta_metalica', techo_inclinado: 'techo_inclinado', losa: 'losa', terreno: 'hincado',
};
export type SurfaceInput = { type: SurfaceType; areaM2: number | null };
export type BackupScope = 'ninguno' | 'esencial' | 'parcial' | 'total';

export type AlternativesInput = {
  segment: Segment;
  monthlyKwh: number[];
  peakHours?: PeakHours;
  /** kWh por franja de la planilla (proporciones de un mes): reemplazan el perfil tipo para repartir el consumo. */
  periodShares?: Partial<Record<PeriodKey, number>>;
  demandKw?: number;
  /** kWh/kWp por mes ya con pérdidas de sistema (una sola vez) y degradación del primer año. */
  yieldPerKwp: number[];
  tariff: { structure: TariffStructure; options?: BillOptions };
  surfaces: SurfaceInput[];
  backup: BackupScope;
  backupHours?: number;
  objective: 'reducir_factura' | 'autoconsumo' | 'respaldo' | 'almacenamiento' | 'inversion';
  p: CalcParams;
  year?: number;
};

export type AlternativeKey = 'onGrid' | 'hybrid' | 'offGrid';
export type Alternative = {
  key: AlternativeKey;
  name: string;
  applicable: boolean;
  /** Motivo si no es aplicable o si quedó limitada. */
  reason?: string;
  kwp: number; modules: number; inverterKw: number;
  /** backupKw: carga PROMEDIO que cubre la reserva de backupHours (los picos dimensionan el inversor). */
  battery: { nominalKwh: number; usableKwh: number; backupHours: number | null; backupKw: number | null } | null;
  areaM2: number;
  annualGenerationKwh: number;
  coverage: number;           // energía propia (autoconsumo + créditos usados) / consumo
  selfConsumption: number;    // autoconsumo / generación
  billBeforeYear: number; billAfterYear: number;
  savingYear1: number;
  /** Beneficio económico atribuible a las baterías (híbrido), separado del beneficio de respaldo. */
  batteryEconomicBenefitYear1?: number;
  residualCharges: string[];
  reliability?: number;       // Off Grid: fracción de la energía demandada suministrada (simulación)
  costOfEnergyUsdPerKwh?: number;
  scenarios: Record<ScenarioName, FinanceResult>;
  monthly: { generation: number[]; self: number[]; imports: number[]; exports: number[]; billBefore: number[]; billAfter: number[] };
  labels: string[];
  warnings: string[];
  /** Resumen comercial con la facturación real como referencia (lo llena runStudy). */
  summary?: AlternativeSummary;
};

export type AlternativeSummary = {
  currentMonthlyUsd: number; residualMonthlyUsd: number; savingMonthlyUsd: number; savingYearUsd: number;
  investmentUsd: number; paybackYears: number | null;
};

export type SurfaceResult = {
  idealKwp: number; maxKwp: number | null; optimalKwp: number; recommendedKwp: number; areaKnown: boolean;
  /** En orden de uso (cubiertas y losas antes que el terreno si así lo configura Gerencia); `modules`, `usedKwp` y
   * `usedAreaM2` reparten el sistema recomendado (On Grid) entre las superficies. */
  requiredAreaM2: number; perSurface: { type: SurfaceType; areaM2: number | null; maxKwp: number | null; usedKwp: number; modules?: number; usedAreaM2?: number }[];
  coverageReachable: number | null; additionalKwp: number; additionalAreaM2: number;
};

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Reparte el consumo de un mes en franjas: con las proporciones de la planilla, o con el perfil tipo. */
function usageFor(s: TariffStructure, flows: MonthFlows, month: number, demandKw: number | undefined, peakKw: number | undefined, totalKwh: number, shares?: Partial<Record<PeriodKey, number>>): MonthUsage {
  let byPeriod: Partial<Record<PeriodKey, number>>;
  if (shares && SCHEME_PERIODS[s.scheme].every((k) => shares[k] != null)) {
    const t = SCHEME_PERIODS[s.scheme].reduce((a, k) => a + (shares[k] ?? 0), 0);
    byPeriod = Object.fromEntries(SCHEME_PERIODS[s.scheme].map((k) => [k, ((shares[k] ?? 0) / t) * totalKwh]));
  } else byPeriod = flows.loadByPeriod;
  return { month, kwhByPeriod: byPeriod, demandKw, peakDemandKw: peakKw, dmMax12Kw: demandKw };
}

/** Escala los kWh importados por franja de forma proporcional cuando el consumo vino de la planilla por franjas. */
function rescale(from: Partial<Record<PeriodKey, number>>, totalLoad: Partial<Record<PeriodKey, number>>, target: Partial<Record<PeriodKey, number>>) {
  return Object.fromEntries(Object.keys(target).map((k) => {
    const kk = k as PeriodKey;
    const base = totalLoad[kk] ?? 0;
    return [kk, base > 0 ? ((from[kk] ?? 0) / base) * (target[kk] ?? 0) : 0];
  })) as Partial<Record<PeriodKey, number>>;
}

type YearSim = { flows: MonthFlows[]; before: BillResult[]; after: BillResult[]; creditsUsed: number[] };

function simulateYear(i: AlternativesInput, kwp: number, battery: Battery | null): YearSim {
  const s = i.tariff.structure;
  const shape = loadShape(i.peakHours ?? DEFAULT_PEAK[i.segment]);
  const year = i.year ?? new Date().getFullYear();
  const avgKw = sum(i.monthlyKwh) / 8760;
  // Demanda: la de la planilla; si falta y la tarifa la cobra, se estima con la relación pico/media del perfil (supuesto).
  const dm = i.demandKw ?? (s.demand ? avgKw * i.p.technical.peakToAverageLoad[i.segment] : undefined);
  const shapePeak = Math.max(...shape), shapeEvening = Math.max(...shape.slice(18, 22));
  const dp = dm != null ? dm * (shapeEvening / shapePeak) : undefined;
  const flows = i.monthlyKwh.map((kwh, m) => simulateMonth({ year, month: m + 1, loadKwh: kwh, pvKwh: kwp * i.yieldPerKwp[m], shape, weekendFactor: WEEKEND_FACTOR[i.segment], scheme: s.scheme, battery }));
  const before = flows.map((f, m) => computeBill(s, usageFor(s, f, m + 1, dm, dp, i.monthlyKwh[m], i.periodShares), i.tariff.options));
  const usageB = before.map((_, m) => usageFor(s, flows[m], m + 1, dm, dp, i.monthlyKwh[m], i.periodShares));
  const imports = flows.map((f, m) => rescale(f.importByPeriod, f.loadByPeriod, usageB[m].kwhByPeriod));
  const exports = flows.map((f) => f.exportByPeriod);
  // La generación propia NO reduce la demanda facturable (regla de negocio), salvo que se demuestre con datos horarios.
  if (i.p.financial.exportCompensation === 'net_balance') {
    const nm = simulateNetMetering(s, flows.map((_, m) => ({ ...usageB[m], kwhByPeriod: {}, importedByPeriod: imports[m], injectedByPeriod: exports[m] })), i.tariff.options);
    return { flows, before, after: nm.map((x) => x.bill), creditsUsed: nm.map((x) => x.creditUsedKwh) };
  }
  const after = flows.map((_, m) => computeBill(s, { ...usageB[m], kwhByPeriod: imports[m] }, i.tariff.options));
  return { flows, before, after, creditsUsed: flows.map(() => 0) };
}

function mountingSplit(i: AlternativesInput, kwp: number, perSurface: SurfaceResult['perSurface']) {
  const out: Partial<Record<MountingPriceKey, number>> = {};
  let left = kwp;
  for (const s of perSurface) {
    const take = s.maxKwp == null ? left : Math.min(left, s.maxKwp);
    out[SURFACE_MOUNTING[s.type]] = (out[SURFACE_MOUNTING[s.type]] ?? 0) + take;
    s.usedKwp = r2(take);
    left -= take;
    if (left <= 1e-9) break;
  }
  return out;
}

const RESIDUAL = (s: TariffStructure, compensation: boolean) => [
  'comercialización',
  ...(s.demand ? ['cargo por demanda (la generación solar no garantiza reducir el pico)'] : []),
  ...(compensation ? [] : ['energía de noche o con poco sol']),
  'tasas de terceros (alumbrado, bomberos, basura)',
];

export function computeAlternatives(i: AlternativesInput): { surfaces: SurfaceResult; alternatives: Alternative[]; recommended: AlternativeKey | null } {
  const p = i.p, t = p.technical;
  const s = i.tariff.structure;
  const annual = sum(i.monthlyKwh);
  const annualYield = sum(i.yieldPerKwp);
  const compensation = p.financial.exportCompensation === 'net_balance';
  const moduleKw = t.moduleWp / 1000;
  const roundModules = (kwp: number) => Math.max(1, Math.round(kwp / moduleKw));

  // ---- Superficie: potencia ideal, máxima instalable y cobertura alcanzable
  // A. Potencia ideal según consumo: con compensación (005/24), la que cubre el consumo anual (art. 9: no generar
  // más de lo que se consume); sin compensación, la que cubre el consumo de las horas de sol (06:00–18:00).
  const dayShare = 1 - nightShare(loadShape(i.peakHours ?? DEFAULT_PEAK[i.segment]));
  let ideal = compensation ? (annual * Math.min(1, t.coverageTarget)) / annualYield : (annual * dayShare) / annualYield;
  ideal = roundModules(ideal) * moduleKw;
  // Orden de uso: con `groundLast`, cubiertas y losas antes que el terreno; dentro de cada grupo, primero las de área conocida.
  const rank = (x: SurfaceInput) => (t.groundLast && x.type === 'terreno' ? 2 : 0) + (x.areaM2 == null ? 1 : 0);
  const ordered = [...i.surfaces].sort((a, b) => rank(a) - rank(b));
  const perSurface: SurfaceResult['perSurface'] = ordered.map((x) => ({ type: x.type, areaM2: x.areaM2, maxKwp: x.areaM2 != null && x.areaM2 > 0 ? x.areaM2 / t.mountingM2PerKwp[x.type] : null, usedKwp: 0 }));
  const areaKnown = perSurface.length > 0 && perSurface.every((x) => x.maxKwp != null);
  const maxKwp = areaKnown ? sum(perSurface.map((x) => x.maxKwp!)) : null;
  const m2For = (kwp: number) => {
    const types = i.surfaces.length ? i.surfaces.map((x) => x.type) : (['techo_metalico'] as SurfaceType[]);
    return kwp * (sum(types.map((x) => t.mountingM2PerKwp[x])) / types.length);
  };
  const maxModules = areaKnown ? sum(perSurface.map((x) => Math.floor(x.maxKwp! / moduleKw + 1e-9))) : null;
  const cap = maxModules == null ? ideal : Math.min(ideal, maxModules * moduleKw);
  // C. Potencia económicamente óptima: la de mayor VAN (escenario base) entre un módulo y la potencia ideal disponible.
  let optimal = cap, bestNpv = -Infinity;
  if (cap > 0) for (let k = 1; k <= 10; k++) {
    const kw = roundModules((cap * k) / 10) * moduleKw;
    const y = simulateYear(i, kw, null);
    const before = sum(y.before.map((b) => b.total)), after = sum(y.after.map((b) => b.total));
    const f = evaluateInvestment({ p, scenario: 'base', system: 'onGrid', kwp: kw, batteryKwh: 0, year1: { saving: before - after, before, after, generationKwh: sum(y.flows.map((x) => x.pvKwh)) } });
    if (f.npv > bestNpv) { bestNpv = f.npv; optimal = kw; }
  }
  // D. Recomendada: la óptima si es rentable; si ninguna lo es, la ideal disponible (y se advierte).
  const recommendedKwp = bestNpv > 0 ? optimal : cap;
  const surfaces: SurfaceResult = {
    idealKwp: r2(ideal), maxKwp: maxKwp == null ? null : r2(maxKwp), optimalKwp: r2(optimal), recommendedKwp: r2(recommendedKwp), areaKnown,
    requiredAreaM2: Math.round(m2For(ideal)), perSurface,
    coverageReachable: null, additionalKwp: maxKwp != null && maxKwp < ideal ? r2(ideal - maxKwp) : 0,
    additionalAreaM2: maxKwp != null && maxKwp < ideal ? Math.round(m2For(ideal - maxKwp)) : 0,
  };

  const finance = (system: AlternativeKey, kwp: number, batteryKwh: number, y: YearSim, mounting: Partial<Record<MountingPriceKey, number>>) => {
    const before = sum(y.before.map((b) => b.total)), after = sum(y.after.map((b) => b.total));
    const gen = sum(y.flows.map((f) => f.pvKwh));
    const year1 = { saving: before - after, before, after, generationKwh: gen };
    return Object.fromEntries((['conservador', 'base', 'optimista'] as const).map((sc) => [sc, evaluateInvestment({ p, scenario: sc, system, kwp, batteryKwh, mountingKwp: mounting, year1 })])) as Record<ScenarioName, FinanceResult>;
  };
  const monthly = (y: YearSim) => ({
    generation: y.flows.map((f) => Math.round(f.pvKwh)), self: y.flows.map((f) => Math.round(f.selfKwh + f.batteryToLoadKwh)),
    imports: y.flows.map((f) => Math.round(f.importKwh)), exports: y.flows.map((f) => Math.round(f.exportKwh)),
    billBefore: y.before.map((b) => r2(b.total)), billAfter: y.after.map((b) => r2(b.total)),
  });
  const coverageOf = (y: YearSim) => (sum(y.flows.map((f) => f.selfKwh + f.batteryToLoadKwh)) + sum(y.creditsUsed)) / annual;
  const common = (y: YearSim) => {
    const gen = sum(y.flows.map((f) => f.pvKwh));
    return {
      annualGenerationKwh: Math.round(gen), coverage: r2(coverageOf(y)),
      selfConsumption: gen > 0 ? r2(sum(y.flows.map((f) => f.selfKwh + f.batteryToLoadKwh)) / gen) : 0,
      billBeforeYear: r2(sum(y.before.map((b) => b.total))), billAfterYear: r2(sum(y.after.map((b) => b.total))),
      savingYear1: r2(sum(y.before.map((b) => b.total)) - sum(y.after.map((b) => b.total))),
    };
  };

  // ---- On Grid
  const kwpOn = recommendedKwp;
  // Reparto de los paneles del sistema recomendado entre las superficies, en el orden de uso y sin superar su capacidad.
  let leftModules = roundModules(kwpOn);
  for (const x of surfaces.perSurface) {
    const cap = x.maxKwp == null ? Infinity : Math.floor(x.maxKwp / moduleKw + 1e-9);
    const n = Math.max(0, Math.min(leftModules, cap));
    x.modules = n; x.usedKwp = r2(n * moduleKw); x.usedAreaM2 = Math.round(n * moduleKw * t.mountingM2PerKwp[x.type]);
    leftModules -= n;
  }
  const yOn = simulateYear(i, kwpOn, null);
  surfaces.coverageReachable = maxKwp != null && maxKwp < ideal ? r2(coverageOf(yOn)) : null;
  const mountOn = mountingSplit(i, kwpOn, structuredClone(surfaces.perSurface));
  const onWarnings = ['Un sistema On Grid convencional se apaga cuando se va la luz: no da respaldo durante apagones.'];
  if (!areaKnown) onWarnings.push(`${perSurface.some((x) => x.areaM2 != null) ? 'No conocemos toda el área disponible' : 'No conocemos el área disponible'}: se necesitan unos ${surfaces.requiredAreaM2} m² para la potencia ideal; lo confirmaremos en la visita.`);
  if (surfaces.additionalKwp > 0) onWarnings.push(`El espacio indicado limita la potencia: faltan unos ${surfaces.additionalKwp} kWp (unos ${surfaces.additionalAreaM2} m²) para la potencia ideal.`);
  const onGrid: Alternative = {
    key: 'onGrid', name: 'Energy On Grid', applicable: kwpOn > 0, reason: kwpOn > 0 ? undefined : 'El espacio indicado no alcanza ni para un módulo.',
    kwp: r2(kwpOn), modules: roundModules(kwpOn), inverterKw: roundInverter(kwpOn / t.dcAcRatio), battery: null,
    areaM2: surfaces.perSurface.length && leftModules === 0 ? sum(surfaces.perSurface.map((x) => x.usedAreaM2 ?? 0)) : Math.round(m2For(kwpOn)), ...common(yOn), residualCharges: RESIDUAL(s, compensation), scenarios: finance('onGrid', kwpOn, 0, yOn, mountOn),
    monthly: monthly(yOn), labels: [], warnings: onWarnings,
  };

  // ---- Hybrid: respaldo según las cargas a respaldar; beneficio económico de las baterías por separado
  const avgKw = annual / 8760;
  const scope = i.backup === 'ninguno' ? 'esencial' : i.backup;
  const hours = i.backupHours ?? t.hybridBackupHours;
  // La reserva se dimensiona con la carga PROMEDIO respaldada; los picos (arranques) solo dimensionan el inversor.
  const backupAvgKw = avgKw * t.backupLoadShare[scope];
  const backupKw = backupAvgKw * t.peakToAverageLoad[i.segment];
  const backupEnergy = backupAvgKw * hours;
  const usableFrac = Math.min(t.batteryUsableDoD, 1 - t.socMinReserve); // DoD y reserva mínima no se suman
  const dischEff = Math.sqrt(t.batteryRoundTrip);
  // Sin compensación de excedentes, la batería también guarda el sobrante del día (si es mayor que la necesidad de respaldo).
  const dailyExcess = sum(yOn.flows.map((f) => f.exportKwh)) / 365;
  const needKwh = Math.max(backupEnergy, compensation ? 0 : dailyExcess) / (usableFrac * dischEff);
  const nominal = Math.max(5, Math.ceil(needKwh / 5) * 5);
  const usable = nominal * usableFrac;
  // Durante la operación normal se reserva la energía de respaldo; lo demás cicla a diario.
  const cycling = Math.max(0, usable - backupEnergy / dischEff);
  const battery: Battery = { cyclingKwh: cycling, powerKw: Math.max(backupKw, usable / 2), roundTrip: t.batteryRoundTrip };
  const yHy = simulateYear(i, kwpOn, battery);
  const mountHy = mountingSplit(i, kwpOn, structuredClone(surfaces.perSurface));
  const hyCommon = common(yHy);
  const hyWarnings = [
    `Reserva de ${hours} h para las cargas ${scope === 'total' ? 'de todo el inmueble' : scope === 'parcial' ? 'principales' : 'esenciales'} con un consumo promedio de ${r1(backupAvgKw)} kW (picos de hasta ${r1(backupKw)} kW, que definen el inversor). Es preliminar: se confirma con el inventario de cargas y sus arranques.`,
  ];
  if (s.demand) hyWarnings.push('No se considera reducción del cargo por demanda con baterías: se demuestra solo con mediciones horarias de demanda.');
  const hybrid: Alternative = {
    key: 'hybrid', name: 'Energy Hybrid', applicable: kwpOn > 0, reason: onGrid.reason,
    kwp: r2(kwpOn), modules: roundModules(kwpOn), inverterKw: roundInverter(Math.max(kwpOn / t.dcAcRatio, backupKw)),
    battery: { nominalKwh: nominal, usableKwh: r1(usable), backupHours: hours, backupKw: r1(backupAvgKw) },
    areaM2: onGrid.areaM2, ...hyCommon, batteryEconomicBenefitYear1: r2(hyCommon.savingYear1 - onGrid.savingYear1),
    residualCharges: RESIDUAL(s, compensation), scenarios: finance('hybrid', kwpOn, nominal, yHy, mountHy), monthly: monthly(yHy), labels: [], warnings: hyWarnings,
  };

  // ---- Off Grid: mes crítico + racha de días de baja generación; se verifica la confiabilidad por simulación diaria.
  const daily = annual / 365;
  const ns = nightShare(loadShape(i.peakHours ?? DEFAULT_PEAK[i.segment]));
  const worst = Math.min(...i.yieldPerKwp.map((y, m) => y / daysInMonth(m + 1)));
  const worstMonth = i.yieldPerKwp.findIndex((y, m) => y / daysInMonth(m + 1) === worst);
  const offWarnings: string[] = [];
  let offApplicable = true, offReason: string | undefined;
  if (i.segment === 'industrial' || annual > 120_000) {
    offApplicable = false;
    offReason = 'Para cargas industriales o consumos altos, un sistema aislado requiere un estudio específico (generación de respaldo y cargas de arranque).';
  }
  const simulateOff = (kwp: number, nomKwh: number) => {
    const cap = nomKwh * usableFrac;
    let soc = cap, served = 0, demanded = 0;
    for (let m = 0; m < 12; m++) for (let d = 0; d < daysInMonth(m + 1); d++) {
      const low = m === worstMonth && d < t.offGridLowSunDays;
      const pv = kwp * (i.yieldPerKwp[m] / daysInMonth(m + 1)) * (low ? t.offGridLowSunFactor : 1);
      const L = (i.monthlyKwh[m] / daysInMonth(m + 1));
      const dayLoad = L * (1 - ns), night = L * ns;
      const direct = Math.min(dayLoad, pv);
      let need = dayLoad - direct + night, excess = pv - direct;
      soc = Math.min(cap, soc + excess * dischEff);
      const fromBat = Math.min(need, soc * dischEff);
      soc -= fromBat / dischEff; need -= fromBat;
      served += L - need; demanded += L;
    }
    return demanded > 0 ? served / demanded : 1;
  };
  let kwpOff = ((daily * (1 - ns) + (daily * ns) / t.batteryRoundTrip) / worst);
  let nomOff = Math.max(5, Math.ceil((daily * (t.offGridAutonomyHours / 24)) / (usableFrac * dischEff) / 5) * 5);
  let rel = simulateOff(kwpOff, nomOff);
  for (let k = 0; k < 20 && rel < t.offGridReliability; k++) { kwpOff *= 1.1; nomOff = Math.ceil((nomOff * 1.1) / 5) * 5; rel = simulateOff(kwpOff, nomOff); }
  kwpOff = roundModules(kwpOff) * moduleKw;
  if (maxKwp != null && kwpOff > maxKwp) {
    const relMax = simulateOff((maxModules ?? 0) * moduleKw, nomOff);
    offWarnings.push(`El espacio indicado no permite la potencia necesaria (${r1(kwpOff)} kWp): con ${r1(maxKwp)} kWp la energía suministrada sería cerca del ${(relMax * 100).toFixed(1)} %. Alternativas: más superficie, reducir cargas o un generador de respaldo.`);
    if (offApplicable) { offApplicable = relMax >= 0.95; if (!offApplicable) offReason = 'La superficie disponible no alcanza para un sistema aislado confiable.'; }
    kwpOff = Math.min(kwpOff, (maxModules ?? 0) * moduleKw);
    rel = relMax;
  }
  if (rel < t.offGridReliability) offWarnings.push(`Confiabilidad estimada ${(rel * 100).toFixed(1)} %, por debajo del objetivo de ${(t.offGridReliability * 100).toFixed(1)} %.`);
  offWarnings.push(`Dimensionado para el mes de menor sol (${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][worstMonth]}), ${t.offGridAutonomyHours} h de autonomía y ${t.offGridLowSunDays} días seguidos de baja generación. Es una verificación preliminar: no garantiza independencia energética.`);
  offWarnings.push('Sin conexión a la red no hay respaldo externo: los consumos que superen lo previsto o los arranques de motores pueden dejarte sin energía.');
  const genOff = sum(i.yieldPerKwp.map((y) => y * kwpOff));
  const offBefore = sum(yOn.before.map((b) => b.total));
  const yearOff = { saving: offBefore, before: offBefore, after: 0, generationKwh: genOff };
  const mountOff = mountingSplit(i, kwpOff, structuredClone(surfaces.perSurface));
  const offScen = Object.fromEntries((['conservador', 'base', 'optimista'] as const).map((sc) => [sc, evaluateInvestment({ p, scenario: sc, system: 'offGrid', kwp: kwpOff, batteryKwh: nomOff, mountingKwp: mountOff, year1: yearOff })])) as Record<ScenarioName, FinanceResult>;
  const servedYear = annual * rel;
  const offGrid: Alternative = {
    key: 'offGrid', name: 'Energy Off Grid', applicable: offApplicable, reason: offReason,
    kwp: r2(kwpOff), modules: roundModules(kwpOff), inverterKw: roundInverter(avgKw * t.peakToAverageLoad[i.segment]),
    battery: { nominalKwh: nomOff, usableKwh: r1(nomOff * usableFrac), backupHours: t.offGridAutonomyHours, backupKw: r1(avgKw) },
    areaM2: Math.round(m2For(kwpOff)), annualGenerationKwh: Math.round(genOff), coverage: r2(rel), selfConsumption: genOff > 0 ? r2(servedYear / genOff) : 0,
    billBeforeYear: r2(offBefore), billAfterYear: 0, savingYear1: r2(offBefore), residualCharges: [], reliability: r2(rel),
    costOfEnergyUsdPerKwh: servedYear > 0 ? r2(offScen.base.lcoe * genOff / servedYear) : undefined,
    scenarios: offScen,
    monthly: { generation: i.yieldPerKwp.map((y) => Math.round(y * kwpOff)), self: i.monthlyKwh.map((k) => Math.round(k * rel)), imports: i.monthlyKwh.map(() => 0), exports: i.monthlyKwh.map(() => 0), billBefore: yOn.before.map((b) => r2(b.total)), billAfter: i.monthlyKwh.map(() => 0) },
    labels: [], warnings: offWarnings,
  };

  // ---- Etiquetas y recomendación (reglas, no texto libre)
  const alts = [onGrid, hybrid, offGrid];
  const ok = alts.filter((a) => a.applicable);
  const best = (f: (a: Alternative) => number, label: string) => { if (!ok.length) return; const b = ok.reduce((x, y) => (f(y) > f(x) ? y : x)); b.labels.push(label); };
  best((a) => -a.scenarios.base.capex.total, 'Menor inversión');
  best((a) => a.savingYear1, 'Mayor ahorro');
  best((a) => a.scenarios.base.npv, 'Mejor retorno');
  best((a) => (a.battery?.backupHours ?? 0) * (a.key === 'offGrid' ? 2 : 1), 'Mayor autonomía');
  let recommended: AlternativeKey | null = null;
  if (ok.length) {
    if (i.objective === 'respaldo' || i.objective === 'almacenamiento' || i.backup !== 'ninguno') recommended = hybrid.applicable ? 'hybrid' : onGrid.applicable ? 'onGrid' : null;
    else recommended = ok.filter((a) => a.key !== 'offGrid').reduce<Alternative | null>((x, y) => (!x || y.scenarios.base.npv > x.scenarios.base.npv ? y : x), null)?.key ?? null;
  }
  return { surfaces, alternatives: alts, recommended };
}
