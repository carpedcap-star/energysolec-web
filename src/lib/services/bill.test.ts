import { describe, expect, it } from 'vitest';
import { BillExtraction, canConfirmBill, checkBillFile, isBillUploadId, matchDistributor, sanitizeExtraction, toCalculatorInput, BILL_LIMITS } from './bill';

const empty: BillExtraction = { readable: true, distributor: null, tariff_category: null, billing_period: null, energy_kwh: null, electricity_usd: null, total_usd: null, demand_kw: null, history: [], notes: null };
const months = (from: string, n: number, kwh: (i: number) => number) => Array.from({ length: n }, (_, i) => {
  const [y, m] = from.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + i, 1));
  return { month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, kwh: kwh(i) };
});

describe('checkBillFile', () => {
  const pdf = (n: number) => { const b = new Uint8Array(n); b.set([0x25, 0x50, 0x44, 0x46, 0x2d]); return b; };
  const jpg = (n: number) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff]); return b; };
  it('acepta PDF e imágenes por su firma', () => {
    expect(checkBillFile(pdf(100))).toMatchObject({ mime: 'application/pdf' });
    expect(checkBillFile(jpg(100))).toMatchObject({ mime: 'image/jpeg' });
  });
  it('rechaza otros tipos, vacíos y archivos grandes', () => {
    expect(checkBillFile(new Uint8Array(0))).toMatch(/Selecciona/);
    expect(checkBillFile(new TextEncoder().encode('<svg onload=alert(1)>'))).toMatch(/PDF o una foto/);
    expect(checkBillFile(jpg(BILL_LIMITS.image + 1))).toMatch(/4 MB/);
    expect(checkBillFile(pdf(BILL_LIMITS.pdf + 1))).toMatch(/4 MB/);
  });
});

describe('matchDistributor', () => {
  it('reconoce las distribuidoras sin depender de tildes ni mayúsculas', () => {
    expect(matchDistributor('CNEL EP Unidad de Negocio Guayaquil')).toBe('CNEL EP (unidades de negocio)');
    expect(matchDistributor('EMPRESA ELECTRICA QUITO S.A.')).toBe('Empresa Eléctrica Quito');
    expect(matchDistributor('Empresa Eléctrica Regional Centro Sur C.A.')).toBe('Centrosur');
    expect(matchDistributor('ELEPCO S.A.')).toBe('Empresa Eléctrica Cotopaxi');
    expect(matchDistributor('Elecgalápagos')).toBe('Empresa Eléctrica Galápagos');
  });
  it('sin coincidencia clara devuelve null', () => {
    expect(matchDistributor('Proveedor desconocido')).toBeNull();
    expect(matchDistributor(null)).toBeNull();
  });
});

describe('sanitizeExtraction', () => {
  it('descarta valores fuera de rango y meses mal formados; ordena y quita repetidos', () => {
    const d = sanitizeExtraction({ ...empty, energy_kwh: -5, total_usd: 1e12, demand_kw: Number.NaN, billing_period: 'sept 2026',
      history: [{ month: '2026-05', kwh: 300 }, { month: '2026-13', kwh: 1 }, { month: '2026-03', kwh: 280 }, { month: '2026-05', kwh: 999 }, { month: '2026-04', kwh: -1 }] });
    expect(d.energyKwh).toBeNull(); expect(d.totalUsd).toBeNull(); expect(d.demandKw).toBeNull(); expect(d.billingPeriod).toBeNull();
    expect(d.history).toEqual([{ month: '2026-03', kwh: 280 }, { month: '2026-05', kwh: 300 }]);
  });
  it('agrega el mes facturado al historial y limpia los textos', () => {
    const d = sanitizeExtraction({ ...empty, billing_period: '2026-09', energy_kwh: 310, notes: '  línea\u0000 rara  ', distributor: 'CNEL' });
    expect(d.history).toEqual([{ month: '2026-09', kwh: 310 }]);
    expect(d.notes).toBe('línea rara');
    expect(d.distributor).toBe('CNEL EP (unidades de negocio)');
  });
  it('conserva como máximo 24 meses', () => {
    expect(sanitizeExtraction({ ...empty, history: months('2023-01', 30, () => 100) }).history).toHaveLength(24);
  });
});

