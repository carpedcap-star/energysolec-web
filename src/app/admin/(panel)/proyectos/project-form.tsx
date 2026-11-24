'use client';
import { useActionState, useEffect, useId, useRef, useState, startTransition } from 'react';
import { saveProjectAction } from '../../actions';
import { PROJECT_STATUSES, type MediaRef, type ProjectRecord } from '@/lib/data/types';
import { PROVINCES } from '@/lib/ecuador';
import { slugify, UPLOAD_LIMITS } from '@/lib/services/catalog';
import { parseLatLng, PROJECT_MEDIA_LIMITS } from '@/lib/services/projects';
import { EcuadorMap, mapXY } from '@/components/ecuador-map';
import { Field, FILE_INPUT, IconBtn, mb, Section } from '../form-ui';

const MAX_REQUEST = 24 * 1024 * 1024;
const INSTALL_TYPES = ['Cubierta', 'Suelo (ground mount)', 'Carport', 'Flotante', 'Fachada'];
const numOrNull = (s: string) => { const n = Number(s.replace(',', '.')); return s.trim() !== '' && Number.isFinite(n) ? n : null; };
const okImage = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type) && f.size <= UPLOAD_LIMITS.image;

export function ProjectForm({ project: p }: { project: ProjectRecord | null }) {
  const [state, dispatch, pending] = useActionState(saveProjectAction, null);
  const [clientError, setClientError] = useState('');
  const [title, setTitle] = useState(p?.title ?? '');
  const [clientName, setClientName] = useState(p?.client_name ?? '');
  const [lat, setLat] = useState(p?.lat?.toString() ?? '');
  const [lng, setLng] = useState(p?.lng?.toString() ?? '');
  const [flags, setFlags] = useState({
    client: p?.client_name_authorized ?? false, location: p?.location_authorized ?? false, financials: p?.financials_authorized ?? false,
    testimonial: p?.testimonial_verified ?? false, published: p?.published ?? false, featured: p?.featured ?? false,
  });
  const [savings, setSavings] = useState(p?.annual_savings_usd?.toString() ?? '');
  const [testimonial, setTestimonial] = useState(p?.testimonial ?? '');
  const [cover, setCover] = useState<MediaRef | null>(p?.cover ?? null);
  const [newCover, setNewCover] = useState<{ file: File; url: string } | null>(null);
  const [gallery, setGallery] = useState<MediaRef[]>(p?.gallery ?? []);
  const [newGallery, setNewGallery] = useState<{ file: File; url: string }[]>([]);
  const errRef = useRef<HTMLParagraphElement>(null);
  const uid = useId();
  const f = (k: string) => `${uid}-${k}`;
  const error = clientError || (pending ? '' : state?.error);
  const flag = (k: keyof typeof flags) => ({
    checked: flags[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFlags((x) => ({ ...x, [k]: e.target.checked, ...(k === 'published' && !e.target.checked ? { featured: false } : {}) })),
  });

  useEffect(() => { if (error) errRef.current?.focus(); }, [error, state]);

  const latN = numOrNull(lat), lngN = numOrNull(lng);
  const point = latN != null && lngN != null ? mapXY(latN, lngN) : null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError('');
    const total = newGallery.reduce((a, n) => a + n.file.size, 0) + (newCover?.file.size ?? 0);
    if (total > MAX_REQUEST) return setClientError(`Las fotos nuevas suman ${mb(total)}; el máximo por guardado es ${mb(MAX_REQUEST)}. Súbelas en varias veces.`);
    const fd = new FormData(e.currentTarget);
    if (newCover) fd.append('new_cover', newCover.file);
    newGallery.forEach((n) => fd.append('new_gallery', n.file));
    startTransition(() => dispatch(fd));
  }
  function addGallery(list: FileList | null) {
    const picked = [...(list ?? [])];
    const bad = picked.find((x) => !okImage(x));
    if (bad) return setClientError(`"${bad.name}": usa JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
    const room = PROJECT_MEDIA_LIMITS.gallery - gallery.length - newGallery.length;
    if (picked.length > room) return setClientError(`Puedes agregar ${Math.max(room, 0)} foto(s) más (máximo ${PROJECT_MEDIA_LIMITS.gallery}).`);
    setClientError('');
    setNewGallery((x) => [...x, ...picked.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }
  const move = (i: number, d: -1 | 1) => setGallery((x) => { const y = [...x]; [y[i], y[i + d]] = [y[i + d], y[i]]; return y; });

  // Lo que verá el público con las banderas actuales.
  const publicView: [string, string, boolean][] = [
    ['Nombre del cliente', clientName ? (flags.client ? clientName : 'Oculto') : 'Sin dato', flags.client && !!clientName],
    ['Punto en el mapa', point ? (flags.location ? 'Visible' : 'Oculto') : 'Sin coordenadas', flags.location && !!point],
    ['Ahorro anual', savings ? (flags.financials ? `US$ ${savings}` : 'Oculto') : 'Sin dato', flags.financials && !!savings],
    ['Testimonio', testimonial ? (flags.testimonial ? 'Visible' : 'Oculto') : 'Sin dato', flags.testimonial && !!testimonial],
  ];

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-6" noValidate>
      {p && <input type="hidden" name="id" value={p.id} />}

      <Section title="Datos generales">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('title')} label="Título público *" hint="Si el cliente no autorizó su nombre, usa un título genérico: «Empacadora en Guayas, 250 kWp»." className="sm:col-span-2">
            <input id={f('title')} name="title" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
          </Field>
          <Field id={f('slug')} label="URL en el sitio" hint={`/proyectos/${slugify(title) || '…'} si lo dejas vacío.`}>
            <input id={f('slug')} name="slug" maxLength={80} defaultValue={p?.slug} placeholder={slugify(title)} className="input" />
          </Field>
          <Field id={f('segment')} label="Segmento *">
            <select id={f('segment')} name="segment" required defaultValue={p?.segment ?? ''} className="input">
              <option value="" disabled>Elige un segmento</option>
              <option value="residencial">Residencial</option><option value="comercial">Comercial</option><option value="industrial">Industrial</option>
            </select>
          </Field>
          <Field id={f('industry')} label="Industria o actividad">
            <input id={f('industry')} name="industry" maxLength={80} defaultValue={p?.industry ?? ''} placeholder="Empacadora, hotelería…" className="input" />
          </Field>
          <Field id={f('status')} label="Estado *">
            <select id={f('status')} name="status" defaultValue={p?.status ?? 'finalizado'} className="input">
              {PROJECT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field id={f('executed')} label="Fecha de ejecución">
            <input id={f('executed')} name="executed_on" type="date" defaultValue={p?.executed_on ?? ''} className="input" />
          </Field>
          <Field id={f('desc')} label="Descripción" className="sm:col-span-2">
            <textarea id={f('desc')} name="description" rows={5} maxLength={5000} defaultValue={p?.description ?? ''} className="input" />
          </Field>
        </div>
      </Section>

      <Section title="Cliente" intro="El nombre del cliente solo se publica con su autorización escrita. Guarda el respaldo.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('client')} label="Nombre del cliente">
            <input id={f('client')} name="client_name" maxLength={160} value={clientName} onChange={(e) => setClientName(e.target.value)} className="input" />
          </Field>
          <label className="flex items-start gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="client_name_authorized" {...flag('client')} className="mt-0.5 h-4 w-4" />
            <span>El cliente <b>autorizó</b> publicar su nombre</span>
          </label>
        </div>
      </Section>

      <Section title="Ubicación" intro="Provincia y ciudad se publican siempre. El punto exacto en el mapa, solo con autorización.">
        <div className="grid gap-6 sm:grid-cols-[1fr_220px]">
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <Field id={f('prov')} label="Provincia">
              <select id={f('prov')} name="province" defaultValue={p?.province ?? ''} className="input">
                <option value="">Sin especificar</option>
                {PROVINCES.map((x) => <option key={x.name}>{x.name}</option>)}
              </select>
            </Field>
            <Field id={f('city')} label="Ciudad o cantón">
              <input id={f('city')} name="city" maxLength={80} defaultValue={p?.city ?? ''} className="input" />
            </Field>
            <Field id={f('lat')} label="Latitud" hint="Puedes pegar «-2.1894, -79.8891» desde Google Maps.">
              <input id={f('lat')} name="lat" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)}
                onPaste={(e) => { const ll = parseLatLng(e.clipboardData.getData('text')); if (ll) { e.preventDefault(); setLat(String(ll.lat)); setLng(String(ll.lng)); } }} className="input tabular-nums" />
            </Field>
            <Field id={f('lng')} label="Longitud" hint="En Ecuador es negativa (oeste).">
              <input id={f('lng')} name="lng" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} className="input tabular-nums" />
            </Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="location_authorized" {...flag('location')} className="mt-0.5 h-4 w-4" />
              <span>El cliente <b>autorizó</b> mostrar la ubicación en el mapa</span>
            </label>
          </div>
          <div>
            <EcuadorMap label={point ? `Vista previa: punto en ${lat}, ${lng}` : 'Vista previa del mapa sin punto'} points={point ? [{ id: 'preview', lat: latN!, lng: lngN!, label: title || 'Proyecto' }] : []} className={flags.location ? '' : 'opacity-60'} />
            <p className="mt-2 text-xs text-muted" aria-live="polite">
              {latN != null && lngN != null && !point ? 'Coordenadas fuera del Ecuador.' : !point ? 'Sin coordenadas.' : flags.location ? 'Visible en el mapa público.' : 'Solo vista previa: no autorizado para el mapa público.'}
            </p>
          </div>
        </div>
      </Section>

      <Section title="Datos técnicos" intro="Cifras del proyecto ejecutado. Indica si la generación fue medida o es una estimación.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id={f('kwp')} label="Capacidad (kWp)"><input id={f('kwp')} name="capacity_kwp" inputMode="decimal" defaultValue={p?.capacity_kwp ?? ''} className="input tabular-nums" /></Field>
          <Field id={f('inv')} label="Inversores (kW)"><input id={f('inv')} name="inverter_kw" inputMode="decimal" defaultValue={p?.inverter_kw ?? ''} className="input tabular-nums" /></Field>
          <Field id={f('panels')} label="Número de paneles"><input id={f('panels')} name="panel_count" inputMode="numeric" defaultValue={p?.panel_count ?? ''} className="input tabular-nums" /></Field>
          <Field id={f('itype')} label="Tipo de instalación">
            <input id={f('itype')} name="installation_type" list={f('itypes')} maxLength={60} defaultValue={p?.installation_type ?? ''} className="input" />
            <datalist id={f('itypes')}>{INSTALL_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field id={f('tech')} label="Tecnología" hint="Separadas por coma." className="sm:col-span-2">
            <input id={f('tech')} name="technology" defaultValue={p?.technology.join(', ')} placeholder="Bifacial, Inversor híbrido, BESS" className="input" />
          </Field>
          <Field id={f('gen')} label="Generación anual (kWh)"><input id={f('gen')} name="annual_generation_kwh" inputMode="decimal" defaultValue={p?.annual_generation_kwh ?? ''} className="input tabular-nums" /></Field>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="generation_is_measured" defaultChecked={p?.generation_is_measured ?? false} className="h-4 w-4" /> Medida (no estimada)
          </label>
          <Field id={f('co2')} label="CO₂ evitado (t/año)"><input id={f('co2')} name="co2_avoided_t" inputMode="decimal" defaultValue={p?.co2_avoided_t ?? ''} className="input tabular-nums" /></Field>
        </div>
      </Section>

      <Section title="Cifras financieras" intro="El ahorro económico solo se publica con autorización del cliente.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('sav')} label="Ahorro anual (USD)"><input id={f('sav')} name="annual_savings_usd" inputMode="decimal" value={savings} onChange={(e) => setSavings(e.target.value)} className="input tabular-nums" /></Field>
          <label className="flex items-start gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="financials_authorized" {...flag('financials')} className="mt-0.5 h-4 w-4" />
            <span>El cliente <b>autorizó</b> publicar sus cifras</span>
          </label>
        </div>
      </Section>

      <Section title="Testimonio" intro="Solo testimonios reales, con autor identificable y respaldo (correo, acta o grabación).">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={f('testi')} label="Testimonio" className="sm:col-span-2">
            <textarea id={f('testi')} name="testimonial" rows={3} maxLength={1200} value={testimonial} onChange={(e) => setTestimonial(e.target.value)} className="input" />
          </Field>
          <Field id={f('author')} label="Autor y cargo"><input id={f('author')} name="testimonial_author" maxLength={160} defaultValue={p?.testimonial_author ?? ''} className="input" /></Field>
          <label className="flex items-start gap-2 self-end pb-3 text-sm">
            <input type="checkbox" name="testimonial_verified" {...flag('testimonial')} className="mt-0.5 h-4 w-4" />
            <span>Testimonio <b>verificado</b> y autorizado</span>
          </label>
        </div>
      </Section>

      <Section title="Fotos" intro={`JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}. La portada aparece en el listado y en la portada del sitio; la galería, en la ficha (máximo ${PROJECT_MEDIA_LIMITS.gallery}).`}>
        <h3 className="text-sm font-semibold">Portada</h3>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          {cover && !newCover && <input type="hidden" name="cover_id" value={cover.id} />}
          {(newCover || cover) ? (
            <div className={`w-48 rounded-xl border bg-white p-2 ${newCover ? 'border-dashed border-brand-accent' : 'border-line'}`}>
              <img src={newCover?.url ?? cover!.url} alt={newCover ? `Nueva portada ${newCover.file.name}` : `Portada de ${title || 'proyecto'}`} className="aspect-[16/10] w-full rounded-lg object-cover" />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                <span>{newCover ? `Nueva · ${mb(newCover.file.size)}` : 'Actual'}</span>
                <IconBtn label={newCover ? 'Descartar la nueva portada' : 'Quitar la portada'} onClick={() => { if (newCover) { URL.revokeObjectURL(newCover.url); setNewCover(null); } else setCover(null); }}>✕</IconBtn>
              </div>
            </div>
          ) : <p className="text-sm text-muted">Sin portada.</p>}
          <div className="min-w-0 flex-1">
            <label htmlFor={f('cover')} className="label">{cover || newCover ? 'Reemplazar portada' : 'Cargar portada'}</label>
            <input id={f('cover')} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => {
              const file = e.target.files?.[0]; e.target.value = '';
              if (!file) return;
              if (!okImage(file)) return setClientError(`"${file.name}": usa JPG, PNG o WebP de hasta ${mb(UPLOAD_LIMITS.image)}.`);
              setClientError(''); if (newCover) URL.revokeObjectURL(newCover.url); setNewCover({ file, url: URL.createObjectURL(file) });
            }} className={FILE_INPUT} />
          </div>
        </div>

        <h3 className="mt-6 text-sm font-semibold">Galería</h3>
        <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Galería del proyecto">
          {gallery.map((m, i) => (
            <li key={m.id} className="rounded-xl border border-line bg-white p-2">
              <input type="hidden" name="gallery_ids" value={m.id} />
              <img src={m.url} alt={`Foto ${i + 1} de ${title || 'proyecto'}`} className="aspect-[4/3] w-full rounded-lg object-cover" />
              <div className="mt-1 flex justify-center gap-1">
                <IconBtn label={`Mover foto ${i + 1} antes`} disabled={i === 0} onClick={() => move(i, -1)}>←</IconBtn>
                <IconBtn label={`Mover foto ${i + 1} después`} disabled={i === gallery.length - 1} onClick={() => move(i, 1)}>→</IconBtn>
                <IconBtn label={`Quitar foto ${i + 1}`} onClick={() => setGallery((x) => x.filter((y) => y.id !== m.id))}>✕</IconBtn>
              </div>
            </li>
          ))}
          {newGallery.map((n, i) => (
            <li key={n.url} className="rounded-xl border border-dashed border-brand-accent bg-white p-2">
              <img src={n.url} alt={`Nueva foto ${n.file.name}`} className="aspect-[4/3] w-full rounded-lg object-cover" />
              <p className="mt-1 truncate text-center text-[11px] text-muted" title={n.file.name}>Nueva · {mb(n.file.size)}</p>
              <div className="mt-1 flex justify-center">
                <IconBtn label={`Descartar ${n.file.name}`} onClick={() => { URL.revokeObjectURL(n.url); setNewGallery((x) => x.filter((_, j) => j !== i)); }}>✕</IconBtn>
              </div>
            </li>
          ))}
        </ul>
        {!gallery.length && !newGallery.length && <p className="text-sm text-muted">Sin fotos en la galería.</p>}
        <div className="mt-3">
          <label htmlFor={f('gal')} className="label">Agregar fotos a la galería</label>
          <input id={f('gal')} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => { addGallery(e.target.files); e.target.value = ''; }} className={FILE_INPUT} />
        </div>
      </Section>

      <Section title="Publicación">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            <label className="flex items-start gap-2">
              <input type="checkbox" name="published" {...flag('published')} className="mt-0.5 h-4 w-4" />
              <span><b>Publicado</b><span className="block text-muted">Visible en /proyectos.</span></span>
            </label>
            <label className={`flex items-start gap-2 ${flags.published ? '' : 'opacity-50'}`}>
              <input type="checkbox" name="featured" {...flag('featured')} disabled={!flags.published} className="mt-0.5 h-4 w-4" />
              <span><b>Destacado en la portada</b><span className="block text-muted">{flags.published ? 'La página de inicio muestra los 3 destacados más recientes.' : 'Primero publícalo.'}</span></span>
            </label>
          </div>
          <div className="rounded-xl bg-surface p-4">
            <p className="text-sm font-semibold">Qué verá el público</p>
            <dl className="mt-2 space-y-1.5 text-sm">
              {publicView.map(([k, v, shown]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted">{k}</dt>
                  <dd className={`text-right font-medium ${shown ? 'text-green-800' : 'text-muted'}`}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface/95 px-5 py-4 backdrop-blur lg:-mx-10 lg:px-10">
        {error && <p ref={errRef} tabIndex={-1} role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700 outline-none">{error}</p>}
        <button className="btn-dark w-full sm:w-auto" disabled={pending}>{pending ? 'Guardando…' : p ? 'Guardar cambios' : 'Crear proyecto'}</button>
      </div>
    </form>
  );
}
