import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, CalcParams } from './params';
import { DAYS_IN_MONTH } from './solar';
import { runStudy, StudyInput } from './study';
import { effectiveCostTariff, selectTariff } from '../services/tariff-select';
import { mapTimeOfUse, segmentFrom, specialCategory, tariffKeyFromBill, voltageFrom } from '../services/bill';

const flat = (annual: number) => ({ source: 'test', notes: [], monthlyYieldPreLoss: DAYS_IN_MONTH.map((d) => (annual * d) / 365) });
/** Parámetros comerciales activos de Gerencia (no los del código). */
const GERENCIA: CalcParams = CalcParams.parse({
  ...DEFAULT_PARAMS, version: 9, isPlaceholder: false,
  technical: { ...DEFAULT_PARAMS.technical, moduleWp: 730 },
  pricing: {
    ...DEFAULT_PARAMS.pricing, engineeringShare: 0, batteryUsdPerKwh: 380,
    pvTiers: [{ upToKwp: 5, usdPerKwp: 950 }, { upToKwp: 20, usdPerKwp: 850 }, { upToKwp: 100, usdPerKwp: 690 }, { upToKwp: 500, usdPerKwp: 625 }, { upToKwp: 1e9, usdPerKwp: 580 }],
    hybridPvTiers: [{ upToKwp: 5, usdPerKwp: 950 }, { upToKwp: 20, usdPerKwp: 850 }, { upToKwp: 100, usdPerKwp: 690 }, { upToKwp: 500, usdPerKwp: 625 }, { upToKwp: 1e9, usdPerKwp: 580 }],
    offGridPvTiers: [{ upToKwp: 5, usdPerKwp: 950 }, { upToKwp: 20, usdPerKwp: 850 }, { upToKwp: 100, usdPerKwp: 690 }, { upToKwp: 500, usdPerKwp: 625 }, { upToKwp: 1e9, usdPerKwp: 580 }],
    batteryTiers: [{ upToKwh: 1e9, usdPerKwh: 380 }],
  },
});

// Caso real: CNEL EP, «MTCGCD12 - MT Bombeo de Agua con Demanda Horaria».
const CAT = 'MTCGCD12 - MT Bombeo de Agua con Demanda Horaria';
const BANDS = [
  { label: 'Punta media', hours: 'L-V 08:00-18:00', kwh: 29366.82 },
  { label: 'Punta', hours: 'L-V 18:00-22:00', kwh: 6334.2 },
  { label: 'Base', hours: '22:00-08:00', kwh: 6975.78 },
];
const realInput = (o: Record<string, unknown> = {}) => StudyInput.parse({
  mode: 'rapida', segment: 'comercial', objective: 'reducir_factura', province: 'Guayas', distributor: 'CNEL EP', monthlyKwh: 42676.8,
  demandKw: 162.04, powerFactor: 0.95, periodKwh: mapTimeOfUse(BANDS)!.kwh, billedMonthlyUsd: 3776.05, billedMonths: 1,
  specialTariff: CAT, serviceUsd: 3482.07, surfaces: [{ type: 'techo_metalico', areaM2: 1330 }], ...o,
});

describe('caso real: tarifa especial de bombeo con tres franjas', () => {
  it('las franjas se clasifican por su horario, no por el nombre («punta media» es 08-18)', () => {
    expect(mapTimeOfUse(BANDS)).toEqual({ scheme: 'DIFERENCIADA_4', kwh: { lv_08_18: 29366.82, lv_18_22: 6334.2, base: 6975.78 } });
  });
  it('bombeo de agua es una categoría especial: no se asimila a comercial MV horaria', () => {
    expect(specialCategory(CAT)).toBe(CAT);
    expect(tariffKeyFromBill(segmentFrom(CAT), CAT, voltageFrom(CAT), true, 'DIFERENCIADA_4')).toBeNull();
    expect(specialCategory('COMERCIAL CON DEMANDA BV')).toBeNull();
  });
  it('sin el error 500: franjas incompatibles con una tarifa del pliego se advierten y se usa el perfil tipo', () => {
    const t = selectTariff({ segment: 'comercial', province: 'Guayas', tariffKey: 'COM-MV-H', monthlyKwh: 42676.8, demandKw: 162.04, p: DEFAULT_PARAMS });
    const r = runStudy(realInput({ specialTariff: undefined, serviceUsd: undefined }), flat(1300), t, DEFAULT_PARAMS);
    expect(r.warnings.join(' ')).toMatch(/no coinciden con las de la tarifa/);
  });
  it('estudio preliminar con el costo efectivo y los parámetros de Gerencia', () => {
    const t = effectiveCostTariff({ category: CAT, kwh: 42676.8, serviceUsd: 3482.07, distributor: 'CNEL EP', province: 'Guayas', p: GERENCIA });
    expect(t.effective.usdPerKwh).toBeCloseTo(3482.07 / 42676.8, 4);
    const r = runStudy(realInput(), flat(1300), t, GERENCIA);
    expect(r.criticalWarnings!.join(' ')).toMatch(/PRELIMINAR con el costo efectivo/);
    expect(r.criticalWarnings!.join(' ')).toMatch(/no desglosa el cargo de energía/);
    const on = r.alternatives!.find((a) => a.key === 'onGrid')!;
    const s = on.summary!;
    // 1.330 m² de cubierta metálica a 6 m²/kWp = 221,7 kWp → 303 paneles de 730 Wp; el consumo diurno pide más.
    expect(on.modules).toBeLessThanOrEqual(Math.floor(1330 / 6 / 0.73));
    expect(on.areaM2).toBeLessThanOrEqual(1330);
    // Precio por kWp del tramo de la potencia TOTAL (≤500 kWp: $625) + IVA 15 %, sin ingeniería ni recargos.
    expect(s.investmentUsd).toBeCloseTo(on.kwp * 625 * 1.15, 0);
    expect(s.currentMonthlyUsd).toBe(3776.05);
    expect(s.residualMonthlyUsd).toBeGreaterThan(3776.05 - 3482.07); // las tasas de terceros siguen
    expect(s.paybackYears).toBeCloseTo(s.investmentUsd / (s.savingMonthlyUsd * 12), 1);
    expect(on.inverterKw).toBeLessThanOrEqual(Math.ceil(on.kwp / GERENCIA.technical.dcAcRatio / 10) * 10);
  });
});

