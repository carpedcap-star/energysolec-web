import { z } from 'zod';
import { SEGMENTS } from './segments';

/**
 * Registro de bloques de contenido editables (tabla `content_blocks`).
 * Cada bloque declara sus campos y su texto base (fallback). Las páginas públicas leen el bloque
 * publicado y, campo a campo, caen al texto base si falta o no es válido: la web nunca queda vacía.
 * El formulario del panel y su validación se generan de `fields`.
 */

export type TextField = { key: string; label: string; type: 'text' | 'textarea'; max: number; required?: boolean; hint?: string };
export type ListField = { key: string; label: string; type: 'list'; maxItems: number; maxLen: number; minItems?: number; hint?: string };
export type ItemsField = { key: string; label: string; type: 'items'; minItems: number; maxItems: number; itemLabel: string; fields: TextField[]; hint?: string };
export type ImageField = { key: string; label: string; type: 'image'; hint?: string };
export type FieldSpec = TextField | ListField | ItemsField | ImageField;

/** Valor guardado en `data`: texto, lista de textos, lista de elementos o id de imagen en `media`. */
export type FieldValue = string | string[] | Record<string, string>[] | null;
export type BlockData = Record<string, FieldValue>;

export type BlockDef = {
  page: string; slot: string; label: string; group: string; path: string; description?: string;
  fields: FieldSpec[]; fallback: BlockData;
  /** Si el bloque es provisional, la página pública lo marca con placeholder-badge (regla 1). */
  publicPlaceholder?: boolean;
};
export const blockKey = (page: string, slot: string) => `${page}.${slot}`;

const t = (key: string, label: string, max: number, extra: Partial<TextField> = {}): TextField => ({ key, label, type: 'text', max, required: true, ...extra });
const ta = (key: string, label: string, max: number, extra: Partial<TextField> = {}): TextField => ({ key, label, type: 'textarea', max, required: true, ...extra });
const NO_CLAIMS = 'No incluyas cifras, certificaciones ni relaciones con marcas sin respaldo documental.';

const segmentBlock = (slug: 'residencial' | 'comercial' | 'industrial'): BlockDef => {
  const s = SEGMENTS.find((x) => x.slug === slug)!;
  return {
    page: `soluciones-${slug}`, slot: 'main', group: 'Soluciones', label: `Soluciones · ${s.name}`, path: `/soluciones/${slug}`,
    description: 'Encabezado, público objetivo, lista de soluciones y formulario de cotización de la unidad de negocio.',
    fields: [
      t('eyebrow', 'Antetítulo', 60),
      ta('title', 'Título', 140),
      ta('lead', 'Introducción', 320, { hint: 'También se usa como descripción para buscadores.' }),
      { key: 'audience', label: 'A quién va dirigido', type: 'list', maxItems: 10, maxLen: 40, minItems: 1, hint: 'Uno por línea.' },
      { key: 'solutions', label: 'Soluciones', type: 'items', minItems: 3, maxItems: 15, itemLabel: 'Solución', fields: [t('title', 'Título', 70), ta('text', 'Descripción', 180)], hint: NO_CLAIMS },
      t('formTitle', 'Título del formulario', 80),
      ta('formText', 'Texto del formulario', 240),
    ],
    fallback: {
      eyebrow: s.eyebrow, title: s.title, lead: s.lead, audience: s.audience, solutions: s.solutions,
      formTitle: s.formTitle,
      formText: slug === 'industrial' ? 'Comparte tu planilla, curva de carga o información del sitio. Nuestro equipo de ingeniería evaluará tu caso.' : 'Un asesor revisará tu caso y te contactará con una propuesta.',
    },
  };
};

