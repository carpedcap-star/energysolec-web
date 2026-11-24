import { describe, expect, it } from 'vitest';
import { BLOCKS, blockMediaIds, blockSchema, findBlock, mergeWithFallback, parseBlockForm } from './blocks';

const fdOf = (o: Record<string, string | string[]>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x); return fd; };

describe('bloques de contenido: registro', () => {
  it('cada texto base cumple su propia validación', () => {
    for (const b of BLOCKS) {
      const r = blockSchema(b).safeParse(b.fallback);
      expect(r.success, `${b.page}.${b.slot}: ${r.success ? '' : r.error.issues[0]?.message}`).toBe(true);
    }
  });
  it('page.slot es único y todo campo tiene texto base', () => {
    const keys = BLOCKS.map((b) => `${b.page}.${b.slot}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const b of BLOCKS) for (const f of b.fields) expect(f.key in b.fallback, `${b.page}.${b.slot}.${f.key}`).toBe(true);
  });
});

describe('bloques de contenido: lectura con respaldo', () => {
  const hero = findBlock('home', 'hero')!;
  it('usa lo guardado si es válido y el texto base campo por campo si no', () => {
    const d = mergeWithFallback(hero, { title: 'Nuevo título', lead: 42, eyebrow: '', highlight: 'x'.repeat(200) });
    expect(d.title).toBe('Nuevo título');
    expect(d.lead).toBe(hero.fallback.lead);         // tipo incorrecto
    expect(d.eyebrow).toBe(hero.fallback.eyebrow);   // obligatorio vacío
    expect(d.highlight).toBe(hero.fallback.highlight); // demasiado largo
    expect(d.image).toBeNull();
  });
  it('sin datos devuelve el texto base completo', () => {
    expect(mergeWithFallback(hero, null)).toEqual(hero.fallback);
  });
});

describe('bloques de contenido: formulario del panel', () => {
  const benefits = findBlock('home', 'benefits')!;
  const base = { eyebrow: 'Por qué', title: 'Título', text: 'Texto' };
  it('lee elementos repetibles en orden e ignora filas vacías', () => {
    const r = parseBlockForm(benefits, fdOf({ ...base, 'items.title': ['A', '', 'B', 'C', 'D'], 'items.text': ['a', '', 'b', 'c', 'd'] }));
    if ('error' in r) throw new Error(r.error);
    expect((r.data.items as { title: string }[]).map((i) => i.title)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('exige la cantidad exacta cuando el diseño la necesita', () => {
    const r = parseBlockForm(benefits, fdOf({ ...base, 'items.title': ['A', 'B', 'C'], 'items.text': ['a', 'b', 'c'] }));
    expect('error' in r && r.error).toMatch(/exactamente 4/);
  });
  it('señala el elemento con error', () => {
    const r = parseBlockForm(benefits, fdOf({ ...base, 'items.title': ['A', 'B', '', 'D'], 'items.text': ['a', 'b', 'c', 'd'] }));
    expect('error' in r && r.error).toMatch(/Beneficio 3: Título: es obligatorio/);
  });
  it('listas: una por línea, sin vacías; límites y largo', () => {
    const calc = findBlock('home', 'calc_card')!;
    const ok = parseBlockForm(calc, fdOf({ kicker: 'K', title: 'T', button: 'B', bullets: 'uno\r\n\r\ndos\ntres\n' }));
    if ('error' in ok) throw new Error(ok.error);
    expect(ok.data.bullets).toEqual(['uno', 'dos', 'tres']);
    const bad = parseBlockForm(calc, fdOf({ kicker: 'K', title: 'T', button: 'B', bullets: 'uno\ndos' }));
    expect('error' in bad && bad.error).toMatch(/al menos 3/);
  });
  it('obligatorios y máximos con el nombre del campo', () => {
    const hero = findBlock('home', 'hero')!;
    const r = parseBlockForm(hero, fdOf({ eyebrow: 'E', title: '', highlight: 'h', lead: 'l' }));
    expect('error' in r && r.error).toMatch(/^Título: es obligatorio/);
    const r2 = parseBlockForm(hero, fdOf({ eyebrow: 'E', title: 'T', highlight: 'h', lead: 'l'.repeat(300) }));
    expect('error' in r2 && r2.error).toMatch(/Texto de apoyo: máximo 220/);
  });
  it('imagen: guarda el id y lo expone para resolver su URL', () => {
    const hero = findBlock('home', 'hero')!;
    const r = parseBlockForm(hero, fdOf({ eyebrow: 'E', title: 'T', highlight: 'h', lead: 'l', image: 'media-1' }));
    if ('error' in r) throw new Error(r.error);
    expect(blockMediaIds(hero, r.data)).toEqual(['media-1']);
  });
});
