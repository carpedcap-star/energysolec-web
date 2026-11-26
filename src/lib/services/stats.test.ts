import { describe, expect, it } from 'vitest';
import { parseStatForm } from './stats';

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ id: 'a', label: 'MWp instalados', value: '12,5', unit: '', source_note: 'Registro de proyectos 2026', sort: '0', ...o })) fd.set(k, v);
  return fd;
};

describe('indicadores de portada', () => {
  it('acepta coma decimal y unidad vacía', () => {
    const r = parseStatForm(form({ verified: 'on' }));
    expect(r).toEqual({ data: { id: 'a', label: 'MWp instalados', value: 12.5, unit: null, source_note: 'Registro de proyectos 2026', verified: true, sort: 0 } });
  });
  it('devuelve mensajes en lugar de lanzar', () => {
    expect(parseStatForm(form({ source_note: 'ok' }))).toEqual({ error: 'Indica la fuente del dato (al menos 5 caracteres).' });
    expect(parseStatForm(form({ value: 'abc' }))).toEqual({ error: 'El valor debe ser un número.' });
    expect(parseStatForm(form({ value: '' }))).toEqual({ error: 'El valor debe ser un número.' });
    expect(parseStatForm(form({ value: '-1' }))).toEqual({ error: 'El valor no puede ser negativo.' });
    expect(parseStatForm(form({ label: 'x' }))).toEqual({ error: 'Escribe el nombre del indicador.' });
    expect('error' in parseStatForm(form({ unit: 'x'.repeat(21) }))).toBe(true);
  });
  it('no publica como verificado un dato con fuente pendiente o en cero', () => {
    expect('error' in parseStatForm(form({ verified: 'on', source_note: 'PENDIENTE: dato real a ingresar por Gerencia' }))).toBe(true);
    expect('error' in parseStatForm(form({ verified: 'on', value: '0' }))).toBe(true);
    // Sin verificar sí se puede guardar como borrador.
    expect('data' in parseStatForm(form({ source_note: 'PENDIENTE: dato real', value: '0' }))).toBe(true);
  });
});
