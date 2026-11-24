import { describe, expect, it } from 'vitest';
import { parseBrandForm, relationshipIsPublic, toPublicBrand } from './brands';
import { SEED_BRANDS } from '../data/seed';
import type { BrandRecord } from '../data/types';

const doc = { id: 'd1', path: 'brands/contrato.pdf', url: '/admin/documentos/d1', alt: null };
const rec = (over: Partial<BrandRecord> = {}): BrandRecord => ({ ...SEED_BRANDS[3], relationship: 'Distribuidor autorizado', ...over });
const fdOf = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x); return fd; };

describe('marcas: relación comercial solo con respaldo vigente', () => {
  it('sin verificar, sin documento o vencida: no se publica', () => {
    expect(toPublicBrand(rec()).relationship).toBeNull();
    expect(toPublicBrand(rec({ relationship_verified: true })).relationship).toBeNull();
    expect(toPublicBrand(rec({ relationship_verified: true, relationship_doc: doc, relationship_valid_until: '2026-01-31' }), '2026-02-01').relationship).toBeNull();
  });
  it('verificada, con documento y vigente (incluido el último día): se publica', () => {
    const b = toPublicBrand(rec({ relationship_verified: true, relationship_doc: doc, relationship_valid_until: '2026-02-01' }), '2026-02-01');
    expect(b.relationship).toBe('Distribuidor autorizado');
    expect(b.relationship_verified).toBe(true);
    expect(relationshipIsPublic(rec({ relationship_verified: true, relationship_doc: doc }), '2099-01-01')).toBe(true);
  });
  it('lo público nunca incluye el documento de respaldo', () => {
    const json = JSON.stringify(toPublicBrand(rec({ relationship_verified: true, relationship_doc: doc })));
    expect(json).not.toContain('contrato.pdf');
    expect(json).not.toContain('/admin/documentos');
  });
  it('recursos: usa el archivo o el enlace y omite los vacíos', () => {
    const b = toPublicBrand(rec({ assets: [
      { id: 'a1', kind: 'datasheet', title: 'Ficha', media: { id: 'm', path: 'x.pdf', url: '/x.pdf', alt: null }, url: null },
      { id: 'a2', kind: 'video', title: 'Video', media: null, url: 'https://youtu.be/x' },
      { id: 'a3', kind: 'catalog', title: 'Vacío', media: null, url: null },
    ] }));
    expect(b.assets.map((a) => a.url)).toEqual(['/x.pdf', 'https://youtu.be/x']);
  });
});

describe('marcas: formulario del panel', () => {
  const base = { name: 'SMA Solar', sort: '3' };
  it('normaliza el identificador y lee documentos en orden', () => {
    const r = parseBrandForm(fdOf({ ...base, 'asset.kind': ['datasheet', 'video', 'catalog'], 'asset.title': ['Ficha Sunny', 'Presentación', ''], 'asset.media_id': ['m1', '', ''], 'asset.url': ['', 'https://youtu.be/x', ''], 'asset.id': ['', '', ''] }));
    if ('error' in r) throw new Error(r.error);
    expect(r.data.slug).toBe('sma-solar');
    expect(r.data.assets.map((a) => a.title)).toEqual(['Ficha Sunny', 'Presentación']);
  });
  it('verificar exige relación y documento', () => {
    expect((parseBrandForm(fdOf({ ...base, relationship_verified: 'on' })) as { error: string }).error).toMatch(/Indica la relación/);
    expect((parseBrandForm(fdOf({ ...base, relationship_verified: 'on', relationship: 'Distribuidor' })) as { error: string }).error).toMatch(/documento de respaldo/);
    expect('data' in parseBrandForm(fdOf({ ...base, relationship_verified: 'on', relationship: 'Distribuidor', relationship_doc_id: 'd1' }))).toBe(true);
  });
  it('documentos: fuente obligatoria, videos con enlace, solo https', () => {
    const one = (k: string, t: string, m: string, u: string) => parseBrandForm(fdOf({ ...base, 'asset.kind': [k], 'asset.title': [t], 'asset.media_id': [m], 'asset.url': [u], 'asset.id': [''] }));
    expect((one('datasheet', 'Ficha', '', '') as { error: string }).error).toMatch(/carga un PDF o indica un enlace/);
    expect((one('video', 'Video', 'm1', '') as { error: string }).error).toMatch(/necesita su enlace/);
    expect((one('catalog', 'Catálogo', '', 'http://x.com') as { error: string }).error).toMatch(/https/);
  });
});
