import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, type CalcParams } from './params';
import { computeAlternatives, type AlternativesInput } from './alternatives';
import { loadShape, nightShare, pvShape, simulateMonth } from './energy';
import { capex } from './finance';
import { tariffByCode, distributorByCode } from '@/content/tarifas/pliego-2026';

const P = DEFAULT_PARAMS;
// Rendimiento neto típico de la Sierra (~1300 kWh/kWp·año), con un mes más bajo.
const YIELD = [104, 98, 110, 106, 108, 104, 112, 114, 112, 110, 106, 96];
const res = tariffByCode('EEQ-RES')!;
const eeq = distributorByCode('EEQ')!;
const base = (o: Partial<AlternativesInput> = {}): AlternativesInput => ({
  segment: 'residencial', monthlyKwh: Array(12).fill(400), yieldPerKwp: YIELD,
  tariff: { structure: res.structure, options: { crossSubsidy: { distributor: 'EEQ', receivesUpToKwh: eeq.receivesUpToKwh, contributesAboveKwh: eeq.contributesAboveKwh, contributionShare: eeq.contributionShare, status: 'provisional', sourceNote: 'Anexo 2' } } },
  surfaces: [{ type: 'techo_inclinado', areaM2: 60 }], backup: 'ninguno', objective: 'reducir_factura', p: P, year: 2027, ...o,
});
const withComp = (c: CalcParams['financial']['exportCompensation']): CalcParams => ({ ...P, financial: { ...P.financial, exportCompensation: c } });

