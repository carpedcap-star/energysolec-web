import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS } from '../engine/params';
import { parseParamsForm, toFormValues, type EditableParams } from './params-form';

const { version: _v, ...DEF } = DEFAULT_PARAMS;
function fdFrom(p: EditableParams, over: Record<string, string> = {}, tiers?: [string, string][], validated = false) {
  const fd = new FormData();
  const vals = { ...toFormValues(p), ...over };
  for (const [k, v] of Object.entries(vals)) {
    if (v === 'true') fd.append(k, 'on');
    else if (v !== 'false') fd.append(k, v);
  }
  for (const [up, price] of tiers ?? p.pricing.pvTiers.map((t, i, a) => [i === a.length - 1 ? '' : String(t.upToKwp), String(t.usdPerKwp)] as [string, string])) {
    fd.append('tier_up', up); fd.append('tier_price', price);
  }
  if (validated) fd.append('validated', 'on');
  return fd;
}
const ok = (fd: FormData) => { const r = parseParamsForm(fd); if ('error' in r) throw new Error(r.error); return r.data; };
const err = (fd: FormData) => { const r = parseParamsForm(fd); return 'error' in r ? r.error : null; };

describe('parámetros: ida y vuelta', () => {
  it('los valores por defecto se leen igual que se escribieron (porcentajes sin ruido)', () => {
    expect(toFormValues(DEF)['technical.inverterEfficiency']).toBe('97.5');
    expect(toFormValues(DEF)['technical.dcWiringMismatchLoss']).toBe('2.5');
    expect(ok(fdFrom(DEF))).toEqual({ ...DEF, isPlaceholder: true });
  });
  it('solo «validado» quita la marca de provisional', () => {
    expect(ok(fdFrom(DEF, {}, undefined, true)).isPlaceholder).toBe(false);
  });
});

describe('parámetros: coherencia', () => {
  it('tramos de precio ordenados y el último sin límite', () => {
    expect(err(fdFrom(DEF, {}, [['20', '980'], ['5', '1150'], ['', '640']]))).toMatch(/potencia mayor que el anterior/);
    expect(err(fdFrom(DEF, {}, [['5', '1150'], ['20', '980']]))).toMatch(/sin límite/);
    expect(err(fdFrom(DEF, {}, [['5', '0'], ['', '640']]))).toMatch(/mayor a 0/);
    expect(ok(fdFrom(DEF, {}, [['10', '1000'], ['', '700']])).pricing.pvTiers).toEqual([{ upToKwp: 10, usdPerKwp: 1000 }, { upToKwp: 1e9, usdPerKwp: 700 }]);
  });
  it('excedentes: sin compensación valen $0; con precio fijo el precio es obligatorio', () => {
    expect(ok(fdFrom(DEF, { 'financial.exportPriceUsdPerKwh': '0.08' })).financial.exportPriceUsdPerKwh).toBe(0);
    expect(err(fdFrom(DEF, { 'financial.exportCompensation': 'fixed_price' }))).toMatch(/precio de los excedentes/);
    expect(ok(fdFrom(DEF, { 'financial.exportCompensation': 'fixed_price', 'financial.exportPriceUsdPerKwh': '0.05' })).financial.exportPriceUsdPerKwh).toBe(0.05);
  });
  it('escenarios, sombreado y años de reemplazo', () => {
    expect(err(fdFrom(DEF, { 'financial.scenarios.conservador.yieldFactor': '105' }))).toMatch(/generación debe ir/);
    expect(err(fdFrom(DEF, { 'financial.scenarios.optimista.capexFactor': '120' }))).toMatch(/inversión debe ir/);
    expect(err(fdFrom(DEF, { 'technical.shadingLoss.partial': '20' }))).toMatch(/Sombreado/);
    expect(err(fdFrom(DEF, { 'financial.inverterReplacementYear': '30' }))).toMatch(/entre el año 1 y la vida útil/);
  });
  it('números, enteros y rangos del motor', () => {
    expect(err(fdFrom(DEF, { 'pricing.batteryUsdPerKwh': 'abc' }))).toMatch(/«Baterías»: ingresa un número/);
    expect(err(fdFrom(DEF, { 'financial.lifetimeYears': '25.5' }))).toMatch(/entero/);
    expect(err(fdFrom(DEF, { 'technical.dcAcRatio': '3' }))).toMatch(/«Relación CC\/CA»: valor fuera del rango/);
  });
});
