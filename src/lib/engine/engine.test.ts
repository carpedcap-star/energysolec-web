import { describe, it, expect } from 'vitest';
import { DEFAULT_PARAMS, CalcParams } from './params';
import { monthlyBill, kwhFromBill } from './tariff';
import { DEFAULT_TARIFFS } from './default-tariffs';
import { sizeSystem, systemLossFactor, DAYS_IN_MONTH } from './solar';
import { npv, irr, payback, capex } from './finance';
import { runStudy, StudyInput } from './study';
import { CACHE_TTL_DAYS, cellFor, checkSources, fromGhi, getSolarResource, parseNasaPower, parsePvgis, validMonthly, type SourceResult } from './resource';
import nsrdbGye from './fixtures/pvgis-nsrdb-guayaquil.json';
import era5Gye from './fixtures/pvgis-era5-guayaquil.json';
import nasaGye from './fixtures/nasa-power-guayaquil.json';

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
  // Respuestas reales (extracto) de Guayaquil, 25/11/2026: NSRDB 1431, ERA5 1114 y NASA ≈ 1242 kWh/kWp.
  const live = (url: string) => url.includes('v5_2') ? nsrdbGye : url.includes('v5_3') ? era5Gye : nasaGye;
  const ok = (async (url: string) => new Response(JSON.stringify(live(url)))) as unknown as typeof fetch;
  const fail = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  const NOW = Date.parse('2026-11-25T12:00:00Z');
  const memCache = () => {
    const m = new Map<string, SourceResult>();
    return { m, get: async (c: string, s: string) => m.get(`${c}#${s}`) ?? null, put: async (c: string, s: string, r: SourceResult) => { m.set(`${c}#${s}`, r); } };
  };

  it('interpreta las respuestas reales de PVGIS y NASA POWER', () => {
    const n = parsePvgis(nsrdbGye, 'PVGIS-NSRDB'), e = parsePvgis(era5Gye, 'PVGIS-ERA5'), a = parseNasaPower(nasaGye);
    expect(Math.round(n.monthlyYieldPreLoss.reduce((x, y) => x + y))).toBe(1431);
    expect(Math.round(e.monthlyYieldPreLoss.reduce((x, y) => x + y))).toBe(1114);
    expect(n.period).toBe('2005–2015');
    expect(e.period).toBe('2005–2023');
    expect(a.period).toBe('2001–2025');
    expect(Math.round(a.monthlyYieldPreLoss.reduce((x, y) => x + y))).toBe(1242);
  });
  it('adopta el valor menor entre las tres fuentes (ERA5 en Guayaquil)', async () => {
    const r = await getSolarResource(-2.19, -79.88, 10, 'costa', P, ok, undefined, NOW);
    expect(r.candidates.map((c) => c.annual).sort()).toEqual([1114, 1242, 1431]);
    expect(r.source).toMatch(/ERA5/);
    expect(Math.round(r.monthlyYieldPreLoss.reduce((x, y) => x + y))).toBe(1114);
  });
  it('rechaza valores de relleno (−999), meses faltantes y respuestas de otra base', () => {
    const bad = structuredClone(nasaGye); (bad.properties.parameter.ALLSKY_SFC_SW_DWN as Record<string, number>).MAR = -999;
    expect(() => parseNasaPower(bad)).toThrow(/fuera de rango/);
    const short = structuredClone(era5Gye); short.outputs.monthly.fixed.pop();
    expect(() => parsePvgis(short, 'PVGIS-ERA5')).toThrow(/sin datos/);
    expect(() => parsePvgis(era5Gye, 'PVGIS-NSRDB')).toThrow(/corresponde a PVGIS-ERA5/);
    expect(validMonthly(Array(12).fill(500))).toBe(false);
  });
  it('sin ninguna fuente cae al respaldo regional y el estudio lo advierte', async () => {
    const fb = await getSolarResource(-2.17, -79.92, 10, 'costa', P, fail, undefined, NOW);
    expect(fb.source).toMatch(/regional/);
    const input = StudyInput.parse({ mode: 'rapida', segment: 'residencial', objective: 'reducir_factura', province: 'Guayas', monthlyKwh: 300 });
    const st = runStudy(input, fb, com, P);
    expect(st.warnings.join(' ')).toMatch(/rendimiento regional conservador/);
    expect(st.resource.notes?.join(' ')).toMatch(/recalcularse/);
    const real = runStudy(input, await getSolarResource(-2.19, -79.88, 10, 'costa', P, ok, undefined, NOW), com, P);
    expect(real.warnings.join(' ')).not.toMatch(/rendimiento regional/);
    expect(real.resource.notes?.[0]).toMatch(/se adoptó el valor menor/);
  });
  it('celda de caché: 0,05° e inclinación entera', () => {
    expect(cellFor(-2.171, -79.9224, 10.4)).toEqual({ key: 'lat:-2.15|lng:-79.90|tilt:10', tilt: 10 });
    expect(cellFor(-2.19, -79.88, 60).tilt).toBe(45);
  });
  it('usa la caché vigente sin consultar y guarda lo consultado', async () => {
    const c = memCache();
    let calls = 0;
    const counting = (async (url: string) => { calls++; return new Response(JSON.stringify(live(url))); }) as unknown as typeof fetch;
    await getSolarResource(-2.19, -79.88, 10, 'costa', P, counting, c, NOW);
    expect(calls).toBe(3);
    expect(c.m.size).toBe(3);
    const again = await getSolarResource(-2.191, -79.881, 10, 'costa', P, counting, c, NOW + 86_400e3);
    expect(calls).toBe(3);
    expect(again.candidates.every((x) => x.origin === 'cache')).toBe(true);
    expect(again.source).toMatch(/ERA5/);
  });
  it('caché vencida: consulta de nuevo; si la fuente falla, usa el dato guardado con nota', async () => {
    const c = memCache();
    await getSolarResource(-2.19, -79.88, 10, 'costa', P, ok, c, NOW);
    const later = NOW + (CACHE_TTL_DAYS + 1) * 86_400e3;
    // ERA5 (la menor) no responde: sin el dato guardado, el mínimo subiría a NASA (menos conservador).
    const noEra5 = (async (url: string) => { if (url.includes('v5_3')) throw new Error('caída'); return new Response(JSON.stringify(live(url))); }) as unknown as typeof fetch;
    const r = await getSolarResource(-2.19, -79.88, 10, 'costa', P, noEra5, c, later);
    expect(r.source).toMatch(/ERA5/);
    expect(r.candidates.find((x) => /ERA5/.test(x.source))?.origin).toBe('stale');
    expect(r.notes.join(' ')).toMatch(/último dato guardado \(2026-11-25\)/);
  });
  it('reintenta una vez ante un error de red, no ante un error HTTP', async () => {
    let n = 0;
    const flaky = (async (url: string) => { n++; if (n === 1) throw new TypeError('fetch failed'); return new Response(JSON.stringify(live(url))); }) as unknown as typeof fetch;
    const r = await checkSources(flaky, [{ name: 'X', lat: -2.19, lng: -79.88 }]);
    expect(r.every((x) => x.ok)).toBe(true);
    let m = 0;
    const http500 = (async () => { m++; return new Response('{}', { status: 500 }); }) as unknown as typeof fetch;
    const r2 = await checkSources(http500, [{ name: 'X', lat: -2.19, lng: -79.88 }]);
    expect(r2.every((x) => !x.ok)).toBe(true);
    expect(m).toBe(3);
  });
  it('verificación en vivo: reporta cada fuente y punto, con error legible', async () => {
    const sea = (async (url: string) => url.includes('v5_2') ? new Response(JSON.stringify({ message: 'Location over the sea', status: 400 }), { status: 400 }) : new Response(JSON.stringify(live(url)))) as unknown as typeof fetch;
    const r = await checkSources(sea, [{ name: 'X', lat: -2.19, lng: -79.88 }]);
    expect(r).toHaveLength(3);
    expect(r.find((x) => x.source === 'PVGIS-NSRDB')).toMatchObject({ ok: false, error: 'PVGIS-NSRDB 400: Location over the sea' });
    expect(r.find((x) => x.source === 'PVGIS-ERA5')).toMatchObject({ ok: true, annual: 1114, period: '2005–2023' });
  });
});
