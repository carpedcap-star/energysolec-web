import { MOUNTING_PRICE_KEYS, type CalcParams } from './params';
import type { SizingResult } from './solar';
import { monthlyBill, type Tariff } from './tariff';

export type ScenarioName = 'conservador' | 'base' | 'optimista';

export type SystemType = 'onGrid' | 'hybrid' | 'offGrid';
export type MountingPriceKey = (typeof MOUNTING_PRICE_KEYS)[number];

/**
 * Inversión estimada: precio por kWp según el tipo de sistema y el tramo de potencia, más el sobreprecio de la
 * estructura de cada superficie (kWp por tipo), más baterías por tramo de capacidad, ingeniería, mínimo e IVA.
 * Sin `opts` se comporta como antes (On Grid, sin sobreprecios, baterías al precio por kWh de base).
 */
export function capex(p: CalcParams, kwp: number, batteryKwh: number, capexFactor = 1, opts: { system?: SystemType; mountingKwp?: Partial<Record<MountingPriceKey, number>> } = {}) {
  const tiers = opts.system === 'hybrid' ? p.pricing.hybridPvTiers : opts.system === 'offGrid' ? p.pricing.offGridPvTiers : p.pricing.pvTiers;
  const tier = tiers.find((t) => kwp <= t.upToKwp) ?? tiers[tiers.length - 1];
  const pv = kwp * tier.usdPerKwp;
  const mounting = Object.entries(opts.mountingKwp ?? {}).reduce((a, [k, v]) => a + (v ?? 0) * (p.pricing.mountingUsdPerKwp[k as MountingPriceKey] ?? 0), 0);
  const bt = p.pricing.batteryTiers.find((t) => batteryKwh <= t.upToKwh) ?? p.pricing.batteryTiers[p.pricing.batteryTiers.length - 1];
  const storage = batteryKwh * (opts.system ? bt.usdPerKwh : p.pricing.batteryUsdPerKwh);
  const engineering = (pv + mounting + storage) * p.pricing.engineeringShare;
  const net = Math.max(p.pricing.minimumProjectUsd, (pv + mounting + storage + engineering) * capexFactor);
  const vat = net * p.pricing.vatOnCapex;
  return { pv, mounting, storage, engineering, net, vat, total: net + vat, usdPerKwp: tier.usdPerKwp };
}

/** Ahorro del primer año comparando facturas con y sin sistema, mes a mes. */
export function firstYearSavings(p: CalcParams, t: Tariff, monthlyKwh: number[], demandKw: number, s: SizingResult, yieldFactor = 1) {
  const f = p.financial;
  let before = 0, after = 0, exportIncome = 0;
  const monthly = monthlyKwh.map((c, i) => {
    const self = s.monthlySelfConsumed[i] * yieldFactor;
    const exp = s.monthlyExported[i] * yieldFactor;
    let imported = Math.max(0, c - self);
    if (f.exportCompensation === 'net_balance') imported = Math.max(0, imported - exp);
    if (f.exportCompensation === 'fixed_price') exportIncome += exp * f.exportPriceUsdPerKwh;
    const demandAfter = f.demandSavingsFromPv ? demandKw * 0.9 : demandKw;
    const b0 = monthlyBill(t, c, demandKw).total;
    const b1 = monthlyBill(t, imported, demandAfter).total;
    before += b0; after += b1;
    return { before: b0, after: b1, saving: b0 - b1 };
  });
  return { before, after, exportIncome, saving: before - after + exportIncome, monthly };
}

export function npv(rate: number, flows: number[]) {
  return flows.reduce((acc, cf, y) => acc + cf / (1 + rate) ** y, 0);
}

