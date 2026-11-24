'use client';
import { useActionState, useEffect, useId, useRef, useState, startTransition } from 'react';
import { savePostAction, uploadPostImageAction } from '../../actions';
import type { BlogPostRecord, MediaRef } from '@/lib/data/types';
import { BLOG_CATEGORIES, excerptOf, toLocalInput } from '@/lib/services/blog';
import { slugify, UPLOAD_LIMITS } from '@/lib/services/catalog';
import { readingMinutes, renderMarkdown } from '@/lib/markdown';
import { Field, FILE_INPUT, IconBtn, mb, Section } from '../form-ui';

type Tool = { label: string; text: string; apply: (sel: string) => { before: string; inner: string; after: string; line?: boolean } };
const TOOLS: Tool[] = [
  { label: 'Negrita', text: 'B', apply: (s) => ({ before: '**', inner: s || 'texto', after: '**' }) },
  { label: 'Cursiva', text: 'I', apply: (s) => ({ before: '_', inner: s || 'texto', after: '_' }) },
  { label: 'Título de sección', text: 'H2', apply: (s) => ({ before: '## ', inner: s || 'Título de sección', after: '', line: true }) },
  { label: 'Subtítulo', text: 'H3', apply: (s) => ({ before: '### ', inner: s || 'Subtítulo', after: '', line: true }) },
  { label: 'Lista', text: '•', apply: (s) => ({ before: '- ', inner: s || 'elemento', after: '', line: true }) },
  { label: 'Lista numerada', text: '1.', apply: (s) => ({ before: '1. ', inner: s || 'paso', after: '', line: true }) },
  { label: 'Cita', text: '❝', apply: (s) => ({ before: '> ', inner: s || 'cita', after: '', line: true }) },
  { label: 'Enlace', text: '🔗', apply: (s) => ({ before: '[', inner: s || 'texto del enlace', after: '](https://)' }) },
];

