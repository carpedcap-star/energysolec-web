import { z } from 'zod';
import type { MediaRef, Project, ProjectInput, ProjectRecord } from '../data/types';
import { PROVINCES } from '../ecuador';
import { parseNumber, slugify } from './catalog';

/**
 * Lógica pura de proyectos (regla de negocio 3): enmascarado de lo no autorizado y validación del formulario del panel.
 * La base de datos impone lo mismo (0003_project_privacy.sql); esto da mensajes claros y protege el modo de desarrollo.
 */

/** Ecuador continental y Galápagos. */
export const ECUADOR_BOUNDS = { minLat: -5.1, maxLat: 1.7, minLng: -92.1, maxLng: -75.1 };
export const PROJECT_MEDIA_LIMITS = { gallery: 20 };

/**
 * Único camino de un proyecto hacia lo público: cliente, coordenadas, ahorro y testimonio
 * solo salen con su bandera. Las URL de medios se resuelven antes (dependen del almacén).
 */
export function toPublicProject(r: ProjectRecord): Project {
  const { client_name_authorized, financials_authorized, testimonial_verified, updated_at: _u, cover, gallery, ...base } = r;
  return {
    ...base,
    client_name: client_name_authorized ? r.client_name : null,
    lat: r.location_authorized ? r.lat : null,
    lng: r.location_authorized ? r.lng : null,
    annual_savings_usd: financials_authorized ? r.annual_savings_usd : null,
    testimonial: testimonial_verified ? r.testimonial : null,
    testimonial_author: testimonial_verified ? r.testimonial_author : null,
    cover: cover?.url ?? null,
    gallery: gallery.map((m: MediaRef) => m.url),
  };
}

const PROVINCE_NAMES = PROVINCES.map((p) => p.name) as [string, ...string[]];
const nonNeg = (label: string) => z.number({ message: `${label}: ingresa un número` }).min(0, `${label}: no puede ser negativo`).max(1e12).nullable();
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil' }).format(new Date());
const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const ProjectSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  slug: z.string().trim().min(2, 'El identificador de la URL es obligatorio').max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'URL: solo minúsculas, números y guiones'),
  title: z.string().trim().min(3, 'El título es obligatorio').max(160),
  client_name: z.string().trim().max(160).nullable(),
  client_name_authorized: z.boolean(),
  segment: z.enum(['residencial', 'comercial', 'industrial'], { message: 'Elige un segmento' }),
  industry: z.string().trim().max(80).nullable(),
  province: z.enum(PROVINCE_NAMES, { message: 'Provincia no válida' }).nullable(),
  city: z.string().trim().max(80).nullable(),
  lat: z.number({ message: 'Latitud: ingresa un número' }).nullable(),
  lng: z.number({ message: 'Longitud: ingresa un número' }).nullable(),
  location_authorized: z.boolean(),
  capacity_kwp: nonNeg('Capacidad'),
  inverter_kw: nonNeg('Potencia de inversores'),
  panel_count: z.number({ message: 'Paneles: ingresa un número entero' }).int('El número de paneles debe ser entero').min(0, 'Paneles: no puede ser negativo').max(10_000_000).nullable(),
  installation_type: z.string().trim().max(60).nullable(),
  technology: z.array(z.string().trim().min(1).max(60)).max(15),
  annual_generation_kwh: nonNeg('Generación anual'),
  generation_is_measured: z.boolean(),
  annual_savings_usd: nonNeg('Ahorro anual'),
  financials_authorized: z.boolean(),
  co2_avoided_t: nonNeg('CO₂ evitado'),
  executed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de ejecución no válida').nullable(),
  status: z.enum(['en_desarrollo', 'en_construccion', 'operativo', 'finalizado']),
  description: z.string().trim().max(5000).nullable(),
  testimonial: z.string().trim().max(1200).nullable(),
  testimonial_author: z.string().trim().max(160).nullable(),
  testimonial_verified: z.boolean(),
  published: z.boolean(),
  featured: z.boolean(),
  cover_id: z.string().min(1).max(64).nullable(),
  gallery_ids: z.array(z.string().min(1).max(64)).max(PROJECT_MEDIA_LIMITS.gallery, `Máximo ${PROJECT_MEDIA_LIMITS.gallery} fotos en la galería`),
}).superRefine((p, ctx) => {
  const err = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  const B = ECUADOR_BOUNDS;
  if ((p.lat == null) !== (p.lng == null)) err('lat', 'Ingresa latitud y longitud juntas.');
  if (p.lat != null && p.lng != null && (p.lat < B.minLat || p.lat > B.maxLat || p.lng < B.minLng || p.lng > B.maxLng))
    err('lat', 'Las coordenadas están fuera del Ecuador. Revisa el signo: en Ecuador la longitud es negativa (oeste).');
  if (p.location_authorized && (p.lat == null || p.lng == null)) err('location_authorized', 'Para mostrar el proyecto en el mapa ingresa sus coordenadas.');
  if (p.client_name_authorized && !p.client_name) err('client_name_authorized', 'Marcaste el nombre del cliente como autorizado, pero no lo ingresaste.');
  if (p.testimonial_verified && !(p.testimonial && p.testimonial_author)) err('testimonial_verified', 'Un testimonio verificado necesita el texto y su autor.');
  if (p.generation_is_measured && p.annual_generation_kwh == null) err('generation_is_measured', 'Marcaste la generación como medida, pero no ingresaste el valor.');
  if (p.featured && !p.published) err('featured', 'Solo un proyecto publicado puede destacarse en la portada.');
  if (p.executed_on && (p.status === 'finalizado' || p.status === 'operativo') && p.executed_on > today()) err('executed_on', 'Un proyecto finalizado u operativo no puede tener fecha de ejecución futura.');
  // El título y la URL son públicos: no pueden revelar al cliente si su nombre no está autorizado.
  if (p.published && p.client_name && !p.client_name_authorized) {
    const c = norm(p.client_name);
    if (c.length >= 3 && (norm(p.title).includes(c) || p.slug.includes(slugify(p.client_name))))
      err('title', 'El título o la URL contienen el nombre del cliente, que no está autorizado. Usa un título genérico (p. ej. «Empacadora en Guayas, 250 kWp») o registra la autorización.');
  }
});

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.trim() : ''; };
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string) => { const n = parseNumber(str(fd, k)); return n; };

