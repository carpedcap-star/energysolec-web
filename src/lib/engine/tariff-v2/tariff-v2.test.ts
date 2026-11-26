import { describe, expect, it } from 'vitest';
import { billableDemand, computeBill, fgd, fgdi, fgdve, incrementalCost, maxEnergyCharge, powerFactorPenaltyFactor } from './bill';
import { dayTypeOf, periodOf, splitMonthByPeriod } from './periods';
import { simulateNetMetering, type NetMonth } from './net-metering';
import type { TariffStructure } from './types';

// Valores del Pliego 2026 codificado, Anexo 1, grupo Ambato–Azogues–CNEL Bolívar–CentroSur–Cotopaxi–Norte–Riobamba–Sur.
const RES: TariffStructure = {
  scheme: 'UNICO', commercialization: { usdPerMonth: 1.414 },
  energy: [{ period: 'unico', blocks: [
    { fromKwh: 0, toKwh: 50, usdPerKwh: 0.091 }, { fromKwh: 50, toKwh: 100, usdPerKwh: 0.093 }, { fromKwh: 100, toKwh: 150, usdPerKwh: 0.095 },
    { fromKwh: 150, toKwh: 200, usdPerKwh: 0.097 }, { fromKwh: 200, toKwh: 250, usdPerKwh: 0.099 }, { fromKwh: 250, toKwh: 300, usdPerKwh: 0.101 },
    { fromKwh: 300, toKwh: 350, usdPerKwh: 0.103 }, { fromKwh: 350, toKwh: 500, usdPerKwh: 0.105 }, { fromKwh: 500, toKwh: 700, usdPerKwh: 0.1285 },
    { fromKwh: 700, toKwh: 1000, usdPerKwh: 0.145 }, { fromKwh: 1000, toKwh: 1500, usdPerKwh: 0.1709 }, { fromKwh: 1500, toKwh: 2500, usdPerKwh: 0.2752 },
    { fromKwh: 2500, toKwh: 3500, usdPerKwh: 0.436 }, { fromKwh: 3500, toKwh: null, usdPerKwh: 0.6812 },
  ] }],
};
// Residencial de la Costa: bloques 501–700 y 701–1000 distintos de diciembre a mayo.
const RES_COSTA: TariffStructure = {
  ...RES,
  energy: [
    { period: 'unico', months: [6, 7, 8, 9, 10, 11], blocks: RES.energy[0].blocks },
    { period: 'unico', months: [12, 1, 2, 3, 4, 5], blocks: RES.energy[0].blocks.map((b) => (b.fromKwh === 500 ? { ...b, usdPerKwh: 0.105 } : b.fromKwh === 700 ? { ...b, usdPerKwh: 0.1109 } : b)) },
  ],
};
const IND_MV: TariffStructure = {
  scheme: 'DIFERENCIADA_4', commercialization: { usdPerMonth: 1.414 },
  energy: [
    { period: 'lv_08_18', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: 0.1178 }] },
    { period: 'lv_18_22', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: 0.1318 }] },
    { period: 'base', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: 0.1001 }] },
    { period: 'sdf_18_22', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: 0.1178 }] },
  ],
  demand: { usdPerKwMonth: 4.576, factor: 'FGDI', minShareOfMax12: 0.6 },
  powerFactor: { threshold: 0.94 },
};
const COM_BT_D: TariffStructure = {
  scheme: 'UNICO', commercialization: { usdPerMonth: 1.414 },
  energy: [{ period: 'unico', blocks: [{ fromKwh: 0, toKwh: null, usdPerKwh: 0.09 }] }],
  demand: { usdPerKwMonth: 4.79, factor: 'ninguno', minShareOfMax12: 0.6 },
  powerFactor: { threshold: 0.94 },
};

