import { z } from 'zod';
import type { Segment, Service, ServiceInput, ServiceRecord, ServiceRow } from '../data/types';
import { SERVICES } from '@/content/segments';
import { slugify } from './catalog';

/**
 * Servicios: catálogo base (src/content/segments.ts) + filas de la tabla `services`.
 * Un servicio base sin fila se publica tal como hoy, marcado como provisional; al editarlo se crea su fila.
 * Una fila con published=false oculta el servicio, también si es base.
 */
export function mergeServices(rows: ServiceRow[]): ServiceRecord[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const base: ServiceRecord[] = SERVICES.map((s, i) => {
    const r = bySlug.get(s.slug);
    return r ? { ...r, isBase: true } : {
      id: null, slug: s.slug, name: s.name, summary: null, description: null, benefits: [], scope: [], segments: [],
      cover: null, published: true, sort: (i + 1) * 10, isBase: true,
    };
  });
  const extra = rows.filter((r) => !SERVICES.some((s) => s.slug === r.slug)).map((r) => ({ ...r, isBase: false }));
  return [...base, ...extra].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'es'));
}

export const toPublicService = (r: ServiceRecord): Service => ({
  slug: r.slug, name: r.name, summary: r.summary, description: r.description, benefits: r.benefits, scope: r.scope,
  segments: r.segments, cover: r.cover?.url ?? null, isPlaceholder: !r.description,
});
export const publicServices = (rows: ServiceRow[]) => mergeServices(rows).filter((s) => s.published).map(toPublicService);

const SEGS = ['residencial', 'comercial', 'industrial'] as const;
const lines = (label: string, max: number) => z.array(z.string().trim().min(1).max(200, `${label}: cada línea admite hasta 200 caracteres`)).max(max, `${label}: máximo ${max} líneas`);

export const ServiceSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  slug: z.string().trim().min(2, 'El identificador es obligatorio').max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'URL: solo minúsculas, números y guiones'),
  name: z.string().trim().min(3, 'El nombre es obligatorio').max(90),
  summary: z.string().trim().max(240, 'Resumen: máximo 240 caracteres').nullable(),
  description: z.string().trim().max(4000, 'Descripción: máximo 4000 caracteres').nullable(),
  benefits: lines('Beneficios', 12),
  scope: lines('Alcance', 20),
  segments: z.array(z.enum(SEGS)).max(3),
  cover_id: z.string().min(1).max(64).nullable(),
  published: z.boolean(),
  sort: z.number().int('El orden debe ser un número entero').min(0).max(9999),
}).superRefine((s, ctx) => {
  if ((s.benefits.length || s.scope.length) && !s.description)
    ctx.addIssue({ code: 'custom', path: ['description'], message: 'Agrega la descripción antes de los beneficios o el alcance.' });
});

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : ''; };
const split = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function parseServiceForm(fd: FormData): { data: ServiceInput } | { error: string } {
  const name = str(fd, 'name');
  const sortRaw = str(fd, 'sort');
  const raw = {
    id: str(fd, 'id') || undefined,
    slug: str(fd, 'slug') || slugify(name),
    name,
    summary: str(fd, 'summary') || null,
    description: str(fd, 'description') || null,
    benefits: split(str(fd, 'benefits')),
    scope: split(str(fd, 'scope')),
    segments: fd.getAll('segments').map(String) as Segment[],
    cover_id: str(fd, 'cover_id') || null,
    published: fd.get('published') === 'on',
    sort: sortRaw === '' ? 0 : Number(sortRaw),
  };
  const p = ServiceSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
  return { data: p.data as ServiceInput };
}
