import { describe, expect, it } from 'vitest';
import { buildBlocks, parseTariffForm, previewBills } from './tariff-form';
import { monthlyBill } from '../engine/tariff';

const fdOf = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x); return fd; };
const base = { code: 'res-bt', name: 'Residencial BT', segment: 'residencial', voltage_level: 'BT', commercialization_usd: '1.41', other_charges_pct: '10', source_note: 'Pliego tarifario ARCONEL 2026, Resolución XX', valid_from: '2026-01-01' };

describe('tarifas: bloques continuos', () => {
  it('cada bloque empieza donde termina el anterior y el último no tiene límite', () => {
    expect(buildBlocks([{ to: 130, price: 0.04 }, { to: 500, price: 0.092 }, { to: null, price: 0.105 }])).toEqual([
      { from_kwh: 0, to_kwh: 130, usd_per_kwh: 0.04 }, { from_kwh: 130, to_kwh: 500, usd_per_kwh: 0.092 }, { from_kwh: 500, to_kwh: null, usd_per_kwh: 0.105 },
    ]);
  });
  it('rechaza límites no crecientes, un último con límite y precios inválidos', () => {
    expect(buildBlocks([{ to: 500, price: 0.1 }, { to: 130, price: 0.1 }, { to: null, price: 0.1 }])).toMatch(/mayor que el inicio/);
    expect(buildBlocks([{ to: 130, price: 0.1 }, { to: 500, price: 0.1 }])).toMatch(/último bloque no tiene límite/);
    expect(buildBlocks([{ to: null, price: 0 }])).toMatch(/precio/);
    expect(buildBlocks([])).toMatch(/al menos un bloque/);
  });
  it('con bloques continuos se cobra todo el consumo', () => {
    const b = buildBlocks([{ to: 130, price: 0.04 }, { to: null, price: 0.1 }]) as any;
    const t = { code: 'X', name: 'X', segment: 'residencial', voltage_level: 'BT', has_demand_charge: false, energy_blocks: b, demand_usd_per_kw: null, commercialization_usd: 0, other_charges_pct: 0, source_note: '', is_placeholder: true } as const;
    expect(monthlyBill(t as any, 300).energy).toBeCloseTo(130 * 0.04 + 170 * 0.1, 6);
  });
});

describe('tarifas: formulario', () => {
  it('normaliza código y porcentaje, y arma los bloques', () => {
    const r = parseTariffForm(fdOf({ ...base, block_to: ['130', ''], block_price: ['0.04', '0.092'] }));
    if ('error' in r) throw new Error(r.error);
    expect(r.data).toMatchObject({ code: 'RES-BT', other_charges_pct: 0.1, has_demand_charge: false, demand_usd_per_kw: null });
    expect(r.data.energy_blocks).toHaveLength(2);
  });
  it('cargo por demanda obligatorio cuando aplica; fuente obligatoria', () => {
    expect((parseTariffForm(fdOf({ ...base, has_demand_charge: 'on', block_to: [''], block_price: ['0.09'] })) as { error: string }).error).toMatch(/USD\/kW/);
    expect((parseTariffForm(fdOf({ ...base, source_note: 'ARCONEL', block_to: [''], block_price: ['0.09'] })) as { error: string }).error).toMatch(/fuente/);
  });
  it('vista previa: factura con el mismo cálculo del motor', () => {
    const r = parseTariffForm(fdOf({ ...base, block_to: [''], block_price: ['0.1'] }));
    if ('error' in r) throw new Error(r.error);
    const p = previewBills(r.data);
    expect(p[0]).toMatchObject({ kwh: 100, energy: 10, fixed: 1.41 });
    expect(p[0].total).toBeCloseTo(10 + 1.41 + 1, 6);
  });
});
