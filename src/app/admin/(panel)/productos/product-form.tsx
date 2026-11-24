'use client';
import { useActionState, useEffect, useId, useRef, useState, startTransition } from 'react';
import { saveProductAction } from '../../actions';
import { AVAILABILITY, PRICE_TIERS, type MediaRef, type ProductRecord } from '@/lib/data/types';
import { PRODUCT_CATEGORIES } from '@/lib/data/seed';
import { promoUntilToDate, slugify, UPLOAD_LIMITS } from '@/lib/services/catalog';
import { Field, IconBtn, mb, Section } from '../form-ui';

type Brand = { id: string; name: string };
const MAX_REQUEST = 24 * 1024 * 1024; // margen bajo el límite de 25 MB de las server actions

export function ProductForm({ product: p, brands }: { product: ProductRecord | null; brands: Brand[] }) {
  const [state, dispatch, pending] = useActionState(saveProductAction, null);
  const [clientError, setClientError] = useState('');
  const [name, setName] = useState(p?.name ?? '');
  const [placeholder, setPlaceholder] = useState(p?.is_placeholder ?? false);
  const [published, setPublished] = useState(p?.published ?? false);
  const [specs, setSpecs] = useState<[string, string][]>(() => {
    const e = Object.entries(p?.specs ?? {}).map(([k, v]) => [k, String(v)] as [string, string]);
    return e.length ? e : [['', '']];
  });
  const [images, setImages] = useState<MediaRef[]>(p?.images ?? []);
  const [newImages, setNewImages] = useState<{ file: File; url: string }[]>([]);
  const [sheet, setSheet] = useState<MediaRef | null>(p?.datasheet ?? null);
  const [newSheet, setNewSheet] = useState<File | null>(null);
  const errRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();
  const error = clientError || (pending ? '' : state?.error); // el aviso anterior se oculta mientras se guarda

  useEffect(() => () => newImages.forEach((n) => URL.revokeObjectURL(n.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (error) errRef.current?.focus(); }, [error, state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Envío manual: así React no reinicia el formulario si el servidor devuelve un error de validación.
    e.preventDefault();
    setClientError('');
    const total = newImages.reduce((a, n) => a + n.file.size, 0) + (newSheet?.size ?? 0);
    if (total > MAX_REQUEST) return setClientError(`Los archivos nuevos suman ${mb(total)}; el máximo por guardado es ${mb(MAX_REQUEST)}. Súbelos en varias veces.`);
    const fd = new FormData(e.currentTarget);
    fd.delete('new_images'); fd.delete('new_datasheet');
    newImages.forEach((n) => fd.append('new_images', n.file));
    if (newSheet) fd.append('new_datasheet', newSheet);
    startTransition(() => dispatch(fd));
  }

  function addImages(list: FileList | null) {
    if (!list) return;
    const room = UPLOAD_LIMITS.maxImages - images.length - newImages.length;
    const picked = [...list];
    const bad = picked.find((f) => !/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > UPLOAD_LIMITS.image);
    if (bad) return setClientError(`"${bad.name}": usa JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
    if (picked.length > room) return setClientError(`Puedes agregar ${Math.max(room, 0)} imagen(es) más (máximo ${UPLOAD_LIMITS.maxImages}).`);
    setClientError('');
    setNewImages((x) => [...x, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }
  const move = (i: number, d: -1 | 1) => setImages((x) => { const y = [...x]; [y[i], y[i + d]] = [y[i + d], y[i]]; return y; });

  const priceOf = (tier: string) => p?.prices.find((t) => t.tier === tier);
  const f = (k: string) => `${uid}-${k}`;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
      {p && <input type="hidden" name="id" value={p.id} />}

      <Section title="Identificación">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('name')} label="Nombre *" className="sm:col-span-2">
            <input id={f('name')} name="name" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </Field>
          <Field id={f('sku')} label="SKU *" hint="Código interno único. Se guarda en mayúsculas.">
            <input id={f('sku')} name="sku" required maxLength={40} defaultValue={p?.sku} className="input uppercase" autoCapitalize="characters" />
          </Field>
          <Field id={f('slug')} label="URL en la tienda" hint={`/tienda/${slugify(name) || '…'} si lo dejas vacío.`}>
            <input id={f('slug')} name="slug" maxLength={80} defaultValue={p?.slug} placeholder={slugify(name)} className="input" />
          </Field>
          <Field id={f('brand')} label="Marca">
            <select id={f('brand')} name="brand_id" defaultValue={p?.brand_id ?? ''} className="input">
              <option value="">Sin marca / por definir</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field id={f('model')} label="Modelo">
            <input id={f('model')} name="model" maxLength={80} defaultValue={p?.model ?? ''} className="input" />
          </Field>
          <Field id={f('category')} label="Categoría *">
            <select id={f('category')} name="category" required defaultValue={p?.category ?? ''} className="input">
              <option value="" disabled>Elige una categoría</option>
              {PRODUCT_CATEGORIES.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
            </select>
          </Field>
          <Field id={f('warranty')} label="Garantía" hint="Tal como la declara el fabricante.">
            <input id={f('warranty')} name="warranty" maxLength={160} defaultValue={p?.warranty ?? ''} className="input" />
          </Field>
          <Field id={f('summary')} label="Resumen" className="sm:col-span-2">
            <textarea id={f('summary')} name="summary" rows={3} maxLength={600} defaultValue={p?.summary ?? ''} className="input" />
          </Field>
          <Field id={f('certs')} label="Certificaciones" hint="Separadas por coma. Solo las que tengan respaldo documental del fabricante." className="sm:col-span-2">
            <input id={f('certs')} name="certifications" defaultValue={p?.certifications.join(', ')} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="Precios por nivel" intro="Valores en USD sin IVA. Deja vacío un nivel si no se ofrece. Un precio final de 0 se muestra como «Precio a consultar».">
        <div className="space-y-4">
          {PRICE_TIERS.map((t) => {
            const cur = priceOf(t.id);
            return (
              <fieldset key={t.id} className="grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-3">
                <legend className="px-1 text-sm font-semibold">{t.label}{t.id === 'final' ? ' *' : ''}</legend>
                <Field id={f(`price-${t.id}`)} label="Precio">
                  <input id={f(`price-${t.id}`)} name={`price_${t.id}`} inputMode="decimal" defaultValue={cur?.price ?? ''} className="input tabular-nums" required={t.id === 'final'} />
                </Field>
                <Field id={f(`promo-${t.id}`)} label="Precio promocional">
                  <input id={f(`promo-${t.id}`)} name={`promo_${t.id}`} inputMode="decimal" defaultValue={cur?.promo_price ?? ''} className="input tabular-nums" />
                </Field>
                <Field id={f(`until-${t.id}`)} label="Promoción válida hasta">
                  <input id={f(`until-${t.id}`)} name={`promo_until_${t.id}`} type="date" defaultValue={promoUntilToDate(cur?.promo_until ?? null)} className="input" />
                </Field>
              </fieldset>
            );
          })}
          <div className="sm:w-1/3">
            <Field id={f('vat')} label="IVA (%) *" hint="Tarifa vigente aplicable al producto.">
              <input id={f('vat')} name="vat_pct" inputMode="decimal" required defaultValue={p ? Math.round(p.vat_rate * 10000) / 100 : 15} className="input tabular-nums" />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Inventario">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={f('stock')} label="Stock (unidades) *">
            <input id={f('stock')} name="stock" type="number" min={0} step={1} required defaultValue={p?.stock ?? 0} className="input tabular-nums" />
          </Field>
          <Field id={f('avail')} label="Disponibilidad *" hint="«Disponible» exige stock mayor a 0.">
            <select id={f('avail')} name="availability" defaultValue={p?.availability ?? 'consultar'} className="input">
              {AVAILABILITY.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-center pt-2 text-sm sm:pt-6">
            <input type="checkbox" name="installable" defaultChecked={p?.installable ?? false} className="h-4 w-4" /> Ofrecer instalación
          </label>
        </div>
      </Section>

      <Section title="Especificaciones técnicas" intro="Datos de la ficha del fabricante. Los valores numéricos se guardan como números (usa punto decimal).">
        <div className="space-y-2">
          {specs.map(([k, v], i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
              <div><label htmlFor={f(`sk${i}`)} className={i ? 'sr-only' : 'label'}>Especificación</label>
                <input id={f(`sk${i}`)} name="spec_key" value={k} placeholder="Potencia (W)" maxLength={60} onChange={(e) => setSpecs((s) => s.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} className="input" /></div>
              <div><label htmlFor={f(`sv${i}`)} className={i ? 'sr-only' : 'label'}>Valor</label>
                <input id={f(`sv${i}`)} name="spec_value" value={v} placeholder="580" maxLength={200} onChange={(e) => setSpecs((s) => s.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className="input" /></div>
              <button type="button" aria-label={`Quitar especificación ${k || i + 1}`} onClick={() => setSpecs((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : [['', '']]))} className="btn-ghost !px-3 !py-2.5">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setSpecs((s) => [...s, ['', '']])} className="btn-ghost !py-2">Agregar especificación</button>
        </div>
      </Section>

      <Section title="Imágenes" intro={`JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}; máximo ${UPLOAD_LIMITS.maxImages}. La primera es la principal en la tienda.`}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Imágenes del producto">
          {images.map((m, i) => (
            <li key={m.id} className="rounded-xl border border-line bg-white p-2">
              <input type="hidden" name="image_ids" value={m.id} />
              <img src={m.url} alt={`Imagen ${i + 1} de ${name || 'producto'}`} className="aspect-square w-full rounded-lg object-contain" />
              {i === 0 && <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wide text-brand-accent">Principal</p>}
              <div className="mt-1 flex justify-center gap-1">
                <IconBtn label={`Mover imagen ${i + 1} antes`} disabled={i === 0} onClick={() => move(i, -1)}>←</IconBtn>
                <IconBtn label={`Mover imagen ${i + 1} después`} disabled={i === images.length - 1} onClick={() => move(i, 1)}>→</IconBtn>
                <IconBtn label={`Quitar imagen ${i + 1}`} onClick={() => setImages((x) => x.filter((y) => y.id !== m.id))}>✕</IconBtn>
              </div>
            </li>
          ))}
          {newImages.map((n, i) => (
            <li key={n.url} className="rounded-xl border border-dashed border-brand-accent bg-white p-2">
              <img src={n.url} alt={`Nueva imagen ${n.file.name}`} className="aspect-square w-full rounded-lg object-contain" />
              <p className="mt-1 truncate text-center text-[11px] text-muted" title={n.file.name}>Nueva · {mb(n.file.size)}</p>
              <div className="mt-1 flex justify-center">
                <IconBtn label={`Descartar ${n.file.name}`} onClick={() => { URL.revokeObjectURL(n.url); setNewImages((x) => x.filter((_, j) => j !== i)); }}>✕</IconBtn>
              </div>
            </li>
          ))}
        </ul>
        {!images.length && !newImages.length && <p className="text-sm text-muted">Sin imágenes. La tienda mostrará un ícono genérico.</p>}
        <div className="mt-3">
          <label htmlFor={f('imgs')} className="label">Agregar imágenes</label>
          <input id={f('imgs')} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { addImages(e.target.files); e.target.value = ''; }} className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-dark file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
        </div>
      </Section>

      <Section title="Ficha técnica" intro={`PDF del fabricante, hasta ${mb(UPLOAD_LIMITS.document)}. Se publica como descarga en la ficha del producto.`}>
        {sheet && !newSheet && <input type="hidden" name="datasheet_id" value={sheet.id} />}
        {sheet && !newSheet ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a href={sheet.url} target="_blank" rel="noopener" className="text-brand-accent underline">Ver ficha técnica actual (PDF)</a>
            <button type="button" onClick={() => setSheet(null)} className="btn-ghost !py-1.5">Quitar</button>
          </div>
        ) : newSheet ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Nueva: {newSheet.name} · {mb(newSheet.size)}</span>
            <button type="button" onClick={() => setNewSheet(null)} className="btn-ghost !py-1.5">Descartar</button>
          </div>
        ) : null}
        {!newSheet && (
          <div className={sheet ? 'mt-3' : ''}>
            <label htmlFor={f('pdf')} className="label">{sheet ? 'Reemplazar por otro PDF' : 'Cargar PDF'}</label>
            <input id={f('pdf')} type="file" accept="application/pdf" onChange={(e) => {
              const file = e.target.files?.[0]; e.target.value = '';
              if (!file) return;
              if (file.type !== 'application/pdf' || file.size > UPLOAD_LIMITS.document) return setClientError(`"${file.name}": usa un PDF de hasta ${mb(UPLOAD_LIMITS.document)}.`);
              setClientError(''); setNewSheet(file);
            }} className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-brand-dark file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white" />
          </div>
        )}
      </Section>

      <Section title="Publicación">
        <div className="space-y-3 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="is_placeholder" checked={placeholder} onChange={(e) => { setPlaceholder(e.target.checked); if (e.target.checked) setPublished(false); }} className="mt-0.5 h-4 w-4" />
            <span><b>Producto de ejemplo</b> — datos provisionales, sin respaldo del fabricante o de Gerencia. Se marca como «Ejemplo · no a la venta» y no puede publicarse.</span>
          </label>
          <label className={`flex items-start gap-2 ${placeholder ? 'opacity-50' : ''}`}>
            <input type="checkbox" name="published" checked={published} disabled={placeholder} onChange={(e) => setPublished(e.target.checked)} className="mt-0.5 h-4 w-4" aria-describedby={f('pubhint')} />
            <span><b>Publicado en la tienda</b><span id={f('pubhint')} className="block text-muted">{placeholder ? 'Desmarca «Producto de ejemplo» cuando los datos sean reales para poder publicarlo.' : 'Visible para los clientes en /tienda.'}</span></span>
          </label>
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : p ? 'Guardar cambios' : 'Crear producto'}</button>
      </div>
    </form>
  );
}
