'use client';
import { useActionState, useEffect, useId, useRef, useState, startTransition } from 'react';
import { saveBrandAction } from '../../actions';
import { BRAND_ASSET_KINDS, type BrandAssetKind, type BrandRecord, type MediaRef } from '@/lib/data/types';
import { slugify, UPLOAD_LIMITS } from '@/lib/services/catalog';
import { relationshipIsPublic, todayEc } from '@/lib/services/brands';
import { Field, FILE_INPUT, IconBtn, mb, Section } from '../form-ui';

const MAX_REQUEST = 24 * 1024 * 1024;
type Row = { key: number; id?: string; kind: BrandAssetKind; title: string; media: MediaRef | null; url: string; file: File | null };

export function BrandForm({ brand: b }: { brand: BrandRecord | null }) {
  const [state, dispatch, pending] = useActionState(saveBrandAction, null);
  const [clientError, setClientError] = useState('');
  const [name, setName] = useState(b?.name ?? '');
  const [logo, setLogo] = useState<MediaRef | null>(b?.logo ?? null);
  const [newLogo, setNewLogo] = useState<{ file: File; url: string } | null>(null);
  const [relationship, setRelationship] = useState(b?.relationship ?? '');
  const [verified, setVerified] = useState(b?.relationship_verified ?? false);
  const [validUntil, setValidUntil] = useState(b?.relationship_valid_until ?? '');
  const [doc, setDoc] = useState<MediaRef | null>(b?.relationship_doc ?? null);
  const [newDoc, setNewDoc] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>(() => (b?.assets ?? []).map((a, i) => ({ key: i, id: a.id, kind: a.kind, title: a.title, media: a.media, url: a.url ?? '', file: null })));
  const [nextKey, setNextKey] = useState(b?.assets.length ?? 0);
  const errRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();
  const f = (k: string) => `${uid}-${k}`;
  const error = clientError || (pending ? '' : state?.error);
  useEffect(() => { if (error) errRef.current?.focus(); }, [error, state]);

  const hasDoc = !!(doc || newDoc);
  const today = todayEc();
  const shown = relationshipIsPublic({ relationship, relationship_verified: verified, relationship_doc: hasDoc ? ({} as MediaRef) : null, relationship_valid_until: validUntil || null }, today);
  const why = !relationship ? 'sin relación indicada' : !verified ? 'sin verificar' : !hasDoc ? 'falta el documento de respaldo' : validUntil && validUntil < today ? `venció el ${validUntil}` : '';
  const setRow = (key: number, patch: Partial<Row>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setRows((r) => { const y = [...r]; [y[i], y[i + d]] = [y[i + d], y[i]]; return y; });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError('');
    const total = (newLogo?.file.size ?? 0) + (newDoc?.size ?? 0) + rows.reduce((a, r) => a + (r.file?.size ?? 0), 0);
    if (total > MAX_REQUEST) return setClientError(`Los archivos nuevos suman ${mb(total)}; el máximo por guardado es ${mb(MAX_REQUEST)}. Súbelos en varias veces.`);
    const fd = new FormData(e.currentTarget);
    if (newLogo) fd.append('new_logo', newLogo.file);
    if (newDoc) fd.append('new_doc', newDoc);
    for (const r of rows) if (r.file) fd.append(`asset_file.${r.key}`, r.file);
    startTransition(() => dispatch(fd));
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
      {b && <input type="hidden" name="id" value={b.id} />}
      <Section title="Datos de la marca">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
          <Field id={f('name')} label="Nombre *"><input id={f('name')} name="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="input" /></Field>
          <Field id={f('slug')} label="Identificador" hint={`«${slugify(name) || '…'}» si lo dejas vacío.`}><input id={f('slug')} name="slug" maxLength={80} defaultValue={b?.slug} placeholder={slugify(name)} className="input" /></Field>
          <Field id={f('sort')} label="Orden"><input id={f('sort')} name="sort" type="number" min={0} step={1} defaultValue={b?.sort ?? 0} className="input tabular-nums" /></Field>
          <Field id={f('desc')} label="Descripción" hint="Qué fabrica y para qué se usa. Sin afirmaciones sin respaldo del fabricante." className="sm:col-span-3">
            <textarea id={f('desc')} name="description" rows={3} maxLength={600} defaultValue={b?.description ?? ''} className="input" />
          </Field>
        </div>
        <div className="mt-5">
          <p className="label">Logo</p>
          {logo && !newLogo && <input type="hidden" name="logo_id" value={logo.id} />}
          <div className="flex flex-wrap items-end gap-4">
            {(newLogo || logo) ? (
              <div className={`grid h-24 w-48 place-items-center rounded-xl border bg-white p-3 ${newLogo ? 'border-dashed border-brand-accent' : 'border-line'}`}>
                <img src={newLogo?.url ?? logo!.url} alt={`Logo de ${name || 'la marca'}`} className="max-h-16 max-w-full object-contain" />
              </div>
            ) : <p className="text-sm text-muted">Sin logo: se muestra el nombre.</p>}
            {(newLogo || logo) && <IconBtn label={newLogo ? 'Descartar el logo nuevo' : 'Quitar el logo'} onClick={() => { if (newLogo) { URL.revokeObjectURL(newLogo.url); setNewLogo(null); } else setLogo(null); }}>✕</IconBtn>}
            <div className="min-w-0 flex-1">
              <label htmlFor={f('logo')} className="label">{logo || newLogo ? 'Reemplazar logo' : 'Cargar logo'}</label>
              <input id={f('logo')} type="file" accept="image/png,image/jpeg,image/webp" className={FILE_INPUT} aria-describedby={f('logo-hint')} onChange={(e) => {
                const x = e.target.files?.[0]; e.target.value = '';
                if (!x) return;
                if (!/^image\/(png|jpeg|webp)$/.test(x.type) || x.size > UPLOAD_LIMITS.image) return setClientError(`"${x.name}": usa PNG, JPG o WebP de hasta ${mb(UPLOAD_LIMITS.image)} (SVG no se acepta por seguridad).`);
                setClientError(''); if (newLogo) URL.revokeObjectURL(newLogo.url); setNewLogo({ file: x, url: URL.createObjectURL(x) });
              }} />
              <p id={f('logo-hint')} className="mt-1 text-xs text-muted">Usa el logo oficial del fabricante, PNG con fondo transparente.</p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Relación comercial" intro="Solo se publica con respaldo documental verificado y vigente (contrato, carta de autorización o certificado del fabricante). El documento queda en almacenamiento privado.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('rel')} label="Relación" hint="Ej.: «Distribuidor autorizado», «Instalador certificado».">
            <input id={f('rel')} name="relationship" maxLength={80} value={relationship} onChange={(e) => setRelationship(e.target.value)} className="input" />
          </Field>
          <Field id={f('until')} label="Vigente hasta" hint="Vacío si el documento no vence.">
            <input id={f('until')} name="relationship_valid_until" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="input" />
          </Field>
          <div className="sm:col-span-2">
            <p className="label">Documento de respaldo (privado)</p>
            {doc && !newDoc && <input type="hidden" name="relationship_doc_id" value={doc.id} />}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {newDoc ? <span>Nuevo: {newDoc.name} · {mb(newDoc.size)}</span> : doc ? <a href={doc.url} target="_blank" rel="noopener" className="text-brand-accent underline">Ver documento actual</a> : <span className="text-muted">Sin documento.</span>}
              {(newDoc || doc) && <IconBtn label={newDoc ? 'Descartar el documento nuevo' : 'Quitar el documento'} onClick={() => (newDoc ? setNewDoc(null) : setDoc(null))}>✕</IconBtn>}
            </div>
            <label htmlFor={f('doc')} className="label mt-3">{doc || newDoc ? 'Reemplazar documento' : 'Cargar documento'}</label>
            <input id={f('doc')} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className={FILE_INPUT} onChange={(e) => {
              const x = e.target.files?.[0]; e.target.value = '';
              if (!x) return;
              const ok = (x.type === 'application/pdf' && x.size <= UPLOAD_LIMITS.document) || (/^image\/(jpeg|png|webp)$/.test(x.type) && x.size <= UPLOAD_LIMITS.image);
              if (!ok) return setClientError(`"${x.name}": usa un PDF de hasta ${mb(UPLOAD_LIMITS.document)} o una imagen de hasta ${mb(UPLOAD_LIMITS.image)}.`);
              setClientError(''); setNewDoc(x);
            }} />
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="relationship_verified" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span><b>Relación verificada</b> con el documento de respaldo</span>
          </label>
        </div>
        <p className={`mt-4 rounded-xl px-4 py-2 text-sm ${shown ? 'bg-green-50 text-green-900' : 'bg-surface text-muted'}`} aria-live="polite">
          {shown ? `Se publica: «${relationship}».` : `No se publica la relación (${why}).`}
        </p>
      </Section>

      <Section title="Documentos públicos" intro={`Fichas técnicas, certificados, garantías y catálogos (PDF hasta ${mb(UPLOAD_LIMITS.document)}) o enlaces https (videos). Se muestran en la página de marcas.`}>
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-xl border border-line p-3">
              <input type="hidden" name="asset.key" value={r.key} />
              <input type="hidden" name="asset.id" value={r.id ?? ''} />
              <input type="hidden" name="asset.media_id" value={r.media && !r.file ? r.media.id : ''} />
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Documento {i + 1}</span>
                <span className="flex gap-1">
                  <IconBtn label={`Subir documento ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</IconBtn>
                  <IconBtn label={`Bajar documento ${i + 1}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</IconBtn>
                  <IconBtn label={`Quitar documento ${i + 1}`} onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>✕</IconBtn>
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                <div><label htmlFor={f(`k${r.key}`)} className="mb-1 block text-xs text-muted">Tipo</label>
                  <select id={f(`k${r.key}`)} name="asset.kind" value={r.kind} onChange={(e) => setRow(r.key, { kind: e.target.value as BrandAssetKind })} className="input">
                    {BRAND_ASSET_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select></div>
                <div><label htmlFor={f(`t${r.key}`)} className="mb-1 block text-xs text-muted">Título *</label>
                  <input id={f(`t${r.key}`)} name="asset.title" maxLength={120} value={r.title} onChange={(e) => setRow(r.key, { title: e.target.value })} className="input" /></div>
                <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={f(`f${r.key}`)} className="mb-1 block text-xs text-muted">{r.media && !r.file ? 'Reemplazar PDF' : 'PDF'}</label>
                    {r.file ? <p className="text-sm">Nuevo: {r.file.name} · {mb(r.file.size)} <button type="button" className="ml-2 underline" onClick={() => setRow(r.key, { file: null })}>Descartar</button></p>
                      : r.media ? <p className="mb-1 text-sm"><a href={r.media.url} target="_blank" rel="noopener" className="text-brand-accent underline">Ver PDF actual</a> <button type="button" className="ml-2 underline" onClick={() => setRow(r.key, { media: null })}>Quitar</button></p> : null}
                    {!r.file && <input id={f(`f${r.key}`)} type="file" accept="application/pdf" className={FILE_INPUT} onChange={(e) => {
                      const x = e.target.files?.[0]; e.target.value = '';
                      if (!x) return;
                      if (x.type !== 'application/pdf' || x.size > UPLOAD_LIMITS.document) return setClientError(`"${x.name}": usa un PDF de hasta ${mb(UPLOAD_LIMITS.document)}.`);
                      setClientError(''); setRow(r.key, { file: x });
                    }} />}
                  </div>
                  <div><label htmlFor={f(`u${r.key}`)} className="mb-1 block text-xs text-muted">o enlace (https)</label>
                    <input id={f(`u${r.key}`)} name="asset.url" type="url" inputMode="url" maxLength={500} placeholder="https://" value={r.url} onChange={(e) => setRow(r.key, { url: e.target.value })} className="input" /></div>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button type="button" className="btn-ghost mt-3 !py-2" disabled={rows.length >= 30}
          onClick={() => { setRows((r) => [...r, { key: nextKey, kind: 'datasheet', title: '', media: null, url: '', file: null }]); setNextKey((k) => k + 1); }}>
          Agregar documento
        </button>
      </Section>

      <Section title="Publicación">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="published" defaultChecked={b?.published ?? false} className="mt-0.5 h-4 w-4" />
          <span><b>Publicada</b><span className="block text-muted">Aparece en /marcas y en la franja de fabricantes de la portada. Mostrar la marca no afirma ninguna relación comercial.</span></span>
        </label>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : b ? 'Guardar cambios' : 'Crear marca'}</button>
      </div>
    </form>
  );
}
