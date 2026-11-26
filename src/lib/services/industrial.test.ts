import { describe, expect, it } from 'vitest';
import { canEvalTransition, canLinkDoc, checkIndustrialDoc, DOC_MAX_BYTES, EvaluationSchema, IndustrialRequest, safeFilename, sniffIndustrialDoc } from './industrial';

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);
const base = {
  solutions: ['cubierta', 'bess'], company: 'Camaronera El Faro S.A.', ruc: '', sector: 'Camaronera', province: 'El Oro', city: 'Machala',
  monthlyKwh: 85000, name: 'Luis Andrade', email: 'Luis@ElFaro.ec', phone: '+593 99 555 1234', acceptPrivacy: true,
};

describe('documentos', () => {
  it('reconoce tipos por su firma', () => {
    expect(sniffIndustrialDoc(text('%PDF-1.7\n'), 'x.pdf')?.ext).toBe('pdf');
    expect(sniffIndustrialDoc(bytes(0xff, 0xd8, 0xff, 0xe0), 'foto.jpeg')?.ext).toBe('jpg');
    expect(sniffIndustrialDoc(bytes(0x50, 0x4b, 0x03, 0x04, 0x14), 'curva.xlsx')?.ext).toBe('xlsx');
    expect(sniffIndustrialDoc(text('AC1032\0\0'), 'planta.dwg')?.ext).toBe('dwg');
    expect(sniffIndustrialDoc(text('fecha;hora;kW\n2026-10-01;00:15;412.5\n'), 'curva.csv')?.ext).toBe('csv');
  });
  it('rechaza HTML, SVG, ejecutables y ZIP que no se declara .xlsx', () => {
    expect(sniffIndustrialDoc(text('<html><script>alert(1)</script>'), 'curva.csv')).toBeNull();
    expect(sniffIndustrialDoc(text('<svg onload=alert(1)>'), 'plano.pdf')).toBeNull();
    expect(sniffIndustrialDoc(bytes(0x4d, 0x5a, 0x90, 0x00), 'setup.exe')).toBeNull();
    expect(sniffIndustrialDoc(bytes(0x50, 0x4b, 0x03, 0x04), 'archivo.zip')).toBeNull();
    expect(sniffIndustrialDoc(text('solo una columna\n1\n2'), 'datos.csv')).toBeNull();
    expect(sniffIndustrialDoc(new Uint8Array([0x66, 0x00, 0x3b]), 'x.csv')).toBeNull();
  });
  it('límite de 4 MB y archivo vacío', () => {
    const big = new Uint8Array(DOC_MAX_BYTES + 1); big.set(text('%PDF-'));
    expect(checkIndustrialDoc(big, 'planos.pdf')).toMatch(/4 MB/);
    expect(checkIndustrialDoc(new Uint8Array(0), 'x.pdf')).toMatch(/vacío/);
  });
  it('nombre seguro: sin rutas ni caracteres peligrosos', () => {
    expect(safeFilename('../../etc/pass"wd.pdf', 'pdf')).toBe('passwd.pdf');
    expect(safeFilename('C:\\planos\\Nave 2 <final>.DWG', 'dwg')).toBe('Nave 2 final.dwg');
    expect(safeFilename('', 'csv')).toBe('documento.csv');
  });
  it('un documento se vincula una vez y dentro de 2 horas', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    expect(canLinkDoc({ request_id: null, created_at: '2026-11-26T11:00:00Z' }, now)).toBe(true);
    expect(canLinkDoc({ request_id: 'x', created_at: '2026-11-26T11:00:00Z' }, now)).toBe(false);
    expect(canLinkDoc({ request_id: null, created_at: '2026-11-26T09:00:00Z' }, now)).toBe(false);
  });
});

describe('solicitud', () => {
  it('válida con consumo; normaliza correo y RUC vacío', () => {
    const r = IndustrialRequest.parse(base);
    expect(r).toMatchObject({ email: 'luis@elfaro.ec', ruc: null, voltage: 'no_se', documents: [] });
    const { ruc: _r, ...noRuc } = base;
    expect(IndustrialRequest.parse(noRuc).ruc).toBeNull();
  });
  it('sin consumo ni factura exige al menos una planilla', () => {
    const noData = { ...base, monthlyKwh: null };
    expect(IndustrialRequest.safeParse(noData).error?.issues[0].message).toMatch(/adjunta al menos una planilla/);
    expect(IndustrialRequest.safeParse({ ...noData, documents: [{ id: '3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f', kind: 'curva_carga' }] }).success).toBe(false);
    expect(IndustrialRequest.safeParse({ ...noData, documents: [{ id: '3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f', kind: 'planilla' }] }).success).toBe(true);
  });
  it('valida soluciones, provincia, RUC si se indica y documentos repetidos', () => {
    expect(IndustrialRequest.safeParse({ ...base, solutions: [] }).error?.issues[0].message).toMatch(/al menos una solución/);
    expect(IndustrialRequest.safeParse({ ...base, province: 'Atlántida' }).success).toBe(false);
    expect(IndustrialRequest.safeParse({ ...base, ruc: '123' }).error?.issues[0].message).toMatch(/13 dígitos/);
    const d = { id: '3f2b8c1e-9d4a-4b6e-8f10-2a3b4c5d6e7f', kind: 'plano' };
    expect(IndustrialRequest.safeParse({ ...base, documents: [d, d] }).success).toBe(false);
    expect(IndustrialRequest.safeParse({ ...base, documents: [{ id: '../x', kind: 'plano' }] }).success).toBe(false);
    expect(IndustrialRequest.safeParse({ ...base, acceptPrivacy: false }).success).toBe(false);
  });
});

describe('evaluación de ingeniería', () => {
  it('transiciones', () => {
    expect(canEvalTransition('pendiente', 'evaluada')).toBe(true);
    expect(canEvalTransition('evaluada', 'pendiente')).toBe(false);
    expect(canEvalTransition('descartada', 'en_evaluacion')).toBe(true);
  });
  it('cerrar la evaluación exige registrar el criterio', () => {
    expect(EvaluationSchema.safeParse({ status: 'evaluada', kwp: 850, notes: 'ok' }).success).toBe(false);
    expect(EvaluationSchema.safeParse({ status: 'evaluada', kwp: 850, notes: 'Cubierta apta, 4.200 m² útiles; MT 13,8 kV.' }).success).toBe(true);
    expect(EvaluationSchema.safeParse({ status: 'en_evaluacion', kwp: null, notes: '' }).success).toBe(true);
    expect(EvaluationSchema.safeParse({ status: 'evaluada', kwp: -1, notes: 'Cubierta apta para el sistema.' }).success).toBe(false);
  });
});