describe('bloques incrementales (pliego 4.3.1)', () => {
  it('cada kWh paga el precio de su bloque; fronteras 50/51 y 500/501', () => {
    expect(incrementalCost(RES.energy[0].blocks, 50).cost).toBeCloseTo(50 * 0.091, 10);
    expect(incrementalCost(RES.energy[0].blocks, 51).cost).toBeCloseTo(50 * 0.091 + 0.093, 10);
    const to500 = 50 * (0.091 + 0.093 + 0.095 + 0.097 + 0.099 + 0.101 + 0.103) + 150 * 0.105;
    expect(incrementalCost(RES.energy[0].blocks, 500).cost).toBeCloseTo(to500, 10);
    expect(incrementalCost(RES.energy[0].blocks, 501).cost).toBeCloseTo(to500 + 0.1285, 10);
    expect(incrementalCost(RES.energy[0].blocks, 0).cost).toBe(0);
  });
  it('factura residencial de 200 kWh: energía + comercialización', () => {
    const b = computeBill(RES, { month: 3, kwhByPeriod: { unico: 200 } });
    expect(b.spee).toBeCloseTo(50 * (0.091 + 0.093 + 0.095 + 0.097) + 1.414, 2);
    expect(b.lines.find((l) => l.code === 'comercializacion')?.reducibleByPv).toBe('no');
  });
  it('la factura nunca baja del cargo de comercialización', () => {
    expect(computeBill(RES, { month: 1, kwhByPeriod: { unico: 0 } }).spee).toBe(1.41);
  });
  it('tarifa estacional de la Costa: 600 kWh en enero cuesta menos que en julio', () => {
    const jan = computeBill(RES_COSTA, { month: 1, kwhByPeriod: { unico: 600 } }).spee;
    const jul = computeBill(RES_COSTA, { month: 7, kwhByPeriod: { unico: 600 } }).spee;
    expect(jul - jan).toBeCloseTo(100 * (0.1285 - 0.105), 2);
  });
});

describe('franjas horarias (pliego 3 y 4.4.3)', () => {
  it('fronteras 08:00, 18:00 y 22:00 en laborable', () => {
    expect(periodOf('DIFERENCIADA_4', 'laborable', 7)).toBe('base');
    expect(periodOf('DIFERENCIADA_4', 'laborable', 8)).toBe('lv_08_18');
    expect(periodOf('DIFERENCIADA_4', 'laborable', 17)).toBe('lv_08_18');
    expect(periodOf('DIFERENCIADA_4', 'laborable', 18)).toBe('lv_18_22');
    expect(periodOf('DIFERENCIADA_4', 'laborable', 21)).toBe('lv_18_22');
    expect(periodOf('DIFERENCIADA_4', 'laborable', 22)).toBe('base');
  });
  it('sábados, domingos y feriados: 18–22 propio y el resto base', () => {
    for (const d of ['sabado', 'domingo', 'feriado'] as const) {
      expect(periodOf('DIFERENCIADA_4', d, 10)).toBe('base');
      expect(periodOf('DIFERENCIADA_4', d, 19)).toBe('sdf_18_22');
    }
  });
  it('horaria de dos franjas y vehículos eléctricos', () => {
    expect(periodOf('HORARIA_2', 'domingo', 8)).toBe('h08_22');
    expect(periodOf('HORARIA_2', 'laborable', 22)).toBe('h22_08');
    expect(periodOf('VE_3', 'domingo', 19)).toBe('ld_18_22');
    expect(periodOf('VE_3', 'sabado', 10)).toBe('base');
    expect(periodOf('VE_3', 'laborable', 10)).toBe('lv_08_18');
  });
  it('tipo de día y reparto de un mes completo', () => {
    const hol = new Set(['2026-12-25']);
    expect(dayTypeOf('2026-12-25', hol)).toBe('feriado');
    expect(dayTypeOf('2026-11-28', hol)).toBe('sabado');
    expect(dayTypeOf('2026-11-29', hol)).toBe('domingo');
    expect(dayTypeOf('2026-11-30', hol)).toBe('laborable');
    // 1 kWh por hora en diciembre de 2026: 31 días · 24 h = 744 kWh repartidos sin perder nada.
    const split = splitMonthByPeriod('DIFERENCIADA_4', 2026, 12, hol, () => 1);
    expect(Object.values(split).reduce((a, b) => a + (b ?? 0), 0)).toBe(744);
    // 22 laborables (dic-2026 tiene 23 días L-V, uno es feriado) × 4 h en 18–22
    expect(split.lv_18_22).toBe(22 * 4);
    expect(split.sdf_18_22).toBe(9 * 4);
  });
});