describe('simulación horaria', () => {
  it('perfiles normalizados y balance de energía', () => {
    expect(loadShape('noche').reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(pvShape().reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(nightShare(loadShape('noche'))).toBeGreaterThan(nightShare(loadShape('mediodia')));
    const f = simulateMonth({ year: 2027, month: 3, loadKwh: 400, pvKwh: 300, shape: loadShape('noche'), weekendFactor: 1, scheme: 'UNICO' });
    expect(f.loadKwh).toBeCloseTo(400, 6);
    expect(f.selfKwh + f.importKwh).toBeCloseTo(400, 6);
    expect(f.selfKwh + f.exportKwh).toBeCloseTo(300, 6);
  });
  it('la batería desplaza excedente a la noche y respeta la eficiencia', () => {
    const shape = loadShape('noche');
    const sin = simulateMonth({ year: 2027, month: 3, loadKwh: 400, pvKwh: 400, shape, weekendFactor: 1, scheme: 'UNICO' });
    const con = simulateMonth({ year: 2027, month: 3, loadKwh: 400, pvKwh: 400, shape, weekendFactor: 1, scheme: 'UNICO', battery: { cyclingKwh: 10, powerKw: 5, roundTrip: 0.9 } });
    expect(con.importKwh).toBeLessThan(sin.importKwh);
    // La energía que entrega la batería es como máximo el 90 % de lo que dejó de exportarse.
    expect(con.batteryToLoadKwh).toBeLessThanOrEqual((sin.exportKwh - con.exportKwh) * 0.9 + 1e-6);
  });
  it('reparte por franjas en tarifas horarias', () => {
    const f = simulateMonth({ year: 2027, month: 3, loadKwh: 1000, pvKwh: 0, shape: loadShape('continuo'), weekendFactor: 1, scheme: 'DIFERENCIADA_4' });
    expect(Object.values(f.loadByPeriod).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1000, 6);
    expect(f.loadByPeriod.sdf_18_22).toBeGreaterThan(0);
  });
});

describe('alternativas', () => {
  it('superficie suficiente: potencia ideal, máxima y cobertura', () => {
    const r = computeAlternatives(base());
    expect(r.surfaces.maxKwp).toBeCloseTo(60 / 6, 6);
    expect(r.surfaces.idealKwp).toBeGreaterThan(0);
    const on = r.alternatives.find((a) => a.key === 'onGrid')!;
    expect(on.kwp).toBeLessThanOrEqual(r.surfaces.maxKwp! + 1e-9);
    expect(on.modules * P.technical.moduleWp / 1000).toBeCloseTo(on.kwp, 1);
    expect(on.billAfterYear).toBeGreaterThan(0); // nunca factura cero
    expect(on.residualCharges).toContain('comercialización');
    expect(on.warnings.join(' ')).toMatch(/no da respaldo/);
  });
  it('superficie insuficiente: potencia limitada, faltante y cobertura alcanzable', () => {
    const r = computeAlternatives(base({ monthlyKwh: Array(12).fill(1500), surfaces: [{ type: 'techo_inclinado', areaM2: 12 }] }));
    expect(r.surfaces.additionalKwp).toBeGreaterThan(0);
    expect(r.surfaces.additionalAreaM2).toBeGreaterThan(0);
    expect(r.surfaces.coverageReachable).not.toBeNull();
    expect(r.alternatives[0].kwp).toBeLessThanOrEqual(2 + 1e-9);
  });
  it('área desconocida: potencia ideal y área requerida, con aviso', () => {
    const r = computeAlternatives(base({ surfaces: [{ type: 'losa', areaM2: null }] }));
    expect(r.surfaces.maxKwp).toBeNull();
    expect(r.surfaces.requiredAreaM2).toBeCloseTo(r.surfaces.idealKwp * 12, -1);
    expect(r.alternatives[0].warnings.join(' ')).toMatch(/No conocemos el área/);
  });
  it('superficies mixtas: el costo usa el sobreprecio de cada estructura', () => {
    const p: CalcParams = { ...P, pricing: { ...P.pricing, mountingUsdPerKwp: { cubierta_metalica: 0, techo_inclinado: 0, losa: 100, hincado: 200, cimentado: 300 } } };
    const r = computeAlternatives(base({ p, monthlyKwh: Array(12).fill(3000), surfaces: [{ type: 'losa', areaM2: 60 }, { type: 'terreno', areaM2: 600 }] }));
    const on = r.alternatives[0];
    expect(on.scenarios.base.capex.mounting).toBeGreaterThan(100 * 5); // 5 kWp en losa + el resto en terreno
  });
  it('sin compensación los excedentes valen $0; con balance neto (005/24) se acreditan', () => {
    const sin = computeAlternatives(base({ p: withComp('none') })).alternatives[0];
    const con = computeAlternatives(base({ p: withComp('net_balance') })).alternatives[0];
    expect(con.kwp).toBeGreaterThan(sin.kwp);
    expect(con.coverage).toBeGreaterThan(sin.coverage);
  });
  it('híbrido: respaldo por horas, beneficio de baterías separado, sin reducir demanda', () => {
    const ind = tariffByCode('SIERRA_SUR-IND-MV-HD')!;
    const r = computeAlternatives(base({ segment: 'industrial', monthlyKwh: Array(12).fill(30000), demandKw: 120, backup: 'esencial', backupHours: 4, surfaces: [{ type: 'techo_metalico', areaM2: 2000 }], tariff: { structure: ind.structure } }));
    const hy = r.alternatives.find((a) => a.key === 'hybrid')!;
    expect(hy.battery!.backupHours).toBe(4);
    expect(hy.battery!.nominalKwh % 5).toBe(0);
    expect(typeof hy.batteryEconomicBenefitYear1).toBe('number');
    expect(hy.warnings.join(' ')).toMatch(/demanda/);
    expect(r.recommended).toBe('hybrid');
    // Industrial: Off Grid no aplica sin estudio específico.
    expect(r.alternatives.find((a) => a.key === 'offGrid')!.applicable).toBe(false);
  });
  it('Off Grid: mes crítico y confiabilidad simulada; superficie insuficiente lo limita', () => {
    const ok = computeAlternatives(base({ monthlyKwh: Array(12).fill(150), surfaces: [{ type: 'terreno', areaM2: null }] })).alternatives.find((a) => a.key === 'offGrid')!;
    expect(ok.reliability).toBeGreaterThanOrEqual(P.technical.offGridReliability);
    expect(ok.billAfterYear).toBe(0);
    expect(ok.warnings.join(' ')).toMatch(/no garantiza independencia/);
    const small = computeAlternatives(base({ monthlyKwh: Array(12).fill(600), surfaces: [{ type: 'techo_inclinado', areaM2: 10 }] })).alternatives.find((a) => a.key === 'offGrid')!;
    expect(small.warnings.join(' ')).toMatch(/no permite la potencia necesaria/);
  });
  it('etiquetas por objetivo y recomendación', () => {
    const r = computeAlternatives(base());
    const labels = r.alternatives.flatMap((a) => a.labels);
    expect(labels).toEqual(expect.arrayContaining(['Menor inversión', 'Mayor ahorro', 'Mejor retorno', 'Mayor autonomía']));
    expect(r.recommended).not.toBe('offGrid');
  });
});

describe('inversión diferenciada', () => {
  it('precio por tipo de sistema, estructura y tramo de baterías; sin opciones se mantiene el cálculo anterior', () => {
    const old = capex(P, 10, 0);
    expect(old.pv).toBe(10 * 980);
    const p: CalcParams = { ...P, pricing: { ...P.pricing, hybridPvTiers: [{ upToKwp: 1e9, usdPerKwp: 1500 }], batteryTiers: [{ upToKwh: 20, usdPerKwh: 600 }, { upToKwh: 1e9, usdPerKwh: 450 }], mountingUsdPerKwp: { ...P.pricing.mountingUsdPerKwp, cimentado: 150 } } };
    const c = capex(p, 10, 30, 1, { system: 'hybrid', mountingKwp: { cimentado: 10 } });
    expect(c.pv).toBe(15000);
    expect(c.mounting).toBe(1500);
    expect(c.storage).toBe(30 * 450);
  });
});