describe('superficies combinadas', () => {
  const study = (surfaces: { type: 'techo_metalico' | 'losa' | 'terreno'; areaM2: number | null }[], p = GERENCIA) =>
    runStudy(StudyInput.parse({ mode: 'rapida', segment: 'comercial', objective: 'reducir_factura', province: 'Guayas', monthlyKwh: 30000, surfaces }), flat(1300), selectTariff({ segment: 'comercial', province: 'Guayas', monthlyKwh: 30000, p }), p);
  const modKw = 0.73;
  it('solo techo: limitado por su área y con todos los paneles en el techo', () => {
    const r = study([{ type: 'techo_metalico', areaM2: 300 }]);
    const ps = r.surfaces!.perSurface;
    expect(ps[0].modules).toBe(Math.floor(300 / 6 / modKw));
    expect(r.sizing.modules).toBe(ps[0].modules);
  });
  it('solo terreno: usa el factor de ocupación del terreno', () => {
    const ps = study([{ type: 'terreno', areaM2: 600 }]).surfaces!.perSurface;
    expect(ps[0].modules).toBe(Math.floor(600 / 12 / modKw));
  });
  it('techo y terreno: primero el techo aunque el cliente marque el terreno antes', () => {
    const r = study([{ type: 'terreno', areaM2: 2000 }, { type: 'techo_metalico', areaM2: 300 }]);
    const ps = r.surfaces!.perSurface;
    expect(ps.map((x) => x.type)).toEqual(['techo_metalico', 'terreno']);
    expect(ps[0].modules).toBe(Math.floor(300 / 6 / modKw));       // techo lleno
    expect(ps[0].modules! + ps[1].modules!).toBe(r.sizing.modules);   // el resto en el terreno
    // El precio es el del tramo de la potencia TOTAL, no por superficie.
    const on = r.alternatives!.find((a) => a.key === 'onGrid')!;
    const tier = GERENCIA.pricing.pvTiers.find((t) => on.kwp <= t.upToKwp)!;
    expect(on.summary!.investmentUsd).toBeCloseTo(on.kwp * tier.usdPerKwp * 1.15, 0);
  });
  it('las tres superficies: techo y losa antes que el terreno; sin superar ninguna', () => {
    const r = study([{ type: 'terreno', areaM2: 5000 }, { type: 'losa', areaM2: 240 }, { type: 'techo_metalico', areaM2: 180 }]);
    const ps = r.surfaces!.perSurface;
    expect(ps.at(-1)!.type).toBe('terreno');
    for (const x of ps) if (x.areaM2 != null) expect(x.usedAreaM2!).toBeLessThanOrEqual(x.areaM2);
    expect(ps.reduce((a, x) => a + x.modules!, 0)).toBe(r.sizing.modules);
  });
  it('con área desconocida se puede calcular igual', () => {
    const r = study([{ type: 'techo_metalico', areaM2: null }]);
    expect(r.sizing.modules).toBeGreaterThan(0);
  });
  it('Gerencia puede desactivar la prioridad: se respeta el orden del cliente', () => {
    const p = CalcParams.parse({ ...GERENCIA, technical: { ...GERENCIA.technical, groundLast: false } });
    const ps = study([{ type: 'terreno', areaM2: 2000 }, { type: 'techo_metalico', areaM2: 300 }], p).surfaces!.perSurface;
    expect(ps[0].type).toBe('terreno');
  });
});

describe('parámetros activos de Gerencia', () => {
  it('prevalecen sobre los del código: precio por kWp, panel de 730 Wp, baterías e ingeniería 0 %', () => {
    const r = runStudy(StudyInput.parse({ mode: 'rapida', segment: 'residencial', objective: 'respaldo', province: 'Pichincha', monthlyKwh: 400, backup: 'esencial' }), flat(1300), selectTariff({ segment: 'residencial', province: 'Pichincha', p: GERENCIA }), GERENCIA);
    const on = r.alternatives!.find((a) => a.key === 'onGrid')!;
    expect(on.kwp).toBeCloseTo(on.modules * 0.73, 2);
    const tier = GERENCIA.pricing.pvTiers.find((t) => on.kwp <= t.upToKwp)!;
    expect(on.scenarios.base.capex.engineering).toBe(0);
    expect(on.scenarios.base.capex.total).toBeCloseTo(Math.max(GERENCIA.pricing.minimumProjectUsd, on.kwp * tier.usdPerKwp) * 1.15, 2);
    const hy = r.alternatives!.find((a) => a.key === 'hybrid')!;
    expect(hy.scenarios.base.capex.storage).toBeCloseTo(hy.battery!.nominalKwh * 380, 6);
  });
});