describe('demanda (pliego 4.6.4 y 4.6.5)', () => {
  it('mínimo del 60 % de la máxima de 12 meses', () => {
    expect(billableDemand(50, 100, 0.6)).toBe(60);
    expect(billableDemand(70, 100, 0.6)).toBe(70);
    expect(billableDemand(50, 100, null)).toBe(50);
  });
  it('FGD: 0,6 por debajo de 0,6 y DP/DM hasta 1', () => {
    expect(fgd(0.59)).toBe(0.6);
    expect(fgd(0.6)).toBe(0.6);
    expect(fgd(0.8)).toBe(0.8);
    expect(fgd(1)).toBe(1);
  });
  it('FGDI: 0,50 · curva 0,5833r + 0,4167r² · 1,00', () => {
    expect(fgdi(0.59)).toBe(0.5);
    expect(fgdi(0.6)).toBeCloseTo(0.5, 3);
    expect(fgdi(0.9)).toBeCloseTo(0.5833 * 0.9 + 0.4167 * 0.81, 10);
    expect(fgdi(0.91)).toBe(1);
  });
  it('FGDVE', () => { expect(fgdve(false)).toBe(0.6); expect(fgdve(true)).toBe(1); });
  it('industrial MV con demanda horaria diferenciada', () => {
    const b = computeBill(IND_MV, {
      month: 10, kwhByPeriod: { lv_08_18: 20000, lv_18_22: 5000, base: 12000, sdf_18_22: 1000 },
      demandKw: 200, peakDemandKw: 140, dmMax12Kw: 220,
    });
    const E = 20000 * 0.1178 + 5000 * 0.1318 + 12000 * 0.1001 + 1000 * 0.1178;
    const r = 140 / 200;
    const P = 200 * 4.576 * (0.5833 * r + 0.4167 * r * r);
    expect(b.spee).toBeCloseTo(E + P + 1.414, 1);
    expect(b.billableDemandKw).toBe(200);
  });
  it('sin demanda en punta, el factor se toma 1,0 y se advierte', () => {
    const b = computeBill(IND_MV, { month: 10, kwhByPeriod: { lv_08_18: 1, lv_18_22: 1, base: 1, sdf_18_22: 1 }, demandKw: 100 });
    expect(b.lines.find((l) => l.code === 'demanda')!.amount).toBeCloseTo(457.6, 2);
    expect(b.warnings.join(' ')).toMatch(/FGDI/);
  });
  it('falta una franja: se advierte', () => {
    const b = computeBill(IND_MV, { month: 10, kwhByPeriod: { lv_08_18: 100 }, demandKw: 10, peakDemandKw: 10 });
    expect(b.warnings.join(' ')).toMatch(/Faltan kWh/);
  });
  it('rechaza franjas que no son de la tarifa', () => {
    expect(() => computeBill(RES, { month: 1, kwhByPeriod: { base: 10 } })).toThrow(/franjas no válidas/);
  });
});

describe('factor de potencia y pérdidas (pliego 4.6.6 y 4.4)', () => {
  it('sin penalización desde 0,94; BFp = 0,94/FP − 1 por debajo', () => {
    expect(powerFactorPenaltyFactor(0.94)).toBe(0);
    expect(powerFactorPenaltyFactor(0.9)).toBeCloseTo(0.94 / 0.9 - 1, 12);
  });
  it('PBFP sobre la factura inicial y aviso bajo 0,60', () => {
    const base = computeBill(COM_BT_D, { month: 1, kwhByPeriod: { unico: 1000 }, demandKw: 20, dmMax12Kw: 20 });
    const pen = computeBill(COM_BT_D, { month: 1, kwhByPeriod: { unico: 1000 }, demandKw: 20, dmMax12Kw: 20, powerFactor: 0.85 });
    expect(pen.spee).toBeCloseTo(base.spee * (0.94 / 0.85), 1);
    expect(computeBill(COM_BT_D, { month: 1, kwhByPeriod: { unico: 10 }, demandKw: 1, powerFactor: 0.5 }).warnings.join(' ')).toMatch(/0,60/);
  });
  it('2 % de pérdidas en transformador sobre energía y potencia', () => {
    const a = computeBill(COM_BT_D, { month: 1, kwhByPeriod: { unico: 1000 }, demandKw: 20 });
    const b = computeBill(COM_BT_D, { month: 1, kwhByPeriod: { unico: 1000 }, demandKw: 20, measuredInLowVoltage: true });
    expect(b.spee - a.spee).toBeCloseTo(0.02 * (90 + 95.8), 2);
  });
});

