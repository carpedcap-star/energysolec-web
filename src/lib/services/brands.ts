import { z } from 'zod';
import type { Brand, BrandInput, BrandRecord } from '../data/types';
import { slugify } from './catalog';

/**
 * Marcas (regla 1: ninguna relación con marcas sin respaldo). La relación comercial solo se publica
 * verificada, con documento de respaldo y vigente; la base lo impone igual (0004_brand_backing.sql).
 */

/** Fecha calendario de hoy en Ecuador (AAAA-MM-DD). */
export const todayEc = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());

export const relationshipIsPublic = (r: Pick<BrandRecord, 'relationship' | 'relationship_verified' | 'relationship_doc' | 'relationship_valid_until'>, today = todayEc()) =>
  !!(r.relationship && r.relationship_verified && r.relationship_doc && (!r.relationship_valid_until || r.relationship_valid_until >= today));

/** Único camino de una marca hacia lo público. Nunca incluye el documento de respaldo. */
export function toPublicBrand(r: BrandRecord, today = todayEc()): Brand {
  const shown = relationshipIsPublic(r, today);
  return {
    id: r.id, slug: r.slug, name: r.name, logo: r.logo?.url ?? null, description: r.description,
    relationship: shown ? r.relationship : null, relationship_verified: shown, published: r.published,
    assets: r.assets.map((a) => ({ kind: a.kind, title: a.title, url: a.media?.url ?? a.url ?? '' })).filter((a) => a.url),
  };
}

const KINDS = ['datasheet', 'certificate', 'warranty', 'catalog', 'video'] as const;
const Asset = z.object({
  id: z.string().min(1).max(64).optional(),
  kind: z.enum(KINDS, { message: 'Tipo de documento no válido' }),
  title: z.string().trim().min(2, 'Cada documento necesita un título').max(120),
  media_id: z.string().min(1).max(64).nullable(),
  url: z.string().trim().max(500).regex(/^https:\/\/[^\s]+$/, 'El enlace debe empezar con https://').nullable(),
}).superRefine((a, ctx) => {
  if (!a.media_id && !a.url) ctx.addIssue({ code: 'custom', path: ['url'], message: `«${a.title}»: carga un PDF o indica un enlace.` });
  if (a.kind === 'video' && !a.url) ctx.addIssue({ code: 'custom', path: ['url'], message: `«${a.title}»: un video necesita su enlace (YouTube, Vimeo…).` });
});

export const BrandSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  slug: z.string().trim().min(2, 'El identificador es obligatorio').max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Identificador: solo minúsculas, números y guiones'),
  name: z.string().trim().min(2, 'El nombre es obligatorio').max(80),
  logo_id: z.string().min(1).max(64).nullable(),
  description: z.string().trim().max(600).nullable(),
  relationship: z.string().trim().max(80).nullable(),
  relationship_verified: z.boolean(),
  relationship_doc_id: z.string().min(1).max(64).nullable(),
  relationship_valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de vigencia no válida').nullable(),
  published: z.boolean(),
  sort: z.number().int('El orden debe ser un número entero').min(0).max(9999),
  assets: z.array(Asset).max(30, 'Máximo 30 documentos por marca'),
}).superRefine((b, ctx) => {
  const err = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (b.relationship_verified && !b.relationship) err('relationship', 'Indica la relación comercial que verificaste (p. ej. «Distribuidor autorizado»).');
  if (b.relationship_verified && !b.relationship_doc_id) err('relationship_doc_id', 'Para verificar la relación, carga el documento de respaldo (contrato o carta del fabricante).');
});

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
const optStr = (fd: FormData, k: string) => str(fd, k) || null;

/** FormData del panel → BrandInput validado. Los archivos nuevos se resuelven fuera (necesitan el almacén). */
export function parseBrandForm(fd: FormData): { data: BrandInput } | { error: string } {
  const name = str(fd, 'name');
  const col = (k: string) => fd.getAll(`asset.${k}`).map((v) => String(v).trim());
  const kinds = col('kind'), titles = col('title'), mids = col('media_id'), urls = col('url'), ids = col('id');
  const assets = kinds.map((kind, i) => ({ id: ids[i] || undefined, kind, title: titles[i] ?? '', media_id: mids[i] || null, url: urls[i] || null }))
    .filter((a) => a.title || a.media_id || a.url);
  const sortRaw = str(fd, 'sort');
  const raw = {
    id: optStr(fd, 'id') ?? undefined,
    slug: str(fd, 'slug') || slugify(name),
    name,
    logo_id: optStr(fd, 'logo_id'),
    description: optStr(fd, 'description'),
    relationship: optStr(fd, 'relationship'),
    relationship_verified: fd.get('relationship_verified') === 'on',
    relationship_doc_id: optStr(fd, 'relationship_doc_id'),
    relationship_valid_until: optStr(fd, 'relationship_valid_until'),
    published: fd.get('published') === 'on',
    sort: sortRaw === '' ? 0 : Number(sortRaw),
    assets,
  };
  const p = BrandSchema.safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0];
    if (i?.path[0] === 'assets' && typeof i.path[1] === 'number' && !i.message.startsWith('«')) return { error: `Documento ${i.path[1] + 1}: ${i.message}` };
    return { error: i?.message ?? 'Datos no válidos' };
  }
  return { data: p.data as BrandInput };
}
