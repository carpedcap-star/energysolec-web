'use client';
import { useActionState, useEffect, useId, useRef, useState, startTransition } from 'react';
import { saveServiceAction } from '../../actions';
import type { MediaRef, ServiceRecord } from '@/lib/data/types';
import { slugify, UPLOAD_LIMITS } from '@/lib/services/catalog';
import { Field, FILE_INPUT, IconBtn, mb, Section } from '../form-ui';

const SEGS = [['residencial', 'Residencial'], ['comercial', 'Comercial'], ['industrial', 'Industrial']] as const;

export function ServiceForm({ service: s }: { service: ServiceRecord | null }) {
  const [state, dispatch, pending] = useActionState(saveServiceAction, null);
  const [clientError, setClientError] = useState('');
  const [name, setName] = useState(s?.name ?? '');
  const [description, setDescription] = useState(s?.description ?? '');
  const [cover, setCover] = useState<MediaRef | null>(s?.cover ?? null);
  const [newCover, setNewCover] = useState<{ file: File; url: string } | null>(null);
  const errRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();
  const f = (k: string) => `${uid}-${k}`;
  const error = clientError || (pending ? '' : state?.error);
  useEffect(() => { if (error) errRef.current?.focus(); }, [error, state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError('');
    const fd = new FormData(e.currentTarget);
    if (newCover) fd.append('new_cover', newCover.file);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
      {s?.id && <input type="hidden" name="id" value={s.id} />}
      {s?.isBase && <input type="hidden" name="base_slug" value={s.slug} />}
      <Section title="Servicio">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
          <Field id={f('name')} label="Nombre *"><input id={f('name')} name="name" required maxLength={90} value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
          <Field id={f('slug')} label="URL" hint={s?.isBase ? 'Servicio del catálogo base: su URL es fija.' : `/servicios/${slugify(name) || '…'} si lo dejas vacío.`}>
            <input id={f('slug')} name="slug" maxLength={80} defaultValue={s?.slug} placeholder={slugify(name)} readOnly={s?.isBase} className={`input ${s?.isBase ? 'bg-surface text-muted' : ''}`} />
          </Field>
          <Field id={f('sort')} label="Orden"><input id={f('sort')} name="sort" type="number" min={0} step={1} defaultValue={s?.sort ?? 100} className="input tabular-nums" /></Field>
          <Field id={f('summary')} label="Resumen" hint="Una o dos líneas. Se usa en el listado y como descripción para buscadores." className="sm:col-span-3">
            <textarea id={f('summary')} name="summary" rows={2} maxLength={240} defaultValue={s?.summary ?? ''} className="input" />
          </Field>
          <fieldset className="sm:col-span-3">
            <legend className="label">Unidades de negocio</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {SEGS.map(([v, l]) => <label key={v} className="flex items-center gap-2"><input type="checkbox" name="segments" value={v} defaultChecked={s?.segments.includes(v)} className="h-4 w-4" />{l}</label>)}
            </div>
          </fieldset>
        </div>
      </Section>

      <Section title="Contenido" intro="Mientras no tenga descripción, la página del servicio se muestra como «Contenido provisional». Usa información validada por Ingeniería.">
        <div className="space-y-4">
          <Field id={f('desc')} label="Descripción">
            <textarea id={f('desc')} name="description" rows={6} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
          </Field>
          <Field id={f('ben')} label="Beneficios" hint="Uno por línea (máximo 12).">
            <textarea id={f('ben')} name="benefits" rows={4} defaultValue={s?.benefits.join('\n')} className="input" />
          </Field>
          <Field id={f('scope')} label="Alcance" hint="Qué incluye el servicio, uno por línea (máximo 20).">
            <textarea id={f('scope')} name="scope" rows={5} defaultValue={s?.scope.join('\n')} className="input" />
          </Field>
          <p className={`rounded-xl px-4 py-2 text-sm ${description.trim() ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-950'}`} aria-live="polite">
            {description.trim() ? 'Con descripción: se publica como contenido definitivo.' : 'Sin descripción: se mostrará como «Contenido provisional».'}
          </p>
        </div>
      </Section>

      <Section title="Imagen">
        {cover && !newCover && <input type="hidden" name="cover_id" value={cover.id} />}
        <div className="flex flex-wrap items-end gap-4">
          {(newCover || cover) ? (
            <div className={`w-56 rounded-xl border bg-white p-2 ${newCover ? 'border-dashed border-brand-accent' : 'border-line'}`}>
              <img src={newCover?.url ?? cover!.url} alt={`Imagen de ${name || 'servicio'}`} className="aspect-[16/10] w-full rounded-lg object-cover" />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>{newCover ? `Nueva · ${mb(newCover.file.size)}` : 'Actual'}</span>
                <IconBtn label={newCover ? 'Descartar la imagen nueva' : 'Quitar la imagen'} onClick={() => { if (newCover) { URL.revokeObjectURL(newCover.url); setNewCover(null); } else setCover(null); }}>✕</IconBtn>
              </div>
            </div>
          ) : <p className="text-sm text-muted">Sin imagen.</p>}
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={f('cover')} className="label">{cover || newCover ? 'Reemplazar imagen' : 'Cargar imagen'}</label>
            <input id={f('cover')} type="file" accept="image/jpeg,image/png,image/webp" className={FILE_INPUT} onChange={(e) => {
              const x = e.target.files?.[0]; e.target.value = '';
              if (!x) return;
              if (!/^image\/(jpeg|png|webp)$/.test(x.type) || x.size > UPLOAD_LIMITS.image) return setClientError(`"${x.name}": usa JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
              setClientError(''); if (newCover) URL.revokeObjectURL(newCover.url); setNewCover({ file: x, url: URL.createObjectURL(x) });
            }} />
          </div>
        </div>
      </Section>

      <Section title="Publicación">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={s?.published ?? true} className="mt-0.5 h-4 w-4" />
          <span><b>Publicado</b><span className="block text-muted">Visible en /servicios.</span></span>
        </label>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : s ? 'Guardar cambios' : 'Crear servicio'}</button>
      </div>
    </form>
  );
}