export function irr(flows: number[]): number | null {
  let lo = -0.99, hi = 1.5;
  const fLo = npv(lo, flows), fHi = npv(hi, flows);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = npv(mid, flows);
    if (Math.abs(v) < 1e-6) return mid;
    if (npv(lo, flows) * v < 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

/** Año (fraccional) en que el acumulado pasa a positivo; null si no ocurre en la vida útil. */
export function payback(flows: number[]): number | null {
  let acc = flows[0];
  for (let y = 1; y < flows.length; y++) {
    const prev = acc;
    acc += flows[y];
    if (acc >= 0) return y - 1 + (flows[y] === 0 ? 0 : -prev / flows[y]);
  }
  return null;
}

export type FinanceResult = {
  scenario: ScenarioName;
  capex: ReturnType<typeof capex>;
  savingYear1: number;
  savingMonthYear1: number;
  billBeforeYear: number;
  billAfterYear: number;
  billReduction: number;            // fracción de la factura que se reduce (nunca se asume 100 %)
  cashflows: number[];              // año 0..N
  cumulative: number[];
  simplePayback: number | null;
  discountedPayback: number | null;
  npv: number;
  irr: number | null;
  lcoe: number;                     // USD/kWh
  savings25: number;
  roi: number;                      // ahorro neto acumulado / inversión
  generationByYear: number[];
  loan: { principal: number; monthlyPayment: number; years: number; rate: number } | null;
};

export function financeScenario(
  p: CalcParams, t: Tariff, monthlyKwh: number[], demandKw: number, s: SizingResult, scenario: ScenarioName,
): FinanceResult {
  const f = p.financial;
  const sc = f.scenarios[scenario];
  const cx = capex(p, s.kwp, s.battery?.kwh ?? 0, sc.capexFactor);
  const y1 = firstYearSavings(p, t, monthlyKwh, demandKw, s, sc.yieldFactor);
  const N = f.lifetimeYears;
  const deg = p.technical.annualDegradation + sc.extraDegradation;

  const flows = [-cx.total];
  const disc = [-cx.total];
  const gens: number[] = [];
  let pvCosts = cx.total, pvEnergy = 0, savingsSum = 0;
  for (let y = 1; y <= N; y++) {
    const perf = (1 - deg) ** (y - 1);
    const price = (1 + sc.tariffEscalation) ** (y - 1);
    const saving = y1.saving * perf * price;
    const om = f.omUsdPerKwpYear * s.kwp * (1 + f.omEscalation) ** (y - 1);
    let repl = 0;
    if (y === f.inverterReplacementYear) repl += cx.net * f.inverterReplacementShareOfCapex;
    if (s.battery && y === f.batteryReplacementYear) repl += cx.storage * 0.6; // supuesto: costo de baterías cae ~40 %
    const cf = saving - om - repl;
    flows.push(cf);
    const df = (1 + f.discountRate) ** y;
    disc.push(cf / df);
    const g = s.annualGeneration * sc.yieldFactor * perf;
    gens.push(Math.round(g));
    pvCosts += (om + repl) / df;
    pvEnergy += g / df;
    savingsSum += saving;
  }
  const cumulative: number[] = [];
  flows.reduce((a, c) => { const v = a + c; cumulative.push(v); return v; }, 0);

  let loan: FinanceResult['loan'] = null;
  if (f.financing.enabled) {
    const principal = cx.total * (1 - f.financing.downPayment);
    const r = f.financing.annualRate / 12, n = f.financing.years * 12;
    loan = { principal, monthlyPayment: (principal * r) / (1 - (1 + r) ** -n), years: f.financing.years, rate: f.financing.annualRate };
  }

  return {
    scenario, capex: cx,
    savingYear1: y1.saving, savingMonthYear1: y1.saving / 12,
    billBeforeYear: y1.before, billAfterYear: y1.after,
    billReduction: y1.before > 0 ? (y1.before - y1.after) / y1.before : 0,
    cashflows: flows, cumulative,
    simplePayback: payback(flows), discountedPayback: payback(disc),
    npv: npv(f.discountRate, flows), irr: irr(flows),
    lcoe: pvCosts / pvEnergy,
    savings25: savingsSum,
    roi: (cumulative[cumulative.length - 1]) / cx.total,
    generationByYear: gens, loan,
  };
}

/**
 * Evaluación financiera a partir del ahorro del primer año ya calculado (motor tarifario v2): mismo flujo de caja,
 * VAN, TIR, LCOE y reposiciones que financeScenario. La batería se repone en el año configurado (supuesto existente:
 * su costo baja ~40 %).
 */
export function evaluateInvestment(o: {
  p: CalcParams; scenario: ScenarioName; system: SystemType; kwp: number; batteryKwh: number;
  mountingKwp?: Partial<Record<MountingPriceKey, number>>;
  year1: { saving: number; before: number; after: number; generationKwh: number };
}): FinanceResult {
  const { p, scenario } = o;
  const f = p.financial;
  const sc = f.scenarios[scenario];
  const cx = capex(p, o.kwp, o.batteryKwh, sc.capexFactor, { system: o.system, mountingKwp: o.mountingKwp });
  const N = f.lifetimeYears;
  const deg = p.technical.annualDegradation + sc.extraDegradation;
  const saving1 = o.year1.saving * sc.yieldFactor;
  const flows = [-cx.total], disc = [-cx.total], gens: number[] = [];
  let pvCosts = cx.total, pvEnergy = 0, savingsSum = 0;
  for (let y = 1; y <= N; y++) {
    const perf = (1 - deg) ** (y - 1);
    const saving = saving1 * perf * (1 + sc.tariffEscalation) ** (y - 1);
    const om = f.omUsdPerKwpYear * o.kwp * (1 + f.omEscalation) ** (y - 1);
    let repl = 0;
    if (y === f.inverterReplacementYear) repl += cx.net * f.inverterReplacementShareOfCapex;
    if (o.batteryKwh > 0 && y === f.batteryReplacementYear) repl += cx.storage * 0.6;
    const cf = saving - om - repl;
    flows.push(cf);
    const df = (1 + f.discountRate) ** y;
    disc.push(cf / df);
    const g = o.year1.generationKwh * sc.yieldFactor * perf;
    gens.push(Math.round(g));
    pvCosts += (om + repl) / df; pvEnergy += g / df; savingsSum += saving;
  }
  const cumulative: number[] = [];
  flows.reduce((a, c) => { const v = a + c; cumulative.push(v); return v; }, 0);
  let loan: FinanceResult['loan'] = null;
  if (f.financing.enabled) {
    const principal = cx.total * (1 - f.financing.downPayment);
    const r = f.financing.annualRate / 12, n = f.financing.years * 12;
    loan = { principal, monthlyPayment: (principal * r) / (1 - (1 + r) ** -n), years: f.financing.years, rate: f.financing.annualRate };
  }
  return {
    scenario, capex: cx, savingYear1: saving1, savingMonthYear1: saving1 / 12,
    billBeforeYear: o.year1.before, billAfterYear: o.year1.before - saving1,
    billReduction: o.year1.before > 0 ? saving1 / o.year1.before : 0,
    cashflows: flows, cumulative, simplePayback: payback(flows), discountedPayback: payback(disc),
    npv: npv(f.discountRate, flows), irr: irr(flows), lcoe: pvEnergy > 0 ? pvCosts / pvEnergy : 0, savings25: savingsSum,
    roi: cumulative[cumulative.length - 1] / cx.total, generationByYear: gens, loan,
  };
}