describe('subsidio cruzado y terceros', () => {
  const cs = { distributor: 'EEQ', receivesUpToKwh: 130, contributesAboveKwh: 160, contributionShare: 0.1, status: 'provisional' as const, sourceNote: 'Anexo 2' };
  it('aporta solo sobre el umbral, y se marca provisional', () => {
    expect(computeBill(RES, { month: 1, kwhByPeriod: { unico: 160 } }, { crossSubsidy: cs }).lines.some((l) => l.code === 'subsidio_cruzado')).toBe(false);
    const b = computeBill(RES, { month: 1, kwhByPeriod: { unico: 161 } }, { crossSubsidy: cs });
    const l = b.lines.find((x) => x.code === 'subsidio_cruzado')!;
    expect(l.provisional).toBe(true);
    expect(l.amount).toBeCloseTo(0.1 * (incrementalCost(RES.energy[0].blocks, 161).cost + 1.414), 2);
  });
  it('los cargos de terceros van aparte del SPEE', () => {
    const b = computeBill(RES, { month: 1, kwhByPeriod: { unico: 100 } }, { thirdParty: [{ code: 'ap', name: 'Alumbrado público', method: 'fijo', value: 3, reducibleByPv: false, status: 'provisional', sourceNote: 'municipio' }] });
    expect(b.thirdParty).toBe(3);
    expect(b.total).toBeCloseTo(b.spee + 3, 2);
    expect(b.warnings.join(' ')).toMatch(/terceros provisionales/);
  });
});

describe('Regulación 005/24: balance neto y créditos', () => {
  const month = (i: number, imp: number, inj: number): NetMonth => ({ month: (i % 12) + 1, kwhByPeriod: {}, importedByPeriod: { unico: imp }, injectedByPeriod: { unico: inj } });
  it('excedente → crédito; déficit → usa el saldo; comercialización siempre', () => {
    const r = simulateNetMetering(RES, [month(0, 100, 150), month(1, 200, 120)]);
    expect(r[0].creditGeneratedKwh).toBe(50);
    expect(r[0].bill.spee).toBe(1.41);
    expect(r[1].creditUsedKwh).toBe(50);
    expect(r[1].billableKwh).toBe(30);
    expect(r[1].bill.spee).toBeCloseTo(30 * 0.091 + 1.414, 2);
  });
  it('el saldo se reinicia a cero cada 24 meses, sin pago', () => {
    const months = Array.from({ length: 25 }, (_, i) => month(i, 100, 110));
    const r = simulateNetMetering(RES, months);
    expect(r[23].balanceKwh).toBe(240);
    expect(r[24].expiredKwh).toBe(240);
    expect(r[24].balanceKwh).toBe(10);
  });
  it('tarifa horaria: energía equivalente ponderada por el cargo y saldo al mayor cargo', () => {
    const tm = maxEnergyCharge(IND_MV, 10);
    expect(tm).toBe(0.1318);
    const [r] = simulateNetMetering(IND_MV, [{
      month: 10, kwhByPeriod: {}, demandKw: 100, peakDemandKw: 100,
      importedByPeriod: { lv_08_18: 0, lv_18_22: 5000, base: 8000, sdf_18_22: 500 },
      injectedByPeriod: { lv_08_18: 6000, lv_18_22: 0, base: 0, sdf_18_22: 0 },
    }]);
    const eq = (5000 * 0.1318 + 8000 * 0.1001 + 500 * 0.1178 - 6000 * 0.1178) / 0.1318;
    expect(r.netKwh).toBeCloseTo(eq, 6);
    expect(r.billableKwh).toBeCloseTo(eq, 6);
    expect(r.bill.lines.find((l) => l.code === 'energia')!.amount).toBeCloseTo(eq * 0.1318, 2);
    // Con generación distribuida la demanda facturable es la tomada de la red, sin el mínimo del 60 %.
    expect(r.bill.billableDemandKw).toBe(100);
  });
});