export const BLOCKS: BlockDef[] = [
  {
    page: 'home', slot: 'hero', group: 'Página de inicio', label: 'Inicio · Portada principal', path: '/',
    description: 'Primer bloque que ve el visitante. La foto de fondo es opcional: sin ella se muestra el fondo gráfico.',
    fields: [
      t('eyebrow', 'Antetítulo', 50),
      t('title', 'Título', 80, { hint: 'Se muestra antes de la parte resaltada.' }),
      t('highlight', 'Parte resaltada del título', 40, { hint: 'Aparece en amarillo, al final del título.' }),
      ta('lead', 'Texto de apoyo', 220, { hint: NO_CLAIMS }),
      { key: 'image', label: 'Foto de fondo (opcional)', type: 'image', hint: 'Foto horizontal de un proyecto real, mínimo 1600 px de ancho. Se oscurece para que el texto se lea.' },
      t('imageAlt', 'Descripción de la foto', 140, { required: false, hint: 'Para lectores de pantalla. Ej.: «Paneles solares sobre la cubierta de una empacadora en Guayas».' }),
    ],
    fallback: {
      eyebrow: 'Ingeniería solar · Ecuador', title: 'Transformamos la energía en', highlight: 'oportunidades.',
      lead: 'Ingeniería, tecnología y soluciones energéticas diseñadas para construir un futuro más eficiente, rentable y sostenible.',
      image: null, imageAlt: '',
    },
  },
  {
    page: 'home', slot: 'calc_card', group: 'Página de inicio', label: 'Inicio · Tarjeta de la calculadora', path: '/',
    fields: [
      t('kicker', 'Rótulo', 50), t('title', 'Título', 90),
      { key: 'bullets', label: 'Puntos destacados', type: 'list', minItems: 3, maxItems: 3, maxLen: 90, hint: 'Exactamente 3, uno por línea (cada uno lleva su ícono).' },
      t('button', 'Texto del botón', 30),
    ],
    fallback: {
      kicker: 'Estudio solar en minutos', title: 'Tu factura, tu ubicación, tu ahorro real.',
      bullets: ['Irradiación de tu provincia con PVGIS y NASA POWER', 'VAN, TIR, retorno y LCOE en tres escenarios', 'Supuestos visibles, sin promesas infladas'],
      button: 'Calcular mi ahorro',
    },
  },
  {
    page: 'home', slot: 'segments', group: 'Página de inicio', label: 'Inicio · Unidades de negocio', path: '/',
    description: 'Encabezado de las tres tarjetas. El texto de cada tarjeta es la introducción de su página de soluciones.',
    fields: [t('eyebrow', 'Antetítulo', 50), t('title', 'Título', 90)],
    fallback: { eyebrow: 'Unidades de negocio', title: 'Una solución energética para cada escala.' },
  },
  {
    page: 'home', slot: 'benefits', group: 'Página de inicio', label: 'Inicio · Por qué Energy Solutions', path: '/',
    fields: [
      t('eyebrow', 'Antetítulo', 50), t('title', 'Título', 90), ta('text', 'Texto', 500, { hint: NO_CLAIMS }),
      { key: 'items', label: 'Beneficios', type: 'items', minItems: 4, maxItems: 4, itemLabel: 'Beneficio', fields: [t('title', 'Título', 40), ta('text', 'Descripción', 140)], hint: 'Exactamente 4 (cada uno lleva su ícono). ' + NO_CLAIMS },
    ],
    fallback: {
      eyebrow: 'Por qué Energy Solutions', title: 'Ingeniería que se traduce en rentabilidad.',
      text: 'Dimensionamos cada sistema con datos de irradiación de tu ubicación, tu perfil de consumo y la estructura real de tu tarifa eléctrica. Te mostramos los supuestos, los riesgos y los escenarios antes de que inviertas.',
      items: [
        { title: 'Ahorro medible', text: 'Análisis por componentes de tu factura: energía, demanda y cargos fijos.' },
        { title: 'Continuidad operativa', text: 'Baterías y BESS para enfrentar cortes y racionamientos.' },
        { title: 'Capacidad EPC', text: 'Desde sistemas residenciales hasta centrales de varios megavatios.' },
        { title: 'Respaldo tecnológico', text: 'Equipos de fabricantes reconocidos con garantías documentadas.' },
      ],
    },
  },
  {
    page: 'home', slot: 'cta', group: 'Página de inicio', label: 'Inicio · Llamado final', path: '/',
    fields: [ta('title', 'Título', 90), ta('text', 'Texto', 220)],
    fallback: { title: '¿Cuánto puedes ahorrar con energía solar?', text: 'Obtén un estudio de prefactibilidad con potencia recomendada, inversión, retorno y flujo de caja a 25 años.' },
  },
  segmentBlock('residencial'), segmentBlock('comercial'), segmentBlock('industrial'),
  {
    page: 'nosotros', slot: 'main', group: 'Empresa', label: 'Nosotros', path: '/nosotros', publicPlaceholder: true,
    description: 'Mientras sea provisional, la página lo indica con una etiqueta visible. Desmarca «Provisional» solo con información oficial.',
    fields: [
      t('title', 'Título', 90),
      ta('lead', 'Introducción', 320),
      ta('history', 'Historia', 2000, { required: false }),
      ta('mission', 'Misión', 600, { required: false }),
      ta('vision', 'Visión', 600, { required: false }),
      { key: 'values', label: 'Valores', type: 'list', maxItems: 8, maxLen: 60, hint: 'Uno por línea.' },
      { key: 'image', label: 'Foto del equipo o las instalaciones (opcional)', type: 'image' },
      t('imageAlt', 'Descripción de la foto', 140, { required: false }),
    ],
    fallback: {
      title: 'Energy Solutions Ecuador S.A.S.',
      lead: 'Empresa ecuatoriana especializada en soluciones energéticas, ingeniería eléctrica y sistemas solares fotovoltaicos.',
      history: '', mission: '', vision: '', values: [], image: null, imageAlt: '',
    },
  },
];

