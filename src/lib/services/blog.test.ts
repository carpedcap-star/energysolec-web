import { describe, expect, it } from 'vitest';
import { BLOG_CATEGORIES, excerptOf, fromLocalInput, parsePostForm, postStatus, toLocalInput } from './blog';

const BODY = 'La energía solar en Ecuador permite reducir la factura eléctrica de hogares y empresas con sistemas bien dimensionados.';
const fdOf = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };
const ok = (o: Record<string, string>, now?: Date) => { const r = parsePostForm(fdOf(o), now); if ('error' in r) throw new Error(r.error); return r.data; };
const err = (o: Record<string, string>) => { const r = parsePostForm(fdOf(o)); return 'error' in r ? r.error : null; };
const base = { title: '¿Cuánto ahorra un sistema solar en Guayaquil?', body_md: BODY, category: 'Retorno de inversión' };

describe('blog: formulario', () => {
  it('genera la URL y deja borrador sin fecha', () => {
    const p = ok(base);
    expect(p.slug).toBe('cuanto-ahorra-un-sistema-solar-en-guayaquil');
    expect(p.published).toBe(false);
    expect(p.published_at).toBeNull();
  });
  it('publicar sin fecha usa «ahora»; con fecha la interpreta en hora de Ecuador', () => {
    const now = new Date('2026-11-24T15:00:00Z');
    expect(ok({ ...base, published: 'on' }, now).published_at).toBe(now.toISOString());
    expect(ok({ ...base, published: 'on', published_at: '2026-12-01T09:30' }).published_at).toBe('2026-12-01T14:30:00.000Z');
  });
  it('valida categoría, largo del cuerpo y límites SEO', () => {
    expect(err({ ...base, category: 'Chismes' })).toMatch(/categoría/);
    expect(err({ ...base, body_md: 'Muy corto.' })).toMatch(/demasiado corto/);
    expect(err({ ...base, seo_title: 'x'.repeat(61) })).toMatch(/máximo 60/);
    expect(err({ ...base, seo_description: 'x'.repeat(161) })).toMatch(/máximo 160/);
    expect(err({ ...base, published_at: '01/12/2026' })).toMatch(/Fecha/);
  });
  it('las 10 categorías de la especificación', () => {
    expect(BLOG_CATEGORIES).toHaveLength(10);
    expect(BLOG_CATEGORIES.find((c) => c.name === 'Regulación eléctrica ecuatoriana')?.slug).toBe('regulacion-electrica-ecuatoriana');
  });
});

describe('blog: estado y fechas', () => {
  const now = Date.parse('2026-11-24T15:00:00Z');
  it('borrador, programado y publicado', () => {
    expect(postStatus({ published: false, published_at: '2026-01-01T00:00:00Z' }, now)).toBe('borrador');
    expect(postStatus({ published: true, published_at: '2026-12-01T00:00:00Z' }, now)).toBe('programado');
    expect(postStatus({ published: true, published_at: '2026-11-24T14:59:00Z' }, now)).toBe('publicado');
  });
  it('ida y vuelta del campo de fecha en hora de Ecuador', () => {
    expect(toLocalInput(fromLocalInput('2026-12-31T23:45'))).toBe('2026-12-31T23:45');
    expect(toLocalInput(null)).toBe('');
  });
  it('extracto automático cortado en palabra completa', () => {
    const e = excerptOf({ excerpt: null, body_md: `## Título\n\n${BODY} ${BODY}` }, 80);
    expect(e.endsWith('…')).toBe(true);
    expect(e.length).toBeLessThanOrEqual(81);
    expect(e).not.toContain('##');
    expect(e).not.toContain('Título');
    expect(excerptOf({ excerpt: 'Propio', body_md: BODY })).toBe('Propio');
  });
});
