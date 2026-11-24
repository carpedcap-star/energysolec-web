'use client';
import { useActionState, useEffect, useId, useRef, useState, startTransition } from 'react';
import { resetContentBlockAction, saveContentBlockAction } from '../../actions';
import type { BlockData, BlockDef, FieldSpec, ItemsField, TextField } from '@/content/blocks';
import type { MediaRef } from '@/lib/data/types';
import { UPLOAD_LIMITS } from '@/lib/services/catalog';
import { FILE_INPUT, IconBtn, mb, Section } from '../form-ui';

type Props = { def: BlockDef; data: BlockData; media: Record<string, MediaRef>; hasRow: boolean; isPlaceholder: boolean; published: boolean };

export function BlockForm({ def, data, media, hasRow, isPlaceholder, published }: Props) {
  const [state, dispatch, pending] = useActionState(saveContentBlockAction.bind(null, def.page, def.slot), null);
  const [clientError, setClientError] = useState('');
  const [files, setFiles] = useState<Record<string, { file: File; url: string } | null>>({});
  const errRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();
  const error = clientError || (pending ? '' : state?.error);
  useEffect(() => { if (error) errRef.current?.focus(); }, [error, state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError('');
    const fd = new FormData(e.currentTarget);
    for (const [k, v] of Object.entries(files)) if (v) fd.append(`${k}__file`, v.file);
    startTransition(() => dispatch(fd));
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
        <Section title="Contenido">
          <div className="space-y-5">
            {def.fields.map((f) => (
              <FieldInput key={f.key} f={f} id={`${uid}-${f.key}`} value={data[f.key]} current={typeof data[f.key] === 'string' ? media[data[f.key] as string] ?? null : null}
                file={files[f.key] ?? null} setFile={(v) => setFiles((x) => ({ ...x, [f.key]: v }))} onError={setClientError} />
            ))}
          </div>
        </Section>
        <Section title="Publicación">
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="published" defaultChecked={published} className="mt-0.5 h-4 w-4" />
              <span><b>Publicar</b><span className="block text-muted">Sin marcar, se guarda como borrador y la web sigue mostrando el texto base.</span></span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="is_placeholder" defaultChecked={isPlaceholder} className="mt-0.5 h-4 w-4" />
              <span><b>Provisional</b><span className="block text-muted">{def.publicPlaceholder ? 'La página mostrará la etiqueta «Contenido provisional». Desmárcalo solo con información oficial.' : 'Solo se indica en el panel.'}</span></span>
            </label>
          </div>
        </Section>
        <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
          {error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{error}</p>}
          <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
      {hasRow && <ResetBlock def={def} />}
    </>
  );
}

function FieldInput({ f, id, value, current, file, setFile, onError }: {
  f: FieldSpec; id: string; value: unknown; current: MediaRef | null;
  file: { file: File; url: string } | null; setFile: (v: { file: File; url: string } | null) => void; onError: (m: string) => void;
}) {
  const hint = f.hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{f.hint}</p>;
  if (f.type === 'text' || f.type === 'textarea') return <TextInput f={f} id={id} name={f.key} value={String(value ?? '')} hint={hint} />;
  if (f.type === 'list') {
    const v = Array.isArray(value) ? (value as string[]).join('\n') : '';
    return (
      <div>
        <label htmlFor={id} className="label">{f.label}</label>
        <textarea id={id} name={f.key} defaultValue={v} rows={Math.min(Math.max(f.maxItems, 3), 10)} className="input" aria-describedby={f.hint ? `${id}-hint` : undefined} />
        {hint}
      </div>
    );
  }
  if (f.type === 'items') return <ItemsInput f={f} id={id} value={Array.isArray(value) ? (value as Record<string, string>[]) : []} hint={hint} />;
  // Imagen
  return <ImageInput f={f} id={id} current={current} file={file} setFile={setFile} onError={onError} hint={hint} />;
}

function TextInput({ f, id, name, value, hint, compact }: { f: TextField; id: string; name: string; value: string; hint?: React.ReactNode; compact?: boolean }) {
  const [v, setV] = useState(value);
  const over = v.length > f.max;
  const Tag = f.type === 'textarea' ? 'textarea' : 'input';
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className={compact ? 'mb-1 block text-xs text-muted' : 'label'}>{f.label}{f.required ? ' *' : ''}</label>
        <span className={`text-[11px] tabular-nums ${over ? 'font-semibold text-red-700' : 'text-muted'}`} aria-live="polite">{v.length}/{f.max}</span>
      </div>
      <Tag id={id} name={name} value={v} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value)}
        rows={f.type === 'textarea' ? Math.min(8, Math.max(2, Math.ceil(f.max / 120))) : undefined}
        className={`input ${over ? '!border-red-400' : ''}`} aria-invalid={over || undefined} aria-describedby={f.hint ? `${id}-hint` : undefined} />
      {hint}
    </div>
  );
}