describe('toCalculatorInput', () => {
  it('modo profesional con 12 meses: historial por posición de calendario', () => {
    const d = sanitizeExtraction({ ...empty, history: months('2025-10', 12, (i) => 200 + i), electricity_usd: 28.4 });
    const r = toCalculatorInput(d, 'profesional');
    if ('error' in r) throw new Error(r.error);
    expect(r.input).toBe('history');
    expect(r.history[9]).toBe('200');   // octubre 2025
    expect(r.history[8]).toBe('211');   // septiembre 2026
    expect(r.history.every((h) => h !== '')).toBe(true);
  });
  it('modo rápido con historial: promedio en kWh, sin valor de un solo mes', () => {
    const d = sanitizeExtraction({ ...empty, history: months('2026-01', 6, () => 300), energy_kwh: 300, billing_period: '2026-06', total_usd: 35 });
    const r = toCalculatorInput(d, 'rapida');
    if ('error' in r) throw new Error(r.error);
    expect(r).toMatchObject({ input: 'kwh', monthlyKwh: '300', monthlyBillUsd: '' });
    expect(r.warnings.join(' ')).toMatch(/promedio de los 6 meses/);
  });
  it('profesional con historial incompleto avisa que falta completar', () => {
    const r = toCalculatorInput(sanitizeExtraction({ ...empty, history: months('2026-01', 5, () => 100) }), 'profesional');
    if ('error' in r) throw new Error(r.error);
    expect(r.input).toBe('kwh');
    expect(r.warnings.join(' ')).toMatch(/12 meses completos/);
  });
  it('solo el mes facturado: kWh y valor del servicio eléctrico', () => {
    const r = toCalculatorInput(sanitizeExtraction({ ...empty, energy_kwh: 250, electricity_usd: 24.5, total_usd: 31, demand_kw: 12 }), 'rapida');
    if ('error' in r) throw new Error(r.error);
    expect(r).toMatchObject({ input: 'kwh', monthlyKwh: '250', monthlyBillUsd: '24.5', demandKw: '12' });
    expect(r.warnings.join(' ')).not.toMatch(/tasas/);
  });
  it('si solo hay total a pagar, avisa de las tasas de terceros', () => {
    const r = toCalculatorInput(sanitizeExtraction({ ...empty, total_usd: 40 }), 'rapida');
    if ('error' in r) throw new Error(r.error);
    expect(r).toMatchObject({ input: 'bill', monthlyBillUsd: '40' });
    expect(r.warnings.join(' ')).toMatch(/basura/);
  });
  it('avisa si el precio implícito por kWh es inverosímil', () => {
    const r = toCalculatorInput(sanitizeExtraction({ ...empty, energy_kwh: 100, electricity_usd: 300 }), 'rapida');
    if ('error' in r) throw new Error(r.error);
    expect(r.warnings.join(' ')).toMatch(/poco habitual/);
  });
  it('sin ningún dato útil devuelve error', () => {
    expect(toCalculatorInput(sanitizeExtraction(empty), 'rapida')).toHaveProperty('error');
  });
});

describe('confirmación', () => {
  it('solo UUID v4 válidos', () => {
    expect(isBillUploadId('3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f')).toBe(true);
    expect(isBillUploadId('../../etc/passwd')).toBe(false);
    expect(isBillUploadId(42)).toBe(false);
  });
  it('una sola vez y dentro de 2 horas', () => {
    const now = Date.parse('2026-11-25T12:00:00Z');
    expect(canConfirmBill({ confirmed_by_user: false, study_id: null, created_at: '2026-11-25T11:00:00Z' }, now)).toBe(true);
    expect(canConfirmBill({ confirmed_by_user: true, study_id: null, created_at: '2026-11-25T11:00:00Z' }, now)).toBe(false);
    expect(canConfirmBill({ confirmed_by_user: false, study_id: 'x', created_at: '2026-11-25T11:00:00Z' }, now)).toBe(false);
    expect(canConfirmBill({ confirmed_by_user: false, study_id: null, created_at: '2026-11-25T09:00:00Z' }, now)).toBe(false);
  });
});
