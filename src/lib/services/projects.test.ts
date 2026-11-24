import { describe, expect, it } from 'vitest';
import { parseLatLng, parseProjectForm, toPublicProject } from './projects';
import { SEED_PROJECTS } from '../data/seed';
import type { ProjectRecord } from '../data/types';

const rec = (over: Partial<ProjectRecord> = {}): ProjectRecord => ({
  ...SEED_PROJECTS[0], id: 'p1', slug: 'empacadora-guayas', title: 'Empacadora en Guayas', published: true, is_placeholder: false,
  client_name: 'Empacreci S.A.', lat: -2.19, lng: -79.88, annual_savings_usd: 48000,
  testimonial: 'Excelente trabajo', testimonial_author: 'Gerente de planta',
  cover: { id: 'm1', path: 'projects/a.jpg', url: '/a.jpg', alt: null }, gallery: [{ id: 'm2', path: 'projects/b.jpg', url: '/b.jpg', alt: null }],
  ...over,
});

describe('proyectos: lo público nunca incluye lo no autorizado', () => {
  it('sin banderas oculta cliente, coordenadas, ahorro y testimonio', () => {
    const p = toPublicProject(rec());
    expect(p).toMatchObject({ client_name: null, lat: null, lng: null, annual_savings_usd: null, testimonial: null, testimonial_author: null });
    const json = JSON.stringify(p);
    for (const secret of ['Empacreci', '-2.19', '-79.88', '48000', 'Excelente', 'Gerente']) expect(json).not.toContain(secret);
    expect(p).not.toHaveProperty('client_name_authorized');
    expect(p).not.toHaveProperty('financials_authorized');
  });
  it('con cada bandera expone solo su dato', () => {
    expect(toPublicProject(rec({ client_name_authorized: true })).client_name).toBe('Empacreci S.A.');
    const loc = toPublicProject(rec({ location_authorized: true }));
    expect([loc.lat, loc.lng, loc.client_name]).toEqual([-2.19, -79.88, null]);
    expect(toPublicProject(rec({ financials_authorized: true })).annual_savings_usd).toBe(48000);
    expect(toPublicProject(rec({ testimonial_verified: true })).testimonial_author).toBe('Gerente de planta');
  });
  it('resuelve portada y galería a URL', () => {
    const p = toPublicProject(rec());
    expect(p.cover).toBe('/a.jpg');
    expect(p.gallery).toEqual(['/b.jpg']);
  });
});

const form = (over: Record<string, string | string[] | null> = {}) => {
  const base: Record<string, string | string[] | null> = {
    title: 'Empacadora en Guayas', segment: 'industrial', status: 'finalizado', province: 'Guayas', city: 'Durán',
    capacity_kwp: '250,5', panel_count: '432', technology: 'Bifacial, Seguidor, Bifacial', executed_on: '2025-06-30', ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) { if (v == null) continue; for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x); }
  return fd;
};
const ok = (fd: FormData) => { const r = parseProjectForm(fd); if ('error' in r) throw new Error(r.error); return r.data; };
const err = (fd: FormData) => { const r = parseProjectForm(fd); return 'error' in r ? r.error : null; };

describe('proyectos: formulario del panel', () => {
  it('normaliza URL, números con coma y tecnologías', () => {
    const p = ok(form());
    expect(p.slug).toBe('empacadora-en-guayas');
    expect(p.capacity_kwp).toBe(250.5);
    expect(p.panel_count).toBe(432);
    expect(p.technology).toEqual(['Bifacial', 'Seguidor']);
    expect(p.lat).toBeNull();
  });
  it('cada bandera exige el dato que autoriza', () => {
    expect(err(form({ location_authorized: 'on' }))).toMatch(/ingresa sus coordenadas/);
    expect(err(form({ client_name_authorized: 'on' }))).toMatch(/no lo ingresaste/);
    expect(err(form({ testimonial_verified: 'on', testimonial: 'Muy bien' }))).toMatch(/texto y su autor/);
    expect(err(form({ generation_is_measured: 'on' }))).toMatch(/generación como medida/);
  });
  it('valida coordenadas dentro del Ecuador (incluye Galápagos)', () => {
    expect(err(form({ lat: '-2.19', lng: '79.88' }))).toMatch(/fuera del Ecuador/);
    expect(err(form({ lat: '-2.19' }))).toMatch(/juntas/);
    expect(ok(form({ lat: '-0.74', lng: '-90.31', location_authorized: 'on' })).location_authorized).toBe(true);
  });
  it('no publica un título o URL que revele a un cliente no autorizado', () => {
    expect(err(form({ title: 'Planta Empacreci', client_name: 'Empacreci', published: 'on' }))).toMatch(/nombre del cliente/);
    expect(err(form({ slug: 'empacreci-2025', client_name: 'Empacreci', published: 'on' }))).toMatch(/nombre del cliente/);
    expect(ok(form({ title: 'Planta Empacreci', client_name: 'Empacreci' })).published).toBe(false); // borrador: permitido
    expect(ok(form({ title: 'Planta Empacreci', client_name: 'Empacreci', client_name_authorized: 'on', published: 'on' })).published).toBe(true);
  });
  it('otras reglas: destacado, fechas, números', () => {
    expect(err(form({ featured: 'on' }))).toMatch(/Solo un proyecto publicado/);
    expect(err(form({ executed_on: '2999-01-01' }))).toMatch(/futura/);
    expect(ok(form({ executed_on: '2999-01-01', status: 'en_desarrollo' })).status).toBe('en_desarrollo');
    expect(err(form({ panel_count: '10.5' }))).toMatch(/entero/);
    expect(err(form({ capacity_kwp: '-1' }))).toMatch(/negativo/);
    expect(err(form({ province: 'Atlántida' }))).toMatch(/Provincia/);
  });
  it('lee coordenadas pegadas desde Google Maps', () => {
    expect(parseLatLng('-2.1894, -79.8891')).toEqual({ lat: -2.1894, lng: -79.8891 });
    expect(parseLatLng('0.35 -78.12')).toEqual({ lat: 0.35, lng: -78.12 });
    expect(parseLatLng('Guayaquil')).toBeNull();
  });
});
