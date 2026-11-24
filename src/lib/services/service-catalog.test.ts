import { describe, expect, it } from 'vitest';
import { mergeServices, parseServiceForm, publicServices } from './service-catalog';
import { SERVICES } from '@/content/segments';
import type { ServiceRow } from '../data/types';

const row = (over: Partial<ServiceRow>): ServiceRow => ({
  id: 'r1', slug: 'termografia', name: 'Termografía', summary: null, description: null, benefits: [], scope: [], segments: [], cover: null, published: true, sort: 50, ...over,
});
const fdOf = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x); return fd; };

describe('servicios: catálogo base + base de datos', () => {
  it('sin filas, publica los servicios base como provisionales', () => {
    const s = publicServices([]);
    expect(s.map((x) => x.slug)).toEqual(SERVICES.map((x) => x.slug));
    expect(s.every((x) => x.isPlaceholder)).toBe(true);
  });
  it('una fila reemplaza al servicio base; con descripción deja de ser provisional', () => {
    const s = publicServices([row({ description: 'Inspección con cámara térmica.' })]);
    const t = s.find((x) => x.slug === 'termografia')!;
    expect(t.isPlaceholder).toBe(false);
    expect(s.filter((x) => x.slug === 'termografia')).toHaveLength(1);
  });
  it('una fila despublicada oculta el servicio, también si es base', () => {
    expect(publicServices([row({ published: false })]).some((x) => x.slug === 'termografia')).toBe(false);
  });
  it('agrega servicios nuevos y ordena por orden y nombre', () => {
    const all = mergeServices([row({ id: 'n', slug: 'nuevo', name: 'Nuevo servicio', sort: 1 })]);
    expect(all[0].slug).toBe('nuevo');
    expect(all[0].isBase).toBe(false);
    expect(all.find((x) => x.slug === 'termografia')!.isBase).toBe(true);
  });
});

describe('servicios: formulario', () => {
  it('lee listas por línea y segmentos', () => {
    const r = parseServiceForm(fdOf({ name: 'Limpieza de paneles', description: 'Desc', benefits: 'Más energía\r\n\r\nMenos fallas', segments: ['residencial', 'comercial'], sort: '20' }));
    if ('error' in r) throw new Error(r.error);
    expect(r.data.slug).toBe('limpieza-de-paneles');
    expect(r.data.benefits).toEqual(['Más energía', 'Menos fallas']);
    expect(r.data.segments).toEqual(['residencial', 'comercial']);
  });
  it('beneficios sin descripción y segmentos inválidos: rechazados', () => {
    expect((parseServiceForm(fdOf({ name: 'Servicio X', benefits: 'Uno' })) as { error: string }).error).toMatch(/descripción/);
    expect('error' in parseServiceForm(fdOf({ name: 'Servicio X', segments: ['espacial'] }))).toBe(true);
  });
});
