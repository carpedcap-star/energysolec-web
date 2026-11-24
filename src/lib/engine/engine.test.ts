import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, CalcParams } from './params';
import { monthlyBill, kwhFromBill } from './tariff';
import { DEFAULT_TARIFFS } from './default-tariffs';
import { sizeSystem, systemLossFactor, DAYS_IN_MONTH } from './solar';
import { npv, irr, payback, capex } from './finance';
import { runStudy, StudyInput } from './study';
import { fromGhi, getSolarResource } from './resource';

const P = DEFAULT_PARAMS;
const flatResource = (annual: number) => ({
  source: 'test', notes: [],
  monthlyYieldPreLoss: DAYS_IN_MONTH.map((d) => (annual * d) / 365),
  monthlyPoaKwhM2: DAYS_IN_MONTH.map((d) => (annual * 1.08 * d) / 365),
});
const res = DEFAULT_TARIFFS[0], com = DEFAULT_TARIFFS[1], ind = DEFAULT_TARIFFS[3];

describe('parámetros', () => {
  it('los valores por defecto cumplen el esquema', () => {
    expect(() => CalcParams.parse(P)).not.toThrow();
  });
});

describe('tarifa', () => {
  it('aplica bloques crecientes', () => {
    const b = monthlyBill(res, 200);
    expect(b.energy).toBeCloseTo(130 * 0.04 + 70 * 0.092, 6);
  });
  it('inversión factura → kWh es consistente', () => {
    const kwh = 734;
    const bill = monthlyBill(com, kwh).total;
    expect(kwhFromBill(com, bill)).toBeCloseTo(kwh, 1);
  });
  it('cargo por demanda solo cuando aplica', () => {
    expect(monthlyBill(com, 1000, 50).demand).toBe(0);
    expect(monthlyBill(ind, 1000, 50).demand).toBeCloseTo(50 * 4.79, 6);
  });
});

describe('motor energético', () => {
  it('pérdidas de sistema compuestas una sola vez', () => {
    const { factor } = systemLossFactor(P, 'none');
    const expected = (1 - 0.03) * (1 - 0.025) * 0.975 * (1 - 0.01) * 0.99;
    expect(factor).toBeCloseTo(expected, 10);
  });
  it('generación = rendimiento neto × potencia (sin doble conteo)', () => {
    const s = sizeSystem({ segment: 'comercial', objective: 'reducir_factura', monthlyKwh: [10000], shading: 'none', surface: 'cubierta', wantsBattery: false }, flatResource(1300), P, false);
    const { factor } = systemLossFactor(P, 'none');
    const specific = 1300 * factor * (1 - P.technical.firstYearDegradation);
    expect(s.annualGeneration).toBeCloseTo(s.kwp * specific, -1);
    expect(s.specificYieldYear1).toBe(Math.round(specific));
  });
  it('sin compensación dimensiona al consumo diurno y no produce excedentes grandes', () => {
    const s = sizeSystem({ segment: 'comercial', objective: 'reducir_factura', monthlyKwh: [10000], daytimeShare: 0.6, shading: 'none', surface: 'cubierta', wantsBattery: false }, flatResource(1300), P, false);
    expect(s.annualGeneration).toBeGreaterThan(120000 * 0.6 * 0.95);
    expect(s.annualGeneration).toBeLessThan(120000 * 0.6 * 1.05);
    expect(s.selfConsumptionRatio).toBeGreaterThan(0.9);
    expect(s.coverage).toBeLessThanOrEqual(0.61);
  });
  it('respeta el límite de superficie', () => {
    const s = sizeSystem({ segment: 'industrial', objective: 'reducir_factura', monthlyKwh: [200000], shading: 'none', surface: 'cubierta', availableAreaM2: 600, wantsBattery: false }, flatResource(1300), P, false);
    expect(s.limitedByArea).toBe(true);
    expect(s.areaM2).toBeLessThanOrEqual(600 + P.technical.roofM2PerKwp * P.technical.moduleWp / 1000);
  });
  it('sombras reducen el rendimiento y exigen más potencia para la misma energía', () => {
    const base = { segment: 'residencial' as const, objective: 'reducir_factura' as const, monthlyKwh: [400], surface: 'cubierta' as const, wantsBattery: false };
    const a = sizeSystem({ ...base, shading: 'none' }, flatResource(1300), P, false);
    const b = sizeSystem({ ...base, shading: 'significant' }, flatResource(1300), P, false);
    expect(b.specificYieldYear1).toBeLessThan(a.specificYieldYear1);
    expect(b.kwp).toBeGreaterThanOrEqual(a.kwp);
  });
  it('conversión GHI → rendimiento aplica temperatura', () => {
    const r = fromGhi(Array(12).fill(4.5), Array(12).fill(26), 'x');
    const annual = r.monthlyYieldPreLoss.reduce((a, b) => a + b, 0);
    expect(annual).toBeCloseTo(4.5 * 365 * (1 - 0.0035 * 26) * 0.98, 3);
  });
});

