import { z } from 'zod';
import type { BlogPost, BlogPostInput, BlogPostRecord } from '../data/types';
import { markdownToText, paragraphsText } from '../markdown';
import { slugify } from './catalog';

/** Categorías del blog (especificación, sección 14). */
export const BLOG_CATEGORIES = [
  'Energía solar residencial', 'Energía solar industrial', 'Almacenamiento energético', 'Eficiencia energética',
  'Regulación eléctrica ecuatoriana', 'Innovación tecnológica', 'Casos de éxito', 'Guías para instaladores',
  'Retorno de inversión', 'Movilidad eléctrica',
].map((name) => ({ slug: slugify(name), name }));

export type PostStatus = 'borrador' | 'programado' | 'publicado';
export const postStatus = (p: Pick<BlogPostRecord, 'published' | 'published_at'>, now = Date.now()): PostStatus =>
  !p.published || !p.published_at ? 'borrador' : Date.parse(p.published_at) > now ? 'programado' : 'publicado';
export const isLive = (p: Pick<BlogPostRecord, 'published' | 'published_at'>, now = Date.now()) => postStatus(p, now) === 'publicado';

/** Extracto: el escrito o las primeras ~160 letras del cuerpo, cortadas en palabra completa. */
export function excerptOf(p: Pick<BlogPostRecord, 'excerpt' | 'body_md'>, max = 160) {
  if (p.excerpt) return p.excerpt;
  const t = paragraphsText(p.body_md) || markdownToText(p.body_md);
  return t.length <= max ? t : `${t.slice(0, t.lastIndexOf(' ', max)).replace(/[,.;:]$/, '')}…`;
}

export const toPublicPost = (r: BlogPostRecord): BlogPost => ({
  slug: r.slug, title: r.title, excerpt: excerptOf(r), body_md: r.body_md, category: r.category, cover: r.cover?.url ?? null,
  author: r.author, published_at: r.published_at!, seo_title: r.seo_title, seo_description: r.seo_description,
});

// Fechas: <input type="datetime-local"> en hora de Ecuador continental (UTC−5, sin horario de verano).
export const fromLocalInput = (v: string) => new Date(`${v}:00-05:00`).toISOString();
export const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};

const CATEGORY_NAMES = BLOG_CATEGORIES.map((c) => c.name) as [string, ...string[]];
export const PostSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  slug: z.string().trim().min(3, 'La URL es obligatoria').max(100).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'URL: solo minúsculas, números y guiones'),
  title: z.string().trim().min(5, 'El título es obligatorio (mínimo 5 caracteres)').max(140, 'Título: máximo 140 caracteres'),
  excerpt: z.string().trim().max(300, 'Extracto: máximo 300 caracteres').nullable(),
  body_md: z.string().trim().min(80, 'El artículo es demasiado corto (mínimo 80 caracteres).').max(60_000, 'El artículo supera el máximo de 60 000 caracteres.'),
  category: z.enum(CATEGORY_NAMES, { message: 'Elige una categoría' }),
  seo_title: z.string().trim().max(60, 'Título para buscadores: máximo 60 caracteres').nullable(),
  seo_description: z.string().trim().max(160, 'Descripción para buscadores: máximo 160 caracteres').nullable(),
  published: z.boolean(),
  published_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de publicación no válida').nullable(),
  cover_id: z.string().min(1).max(64).nullable(),
});

const str = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : ''; };

/** FormData del panel → BlogPostInput. Publicar sin fecha usa «ahora»; con fecha futura queda programado. */
export function parsePostForm(fd: FormData, now = new Date()): { data: BlogPostInput } | { error: string } {
  const title = str(fd, 'title');
  const when = str(fd, 'published_at');
  if (when && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return { error: 'Fecha de publicación no válida.' };
  const published = fd.get('published') === 'on';
  const raw = {
    id: str(fd, 'id') || undefined,
    slug: str(fd, 'slug') || slugify(title),
    title,
    excerpt: str(fd, 'excerpt') || null,
    body_md: str(fd, 'body_md'),
    category: str(fd, 'category'),
    seo_title: str(fd, 'seo_title') || null,
    seo_description: str(fd, 'seo_description') || null,
    published,
    published_at: when ? fromLocalInput(when) : published ? now.toISOString() : null,
    cover_id: str(fd, 'cover_id') || null,
  };
  const p = PostSchema.safeParse(raw);
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
  return { data: p.data as BlogPostInput };
}