/** Convierte el FormData del panel en un ProjectInput validado. Devuelve el primer error legible. */
export function parseProjectForm(fd: FormData): { data: ProjectInput } | { error: string } {
  const title = str(fd, 'title');
  const raw = {
    id: optStr(fd, 'id') ?? undefined,
    slug: str(fd, 'slug') || slugify(title),
    title,
    client_name: optStr(fd, 'client_name'),
    client_name_authorized: fd.get('client_name_authorized') === 'on',
    segment: str(fd, 'segment'),
    industry: optStr(fd, 'industry'),
    province: optStr(fd, 'province'),
    city: optStr(fd, 'city'),
    lat: num(fd, 'lat'),
    lng: num(fd, 'lng'),
    location_authorized: fd.get('location_authorized') === 'on',
    capacity_kwp: num(fd, 'capacity_kwp'),
    inverter_kw: num(fd, 'inverter_kw'),
    panel_count: num(fd, 'panel_count'),
    installation_type: optStr(fd, 'installation_type'),
    technology: [...new Set(str(fd, 'technology').split(/[,\n]/).map((s) => s.trim()).filter(Boolean))],
    annual_generation_kwh: num(fd, 'annual_generation_kwh'),
    generation_is_measured: fd.get('generation_is_measured') === 'on',
    annual_savings_usd: num(fd, 'annual_savings_usd'),
    financials_authorized: fd.get('financials_authorized') === 'on',
    co2_avoided_t: num(fd, 'co2_avoided_t'),
    executed_on: optStr(fd, 'executed_on'),
    status: str(fd, 'status') || 'finalizado',
    description: optStr(fd, 'description'),
    testimonial: optStr(fd, 'testimonial'),
    testimonial_author: optStr(fd, 'testimonial_author'),
    testimonial_verified: fd.get('testimonial_verified') === 'on',
    published: fd.get('published') === 'on',
    featured: fd.get('featured') === 'on',
    cover_id: optStr(fd, 'cover_id'),
    gallery_ids: fd.getAll('gallery_ids').map(String).filter(Boolean),
  };
  const p = ProjectSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
  return { data: p.data as ProjectInput };
}

/** Acepta «-2.1894, -79.8891» tal como lo copia Google Maps. */
export function parseLatLng(s: string): { lat: number; lng: number } | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}