function ItemsInput({ f, id, value, hint }: { f: ItemsField; id: string; value: Record<string, string>[]; hint: React.ReactNode }) {
  // Claves estables para que React no mezcle filas al reordenar o quitar.
  const [rows, setRows] = useState(() => value.map((v, i) => ({ k: i, v })));
  const [next, setNext] = useState(value.length);
  const fixed = f.minItems === f.maxItems;
  const move = (i: number, d: -1 | 1) => setRows((r) => { const y = [...r]; [y[i], y[i + d]] = [y[i + d], y[i]]; return y; });
  return (
    <fieldset>
      <legend className="label">{f.label}</legend>
      {hint}
      <ol className="mt-3 space-y-3">
        {rows.map((row, i) => (
          <li key={row.k} className="rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{f.itemLabel} {i + 1}</span>
              <span className="flex gap-1">
                <IconBtn label={`Subir ${f.itemLabel.toLowerCase()} ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</IconBtn>
                <IconBtn label={`Bajar ${f.itemLabel.toLowerCase()} ${i + 1}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</IconBtn>
                {!fixed && <IconBtn label={`Quitar ${f.itemLabel.toLowerCase()} ${i + 1}`} disabled={rows.length <= f.minItems} onClick={() => setRows((r) => r.filter((x) => x.k !== row.k))}>✕</IconBtn>}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1.6fr]">
              {f.fields.map((s) => <TextInput key={s.key} f={s} id={`${id}-${row.k}-${s.key}`} name={`${f.key}.${s.key}`} value={row.v[s.key] ?? ''} compact />)}
            </div>
          </li>
        ))}
      </ol>
      {!fixed && (
        <button type="button" className="btn-ghost mt-3 !py-2" disabled={rows.length >= f.maxItems}
          onClick={() => { setRows((r) => [...r, { k: next, v: {} }]); setNext((n) => n + 1); }}>
          Agregar {f.itemLabel.toLowerCase()} ({rows.length}/{f.maxItems})
        </button>
      )}
    </fieldset>
  );
}

function ImageInput({ f, id, current, file, setFile, onError, hint }: {
  f: FieldSpec; id: string; current: MediaRef | null; file: { file: File; url: string } | null;
  setFile: (v: { file: File; url: string } | null) => void; onError: (m: string) => void; hint: React.ReactNode;
}) {
  const [kept, setKept] = useState(current);
  const shown = file?.url ?? kept?.url;
  return (
    <div>
      <p className="label" id={`${id}-label`}>{f.label}</p>
      {kept && !file && <input type="hidden" name={f.key} value={kept.id} />}
      {shown ? (
        <div className={`max-w-sm rounded-xl border bg-white p-2 ${file ? 'border-dashed border-brand-accent' : 'border-line'}`}>
          <img src={shown} alt={file ? `Nueva imagen ${file.file.name}` : `Imagen actual de «${f.label}»`} className="aspect-[16/9] w-full rounded-lg object-cover" />
          <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
            <span>{file ? `Nueva · ${mb(file.file.size)}` : 'Actual'}</span>
            <IconBtn label={file ? 'Descartar la imagen nueva' : 'Quitar la imagen'} onClick={() => { if (file) { URL.revokeObjectURL(file.url); setFile(null); } else setKept(null); }}>✕</IconBtn>
          </div>
        </div>
      ) : <p className="text-sm text-muted">Sin imagen.</p>}
      <label htmlFor={id} className="label mt-3">{shown ? 'Reemplazar imagen' : 'Cargar imagen'}</label>
      <input id={id} type="file" accept="image/jpeg,image/png,image/webp" className={FILE_INPUT} aria-describedby={f.hint ? `${id}-hint` : undefined}
        onChange={(e) => {
          const x = e.target.files?.[0]; e.target.value = '';
          if (!x) return;
          if (!/^image\/(jpeg|png|webp)$/.test(x.type) || x.size > UPLOAD_LIMITS.image) return onError(`"${x.name}": usa JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
          onError(''); if (file) URL.revokeObjectURL(file.url); setFile({ file: x, url: URL.createObjectURL(x) });
        }} />
      {hint}
    </div>
  );
}

function ResetBlock({ def }: { def: BlockDef }) {
  const [state, run, pending] = useActionState(resetContentBlockAction.bind(null, def.page, def.slot), null);
  return (
    <section className="card mt-10 p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Restaurar texto base</h2>
      <p className="mt-1 text-sm text-muted">Descarta la versión guardada (publicada o borrador). La página vuelve a mostrar el texto original del sitio.</p>
      <form action={run} onSubmit={(e) => { if (!confirm(`¿Descartar los cambios de «${def.label}» y volver al texto base?`)) e.preventDefault(); }} className="mt-4">
        {state?.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
        <button className="btn-ghost" disabled={pending}>{pending ? 'Restaurando…' : 'Restaurar texto base'}</button>
      </form>
    </section>
  );
}