describe('motor financiero', () => {
  it('VAN y TIR coherentes', () => {
    const flows = [-1000, 300, 300, 300, 300, 300];
    const r = irr(flows)!;
    expect(npv(r, flows)).toBeCloseTo(0, 3);
    expect(r).toBeCloseTo(0.1524, 3);
  });
  it('retorno simple fraccional', () => {
    expect(payback([-1000, 400, 400, 400])).toBeCloseTo(2.5, 6);
    expect(payback([-1000, 100, 100])).toBeNull();
  });
  it('economías de escala: menor USD/kWp a mayor tamaño', () => {
    expect(capex(P, 500, 0).usdPerKwp).toBeLessThan(capex(P, 5, 0).usdPerKwp);
  });
});

describe('estudio completo', () => {
  const input = StudyInput.parse({ mode: 'rapida', segment: 'comercial', objective: 'reducir_factura', province: 'Guayas', monthlyBillUsd: 1200 });
  const r = runStudy(input, flatResource(1300), com, P);
  it('la factura nunca desaparece por completo', () => {
    expect(r.scenarios.base.billAfterYear).toBeGreaterThan(0);
    expect(r.scenarios.base.billReduction).toBeLessThan(1);
  });
  it('excedentes sin valor económico por defecto', () => {
    expect(P.financial.exportCompensation).toBe('none');
  });
  it('escenarios ordenados conservador ≤ base ≤ optimista', () => {
    expect(r.scenarios.conservador.npv).toBeLessThanOrEqual(r.scenarios.base.npv);
    expect(r.scenarios.base.npv).toBeLessThanOrEqual(r.scenarios.optimista.npv);
  });
  it('advierte que tarifas y precios son provisionales', () => {
    expect(r.warnings.join(' ')).toMatch(/PROVISIONAL/);
    expect(r.consumption.estimatedFromBill).toBe(true);
  });
  it('LCOE plausible', () => {
    expect(r.scenarios.base.lcoe).toBeGreaterThan(0.02);
    expect(r.scenarios.base.lcoe).toBeLessThan(0.2);
  });
  it('rechaza entradas sin consumo ni factura', () => {
    expect(StudyInput.safeParse({ mode: 'rapida', segment: 'residencial', objective: 'reducir_factura', province: 'Azuay' }).success).toBe(false);
  });
});

describe('recurso solar', () => {
  it('usa el valor menor entre fuentes y cae a respaldo regional si fallan', async () => {
    const pvgis = { outputs: { monthly: { fixed: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, E_m: 120, 'H(i)_m': 140 })) } } };
    const nasa = { properties: { parameter: {
      ALLSKY_SFC_SW_DWN: Object.fromEntries(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((k) => [k, 4])),
      T2M: Object.fromEntries(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].map((k) => [k, 26])) } } };
    const ok = (async (url: string) => new Response(JSON.stringify(url.includes('jrc') ? pvgis : nasa))) as unknown as typeof fetch;
    const r = await getSolarResource(-2.17, -79.92, 10, 'costa', P, ok);
    expect(r.candidates.length).toBe(3);
    expect(r.source).toMatch(/NASA/); // 4 kWh/m²/día < 120 kWh/mes → NASA es menor
    const fail = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const fb = await getSolarResource(-2.17, -79.92, 10, 'costa', P, fail);
    expect(fb.source).toMatch(/regional/);
  });
});