export function PostForm({ post: p }: { post: BlogPostRecord | null }) {
  const [state, dispatch, pending] = useActionState(savePostAction, null);
  const [clientError, setClientError] = useState('');
  const [title, setTitle] = useState(p?.title ?? '');
  const [body, setBody] = useState(p?.body_md ?? '');
  const [excerpt, setExcerpt] = useState(p?.excerpt ?? '');
  const [seoTitle, setSeoTitle] = useState(p?.seo_title ?? '');
  const [seoDesc, setSeoDesc] = useState(p?.seo_description ?? '');
  const [published, setPublished] = useState(p?.published ?? false);
  const [when, setWhen] = useState(toLocalInput(p?.published_at ?? null));
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [cover, setCover] = useState<MediaRef | null>(p?.cover ?? null);
  const [newCover, setNewCover] = useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();
  const f = (k: string) => `${uid}-${k}`;
  const error = clientError || (pending ? '' : state?.error);
  useEffect(() => { if (error) errRef.current?.focus(); }, [error, state]);

  function insert(t: ReturnType<Tool['apply']>) {
    const el = ta.current; if (!el) return;
    const [a, b] = [el.selectionStart, el.selectionEnd];
    let before = body.slice(0, a), after = body.slice(b);
    if (t.line && before && !before.endsWith('\n')) before += '\n'; // los bloques empiezan en línea nueva
    if (t.line && after && !after.startsWith('\n')) after = '\n' + after;
    const next = before + t.before + t.inner + t.after + after;
    setBody(next);
    requestAnimationFrame(() => { el.focus(); const s = before.length + t.before.length; el.setSelectionRange(s, s + t.inner.length); });
  }
  async function insertImage(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > UPLOAD_LIMITS.image) return setClientError(`"${file.name}": usa JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
    const alt = window.prompt('Describe la imagen (texto alternativo y pie de foto):', '')?.trim();
    if (alt === undefined) return;
    setUploading(true); setClientError('');
    const fd = new FormData(); fd.append('image', file); fd.append('alt', alt);
    const r = await uploadPostImageAction(fd).catch(() => ({ error: 'No se pudo subir la imagen.' } as { url?: string; error?: string }));
    setUploading(false);
    if (r.error || !r.url) return setClientError(r.error ?? 'No se pudo subir la imagen.');
    insert({ before: `![${alt.replace(/[\]\n]/g, ' ')}](`, inner: r.url, after: ')', line: true });
  }
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError('');
    const fd = new FormData(e.currentTarget);
    fd.set('body_md', body);
    if (newCover) fd.append('new_cover', newCover.file);
    startTransition(() => dispatch(fd));
  }

  const autoExcerpt = excerptOf({ excerpt: excerpt || null, body_md: body });
  const future = when && new Date(`${when}:00-05:00`).getTime() > Date.now();
  const status = !published ? 'Borrador: no es visible en el sitio.' : future ? `Programado: se publicará el ${new Date(`${when}:00-05:00`).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'long', timeStyle: 'short' })}.` : when ? 'Publicado.' : 'Se publicará al guardar.';
  const count = (v: string, max: number) => <span className={`text-[11px] tabular-nums ${v.length > max ? 'font-semibold text-red-700' : 'text-muted'}`}>{v.length}/{max}</span>;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Section title="Artículo">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('title')} label="Título *" className="sm:col-span-2">
            <input id={f('title')} name="title" required maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </Field>
          <Field id={f('slug')} label="URL" hint={`/blog/${slugify(title) || '…'} si lo dejas vacío.`}>
            <input id={f('slug')} name="slug" maxLength={100} defaultValue={p?.slug} placeholder={slugify(title)} className="input" />
          </Field>
          <Field id={f('cat')} label="Categoría *">
            <select id={f('cat')} name="category" defaultValue={p?.category ?? ''} className="input">
              <option value="" disabled>Elige una categoría</option>
              {BLOG_CATEGORIES.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <div className="flex items-baseline justify-between"><label htmlFor={f('exc')} className="label">Extracto</label>{count(excerpt, 300)}</div>
            <textarea id={f('exc')} name="excerpt" rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder={autoExcerpt} className="input" aria-describedby={f('exc-h')} />
            <p id={f('exc-h')} className="mt-1 text-xs text-muted">Resumen en el listado. Si lo dejas vacío se toma el inicio del artículo.</p>
          </div>
        </div>
      </Section>

      <Section title="Contenido" intro="Escribe en párrafos. Usa títulos de sección para ordenar el texto. Cifras, normas y tarifas siempre con su fuente.">
        <div role="tablist" aria-label="Modo del editor" className="mb-3 inline-flex rounded-full border border-line p-1 text-sm">
          {(['write', 'preview'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} aria-controls={f(`panel-${t}`)} onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 ${tab === t ? 'bg-brand-dark text-white' : 'text-muted hover:text-ink'}`}>{t === 'write' ? 'Escribir' : 'Vista previa'}</button>
          ))}
        </div>
        <div id={f('panel-write')} role="tabpanel" hidden={tab !== 'write'}>
          <div className="mb-2 flex flex-wrap gap-1" role="toolbar" aria-label="Formato">
            {TOOLS.map((t) => (
              <button key={t.label} type="button" title={t.label} aria-label={t.label} onClick={() => insert(t.apply(body.slice(ta.current?.selectionStart ?? 0, ta.current?.selectionEnd ?? 0)))}
                className="h-9 min-w-9 rounded-lg border border-line bg-white px-2 text-sm font-semibold hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-accent">{t.text}</button>
            ))}
            <label className={`inline-flex h-9 cursor-pointer items-center rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:border-ink focus-within:outline focus-within:outline-2 focus-within:outline-brand-accent ${uploading ? 'opacity-50' : ''}`}>
              {uploading ? 'Subiendo…' : 'Insertar imagen'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; insertImage(x); }} />
            </label>
          </div>
          <label htmlFor={f('body')} className="sr-only">Texto del artículo</label>
          <textarea id={f('body')} ref={ta} value={body} onChange={(e) => setBody(e.target.value)} rows={18} spellCheck lang="es"
            className="input font-mono text-sm leading-relaxed" placeholder={'## Título de sección\n\nEscribe aquí. **negrita**, _cursiva_, [enlace](https://…)'} />
        </div>
        <div id={f('panel-preview')} role="tabpanel" hidden={tab !== 'preview'} className="min-h-40 rounded-xl border border-line bg-white p-5 sm:p-8">
          {body.trim() ? <article className="max-w-none">{renderMarkdown(body)}</article> : <p className="text-sm text-muted">Aún no hay contenido.</p>}
        </div>
        <p className="mt-2 text-xs text-muted">{body.trim().split(/\s+/).filter(Boolean).length} palabras · {readingMinutes(body)} min de lectura</p>
      </Section>

      <Section title="Imagen de portada" intro="Horizontal, mínimo 1200 px de ancho. También se usa al compartir en redes.">
        {cover && !newCover && <input type="hidden" name="cover_id" value={cover.id} />}
        <div className="flex flex-wrap items-end gap-4">
          {(newCover || cover) ? (
            <div className={`w-56 rounded-xl border bg-white p-2 ${newCover ? 'border-dashed border-brand-accent' : 'border-line'}`}>
              <img src={newCover?.url ?? cover!.url} alt={`Portada de ${title || 'artículo'}`} className="aspect-[16/9] w-full rounded-lg object-cover" />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>{newCover ? `Nueva · ${mb(newCover.file.size)}` : 'Actual'}</span>
                <IconBtn label={newCover ? 'Descartar la portada nueva' : 'Quitar la portada'} onClick={() => { if (newCover) { URL.revokeObjectURL(newCover.url); setNewCover(null); } else setCover(null); }}>✕</IconBtn>
              </div>
            </div>
          ) : <p className="text-sm text-muted">Sin portada.</p>}
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={f('cover')} className="label">{cover || newCover ? 'Reemplazar portada' : 'Cargar portada'}</label>
            <input id={f('cover')} type="file" accept="image/jpeg,image/png,image/webp" className={FILE_INPUT} onChange={(e) => {
              const x = e.target.files?.[0]; e.target.value = '';
              if (!x) return;
              if (!/^image\/(jpeg|png|webp)$/.test(x.type) || x.size > UPLOAD_LIMITS.image) return setClientError(`"${x.name}": usa JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
              setClientError(''); if (newCover) URL.revokeObjectURL(newCover.url); setNewCover({ file: x, url: URL.createObjectURL(x) });
            }} />
          </div>
        </div>
      </Section>

      <Section title="Buscadores (SEO)" intro="Opcional: si los dejas vacíos se usan el título y el extracto.">
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between"><label htmlFor={f('st')} className="label">Título para buscadores</label>{count(seoTitle, 60)}</div>
            <input id={f('st')} name="seo_title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={title} className="input" />
          </div>
          <div>
            <div className="flex items-baseline justify-between"><label htmlFor={f('sd')} className="label">Descripción para buscadores</label>{count(seoDesc, 160)}</div>
            <textarea id={f('sd')} name="seo_description" rows={2} value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} placeholder={autoExcerpt} className="input" />
          </div>
          <div className="rounded-xl border border-line bg-white p-4" aria-label="Vista previa en buscadores">
            <p className="truncate text-xs text-muted">energysolec.com › blog › {slugify(title) || '…'}</p>
            <p className="mt-1 truncate text-lg text-[#1a0dab]">{seoTitle || title || 'Título del artículo'}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{seoDesc || autoExcerpt || 'Descripción del artículo.'}</p>
          </div>
        </div>
      </Section>

      <Section title="Publicación">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-start gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="published" checked={published} onChange={(e) => setPublished(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span><b>Publicar</b></span>
          </label>
          <Field id={f('when')} label="Fecha de publicación" hint="Hora de Ecuador. Una fecha futura programa el artículo.">
            <input id={f('when')} name="published_at" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input" />
          </Field>
        </div>
        <p className={`mt-3 rounded-xl px-4 py-2 text-sm ${!published ? 'bg-surface text-muted' : future ? 'bg-amber-50 text-amber-950' : 'bg-green-50 text-green-900'}`} aria-live="polite">{status}</p>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending || uploading}>{pending ? 'Guardando…' : p ? 'Guardar cambios' : 'Crear artículo'}</button>
      </div>
    </form>
  );
}