export const findBlock = (page: string, slot: string) => BLOCKS.find((b) => b.page === page && b.slot === slot);

// ---------------------------------------------------------------- Validación
function fieldSchema(f: FieldSpec): z.ZodType<FieldValue> {
  if (f.type === 'text' || f.type === 'textarea') {
    const base = z.string().trim().max(f.max, `${f.label}: máximo ${f.max} caracteres`);
    return (f.required ? base.min(1, `${f.label}: es obligatorio`) : base) as z.ZodType<FieldValue>;
  }
  if (f.type === 'list') {
    return z.array(z.string().trim().min(1).max(f.maxLen, `${f.label}: cada línea admite hasta ${f.maxLen} caracteres`))
      .min(f.minItems ?? 0, `${f.label}: ingresa al menos ${f.minItems}`)
      .max(f.maxItems, `${f.label}: máximo ${f.maxItems}`) as z.ZodType<FieldValue>;
  }
  if (f.type === 'items') {
    const item = z.object(Object.fromEntries(f.fields.map((s) => [s.key, fieldSchema(s)])));
    const range = f.minItems === f.maxItems ? `exactamente ${f.minItems}` : `entre ${f.minItems} y ${f.maxItems}`;
    return z.array(item).min(f.minItems, `${f.label}: ingresa ${range}`).max(f.maxItems, `${f.label}: ingresa ${range}`) as z.ZodType<FieldValue>;
  }
  return z.string().min(1).max(64).nullable() as z.ZodType<FieldValue>;
}
export const blockSchema = (def: BlockDef) => z.object(Object.fromEntries(def.fields.map((f) => [f.key, fieldSchema(f)])));

/** Combina lo guardado con el texto base campo por campo: un campo ausente o inválido usa el texto base. */
export function mergeWithFallback(def: BlockDef, data: unknown): BlockData {
  const src = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const out: BlockData = {};
  for (const f of def.fields) {
    const p = fieldSchema(f).safeParse(src[f.key]);
    out[f.key] = p.success ? p.data : def.fallback[f.key] ?? null;
  }
  return out;
}

/** Lee el formulario generado por el panel. Las imágenes nuevas se resuelven fuera (necesitan el almacén). */
export function parseBlockForm(def: BlockDef, fd: FormData): { data: BlockData } | { error: string } {
  const str = (k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : ''; };
  const raw: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.type === 'text' || f.type === 'textarea') raw[f.key] = str(f.key);
    else if (f.type === 'list') raw[f.key] = str(f.key).split('\n').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'items') {
      const cols = Object.fromEntries(f.fields.map((s) => [s.key, fd.getAll(`${f.key}.${s.key}`).map((v) => String(v).trim())]));
      const n = Math.max(0, ...Object.values(cols).map((c) => c.length));
      const rows: Record<string, string>[] = [];
      for (let i = 0; i < n; i++) {
        const row = Object.fromEntries(f.fields.map((s) => [s.key, cols[s.key][i] ?? '']));
        if (Object.values(row).some(Boolean)) rows.push(row); // filas totalmente vacías se ignoran
      }
      raw[f.key] = rows;
    } else raw[f.key] = str(f.key) || null;
  }
  const p = blockSchema(def).safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0];
    const f = def.fields.find((x) => x.key === i?.path[0]);
    if (f?.type === 'items' && typeof i?.path[1] === 'number') return { error: `${f.itemLabel} ${i.path[1] + 1}: ${i.message}` };
    return { error: i?.message ?? 'Datos no válidos' };
  }
  return { data: p.data as BlockData };
}

/** Ids de imagen usados por un bloque (para resolver sus URL). */
export const blockMediaIds = (def: BlockDef, data: BlockData) =>
  def.fields.filter((f) => f.type === 'image').map((f) => data[f.key]).filter((v): v is string => typeof v === 'string');
