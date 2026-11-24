'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff, signIn, signOut, can } from '@/lib/auth';
import { getStore } from '@/lib/data/store';
import { CalcParams } from '@/lib/engine/params';
import { LEAD_STAGES, ORDER_STATUSES, PAID_STATES, type AppRole } from '@/lib/data/types';
import { checkUpload, parseProductForm, UPLOAD_LIMITS, type SniffedType } from '@/lib/services/catalog';
import { parseProjectForm, PROJECT_MEDIA_LIMITS } from '@/lib/services/projects';
import { findBlock, parseBlockForm } from '@/content/blocks';
import { parseBrandForm } from '@/lib/services/brands';
import { parseServiceForm } from '@/lib/services/service-catalog';
import { SERVICES } from '@/content/segments';

export async function loginAction(_: unknown, fd: FormData) {
  const err = await signIn(String(fd.get('email') ?? ''), String(fd.get('password') ?? ''), (fd.get('role') as AppRole) || 'superadmin');
  if (err) return { error: err };
  redirect('/admin');
}
export async function logoutAction() { await signOut(); redirect('/admin/login'); }

export async function updateLeadAction(id: string, fd: FormData) {
  const staff = await requireStaff('leads_edit');
  const store = getStore();
  const lead = await store.getLead(id);
  if (!lead) throw new Error('Lead no encontrado');
  if (staff.role === 'ventas' && lead.advisor_id && lead.advisor_id !== staff.id) throw new Error('Este lead está asignado a otro asesor');
  const stage = fd.get('stage') as string;
  const patch: Record<string, unknown> = {};
  if (stage && LEAD_STAGES.some((s) => s.id === stage)) patch.stage = stage;
  const next = fd.get('next_activity_at') as string;
  if (next) patch.next_activity_at = new Date(next).toISOString();
  const nextNote = (fd.get('next_activity_note') as string)?.trim();
  if (nextNote) patch.next_activity_note = nextNote.slice(0, 300);
  if (!lead.advisor_id && staff.role === 'ventas') patch.advisor_id = staff.id;
  await store.updateLead(id, patch as any, staff.id);
  const note = (fd.get('note') as string)?.trim();
  if (note) await store.addActivity(id, (fd.get('kind') as string) || 'nota', note.slice(0, 3000), staff.id);
  revalidatePath(`/admin/leads/${id}`); revalidatePath('/admin/leads');
}

export async function updateOrderAction(id: string, _: unknown, fd: FormData) {
  const staff = await requireStaff('orders');
  const status = fd.get('status') as string;
  if (!ORDER_STATUSES.some((s) => s.id === status)) return { error: 'Estado no válido' };
  const ref = (fd.get('payment_reference') as string)?.trim();
  if (PAID_STATES.includes(status as any)) {
    const order = await getStore().getOrder(id);
    const alreadyVerified = !!order?.payment_verified_by;
    if (!alreadyVerified) {
      if (!can(staff, 'verify_payment')) return { error: 'Solo Gerencia puede registrar la verificación del pago.' };
      if (!ref || ref.length < 4) return { error: 'Ingresa la referencia verificable del pago (comprobante, transferencia, voucher).' };
    }
  }
  try {
    await getStore().updateOrderStatus(id, status as any, staff.id, ref && can(staff, 'verify_payment') ? { reference: ref } : undefined);
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath(`/admin/pedidos/${id}`); revalidatePath('/admin/pedidos');
  return { ok: true };
}

export async function saveParamsAction(_: unknown, fd: FormData) {
  const staff = await requireStaff('params');
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get('json'))); } catch { return { error: 'JSON no válido' }; }
  const parsed = CalcParams.omit({ version: true }).safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 5).join(' · ') };
  const v = await getStore().saveParams(parsed.data, staff.id);
  revalidatePath('/admin/parametros');
  return { ok: true, version: v.version };
}

const Block = z.object({ from_kwh: z.number().min(0), to_kwh: z.number().positive().nullable(), usd_per_kwh: z.number().min(0).max(2) });
const TariffForm = z.object({
  id: z.string().optional(), code: z.string().min(2).max(40), name: z.string().min(3), segment: z.enum(['residencial', 'comercial', 'industrial']),
  voltage_level: z.enum(['BT', 'MT', 'AT']), has_demand_charge: z.boolean(), demand_usd_per_kw: z.number().min(0).nullable(),
  commercialization_usd: z.number().min(0), other_charges_pct: z.number().min(0).max(0.5), energy_blocks: z.array(Block).min(1),
  source_note: z.string().min(10, 'Indica la fuente: resolución ARCONEL, fecha y distribuidora'), is_placeholder: z.boolean(),
});
export async function saveTariffAction(_: unknown, fd: FormData) {
  await requireStaff('tariffs');
  let raw: unknown; try { raw = JSON.parse(String(fd.get('json'))); } catch { return { error: 'JSON no válido' }; }
  const p = TariffForm.safeParse(raw);
  if (!p.success) return { error: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 4).join(' · ') };
  await getStore().saveTariff(p.data as any);
  revalidatePath('/admin/tarifas');
  return { ok: true };
}

export async function saveStatAction(fd: FormData) {
  await requireStaff('stats');
  const s = z.object({ id: z.string(), label: z.string().min(2), value: z.coerce.number().min(0), unit: z.string().max(12).optional(), source_note: z.string().min(5), verified: z.boolean(), sort: z.coerce.number() })
    .parse({ id: fd.get('id'), label: fd.get('label'), value: fd.get('value'), unit: fd.get('unit') || undefined, source_note: fd.get('source_note'), verified: fd.get('verified') === 'on', sort: fd.get('sort') });
  await getStore().saveStat({ ...s, unit: s.unit ?? null });
  revalidatePath('/admin/indicadores'); revalidatePath('/');
}

// ---------------------------------------------------------------- Productos
const files = (v: FormDataEntryValue[]) => v.filter((f): f is File => f instanceof File && f.size > 0);
function revalidateCatalog(...slugs: (string | undefined)[]) {
  revalidatePath('/admin/productos'); revalidatePath('/tienda'); revalidatePath('/sitemap.xml');
  for (const s of new Set(slugs.filter(Boolean))) revalidatePath(`/tienda/${s}`);
}

export async function saveProductAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  await requireStaff('products');
  const parsed = parseProductForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;
  const store = getStore();
  const prev = input.id ? await store.getProductRecord(input.id) : null;
  if (input.id && !prev) return { error: 'Producto no encontrado.' };

  // Solo se conservan medios que ya pertenecen a este producto: no se puede enlazar un id ajeno desde el formulario.
  const ownImages = new Set(prev?.images.map((m) => m.id));
  if (input.image_ids.some((id) => !ownImages.has(id))) return { error: 'Las imágenes cambiaron mientras editabas. Recarga la página.' };
  if (input.datasheet_id && input.datasheet_id !== prev?.datasheet?.id) return { error: 'La ficha técnica cambió mientras editabas. Recarga la página.' };

  // Todos los archivos se validan (firma binaria y tamaño) antes de subir cualquiera.
  const newImages = files(fd.getAll('new_images'));
  const newSheet = files(fd.getAll('new_datasheet'))[0] ?? null;
  if (input.image_ids.length + newImages.length > UPLOAD_LIMITS.maxImages) return { error: `Máximo ${UPLOAD_LIMITS.maxImages} imágenes por producto.` };
  const checked: { bytes: Uint8Array; t: SniffedType }[] = [];
  for (const f of newImages) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const t = checkUpload(bytes, 'image', f.name);
    if (typeof t === 'string') return { error: t };
    checked.push({ bytes, t });
  }
  let sheet: { bytes: Uint8Array; t: SniffedType } | null = null;
  if (newSheet) {
    const bytes = new Uint8Array(await newSheet.arrayBuffer());
    const t = checkUpload(bytes, 'document', newSheet.name);
    if (typeof t === 'string') return { error: t };
    sheet = { bytes, t };
  }

  let id: string;
  try {
    for (const c of checked) input.image_ids.push((await store.uploadMedia({ bytes: c.bytes, mime: c.t.mime, ext: c.t.ext, kind: 'image', folder: 'products', alt: input.name })).id);
    if (sheet) input.datasheet_id = (await store.uploadMedia({ bytes: sheet.bytes, mime: sheet.t.mime, ext: sheet.t.ext, kind: 'document', folder: 'datasheets', alt: `Ficha técnica ${input.name}` })).id;
    id = await store.saveProduct(input);
  } catch (e) { return { error: (e as Error).message }; }
  revalidateCatalog(prev?.slug, input.slug);
  redirect(`/admin/productos/${id}?guardado=1`);
}

export async function deleteProductAction(id: string, _: unknown, _fd: FormData): Promise<{ error?: string }> {
  await requireStaff('products');
  const store = getStore();
  const prev = await store.getProductRecord(id);
  if (!prev) return { error: 'Producto no encontrado.' };
  try { await store.deleteProduct(id); } catch (e) { return { error: (e as Error).message }; }
  revalidateCatalog(prev.slug);
  redirect(`/admin/productos?eliminado=${encodeURIComponent(prev.sku)}`);
}

// ---------------------------------------------------------------- Proyectos
async function checkedImages(list: File[]): Promise<{ bytes: Uint8Array; t: SniffedType }[] | string> {
  const out: { bytes: Uint8Array; t: SniffedType }[] = [];
  for (const f of list) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const t = checkUpload(bytes, 'image', f.name);
    if (typeof t === 'string') return t;
    out.push({ bytes, t });
  }
  return out;
}
function revalidateProjects(...slugs: (string | undefined)[]) {
  revalidatePath('/admin/proyectos'); revalidatePath('/proyectos'); revalidatePath('/'); revalidatePath('/sitemap.xml');
  revalidatePath('/soluciones/[segmento]', 'page');
  for (const s of new Set(slugs.filter(Boolean))) revalidatePath(`/proyectos/${s}`);
}

export async function saveProjectAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  await requireStaff('projects');
  const parsed = parseProjectForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;
  const store = getStore();
  const prev = input.id ? await store.getProjectRecord(input.id) : null;
  if (input.id && !prev) return { error: 'Proyecto no encontrado.' };

  // Solo se conservan fotos que ya pertenecen a este proyecto.
  const own = new Set([...(prev?.gallery.map((m) => m.id) ?? []), ...(prev?.cover ? [prev.cover.id] : [])]);
  if (input.gallery_ids.some((id) => !own.has(id)) || (input.cover_id && !own.has(input.cover_id)))
    return { error: 'Las fotos cambiaron mientras editabas. Recarga la página.' };

  const coverFile = files(fd.getAll('new_cover'))[0];
  const galleryFiles = files(fd.getAll('new_gallery'));
  if (input.gallery_ids.length + galleryFiles.length > PROJECT_MEDIA_LIMITS.gallery) return { error: `Máximo ${PROJECT_MEDIA_LIMITS.gallery} fotos en la galería.` };
  const cover = await checkedImages(coverFile ? [coverFile] : []);
  if (typeof cover === 'string') return { error: cover };
  const gallery = await checkedImages(galleryFiles);
  if (typeof gallery === 'string') return { error: gallery };

  let id: string;
  try {
    const up = (c: { bytes: Uint8Array; t: SniffedType }) => store.uploadMedia({ bytes: c.bytes, mime: c.t.mime, ext: c.t.ext, kind: 'image', folder: 'projects', alt: input.title });
    if (cover[0]) input.cover_id = (await up(cover[0])).id;
    for (const g of gallery) input.gallery_ids.push((await up(g)).id);
    id = await store.saveProject(input);
  } catch (e) { return { error: (e as Error).message }; }
  revalidateProjects(prev?.slug, input.slug);
  redirect(`/admin/proyectos/${id}?guardado=1`);
}

export async function deleteProjectAction(id: string, _: unknown, _fd: FormData): Promise<{ error?: string }> {
  await requireStaff('projects');
  const store = getStore();
  const prev = await store.getProjectRecord(id);
  if (!prev) return { error: 'Proyecto no encontrado.' };
  try { await store.deleteProject(id); } catch (e) { return { error: (e as Error).message }; }
  revalidateProjects(prev.slug);
  redirect(`/admin/proyectos?eliminado=${encodeURIComponent(prev.title)}`);
}

// ---------------------------------------------------------------- Contenido del sitio
function revalidateBlock(path: string) { revalidatePath(path); revalidatePath('/'); revalidatePath('/admin/contenido'); }

export async function saveContentBlockAction(page: string, slot: string, _: unknown, fd: FormData): Promise<{ error?: string }> {
  await requireStaff('content');
  const def = findBlock(page, slot);
  if (!def) return { error: 'Bloque no encontrado.' };
  const parsed = parseBlockForm(def, fd);
  if ('error' in parsed) return { error: parsed.error };
  const data = parsed.data;
  const store = getStore();
  const current = (await store.listContentBlocks()).find((b) => b.page === page && b.slot === slot);
  const currentData = (current?.data ?? {}) as Record<string, unknown>;

  for (const f of def.fields) {
    if (f.type !== 'image') continue;
    // Solo se conserva la imagen que ya tenía este bloque: no se puede enlazar un archivo ajeno desde el formulario.
    if (data[f.key] && data[f.key] !== currentData[f.key]) return { error: 'La imagen cambió mientras editabas. Recarga la página.' };
    const file = files(fd.getAll(`${f.key}__file`))[0];
    if (!file) continue;
    const checked = await checkedImages([file]);
    if (typeof checked === 'string') return { error: checked };
    try {
      const m = await store.uploadMedia({ bytes: checked[0].bytes, mime: checked[0].t.mime, ext: checked[0].t.ext, kind: 'image', folder: 'content', alt: null });
      data[f.key] = m.id;
    } catch (e) { return { error: (e as Error).message }; }
  }
  try {
    await store.saveContentBlock({ page, slot, data, is_placeholder: fd.get('is_placeholder') === 'on', published: fd.get('published') === 'on' });
  } catch (e) { return { error: (e as Error).message }; }
  revalidateBlock(def.path);
  redirect(`/admin/contenido/${page}/${slot}?guardado=1`);
}

export async function resetContentBlockAction(page: string, slot: string, _: unknown, _fd: FormData): Promise<{ error?: string }> {
  await requireStaff('content');
  const def = findBlock(page, slot);
  if (!def) return { error: 'Bloque no encontrado.' };
  try { await getStore().deleteContentBlock(page, slot); } catch (e) { return { error: (e as Error).message }; }
  revalidateBlock(def.path);
  redirect(`/admin/contenido/${page}/${slot}?restaurado=1`);
}

// ---------------------------------------------------------------- Marcas
function revalidateBrands() { revalidatePath('/marcas'); revalidatePath('/'); revalidatePath('/tienda'); revalidatePath('/admin/marcas'); }
/** PDF o imagen escaneada (para respaldos). */
function checkDocOrImage(bytes: Uint8Array, name: string): SniffedType | string {
  const d = checkUpload(bytes, 'document', name);
  if (typeof d !== 'string') return d;
  const i = checkUpload(bytes, 'image', name);
  return typeof i === 'string' ? `"${name}" debe ser un PDF o una imagen JPG, PNG o WebP (máximo 15 MB el PDF, 5 MB la imagen).` : i;
}

export async function saveBrandAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  await requireStaff('brands');
  const store = getStore();
  const id = typeof fd.get('id') === 'string' ? String(fd.get('id')) : '';
  const prev = id ? await store.getBrandRecord(id) : null;
  if (id && !prev) return { error: 'Marca no encontrada.' };

  // 1) Archivos de documentos por fila: se validan y se reservan con un id provisional.
  const keys = fd.getAll('asset.key').map(String);
  const mids = fd.getAll('asset.media_id').map(String);
  const pending = new Map<string, { bytes: Uint8Array; t: SniffedType }>();
  for (let i = 0; i < keys.length; i++) {
    const f = files(fd.getAll(`asset_file.${keys[i]}`))[0];
    if (!f) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const t = checkUpload(bytes, 'document', f.name);
    if (typeof t === 'string') return { error: t };
    const tmp = `pending-${i}`;
    pending.set(tmp, { bytes, t }); mids[i] = tmp;
  }
  fd.delete('asset.media_id'); mids.forEach((m) => fd.append('asset.media_id', m));

  const logoFile = files(fd.getAll('new_logo'))[0];
  const docFile = files(fd.getAll('new_doc'))[0];
  // Con un respaldo nuevo, la validación ya lo cuenta como cargado.
  if (docFile && !fd.get('relationship_doc_id')) fd.set('relationship_doc_id', 'pending-doc');

  const parsed = parseBrandForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;

  // 2) Solo se conservan archivos que ya pertenecían a esta marca.
  const ownAssets = new Set(prev?.assets.map((a) => a.media?.id).filter(Boolean));
  if ((input.logo_id && input.logo_id !== prev?.logo?.id)
    || (input.relationship_doc_id && input.relationship_doc_id !== 'pending-doc' && input.relationship_doc_id !== prev?.relationship_doc?.id)
    || input.assets.some((a) => a.media_id && !a.media_id.startsWith('pending-') && !ownAssets.has(a.media_id)))
    return { error: 'Los archivos cambiaron mientras editabas. Recarga la página.' };

  let logo: { bytes: Uint8Array; t: SniffedType } | null = null, doc: { bytes: Uint8Array; t: SniffedType } | null = null;
  if (logoFile) {
    const c = await checkedImages([logoFile]);
    if (typeof c === 'string') return { error: `${c} (el logo debe ser PNG, JPG o WebP; SVG no se acepta por seguridad).` };
    logo = c[0];
  }
  if (docFile) {
    const bytes = new Uint8Array(await docFile.arrayBuffer());
    const t = checkDocOrImage(bytes, docFile.name);
    if (typeof t === 'string') return { error: t };
    doc = { bytes, t };
  }

  // 3) Subidas y guardado.
  let savedId: string;
  try {
    const up = (c: { bytes: Uint8Array; t: SniffedType }, folder: string, bucket?: 'private-docs') =>
      store.uploadMedia({ bytes: c.bytes, mime: c.t.mime, ext: c.t.ext, kind: c.t.kind, folder, alt: input.name, bucket });
    if (logo) input.logo_id = (await up(logo, 'brands')).id;
    if (doc) input.relationship_doc_id = (await up(doc, 'brand-backing', 'private-docs')).id;
    for (const a of input.assets) if (a.media_id?.startsWith('pending-')) a.media_id = (await up(pending.get(a.media_id)!, 'brand-assets')).id;
    savedId = await store.saveBrand(input);
  } catch (e) { return { error: (e as Error).message }; }
  revalidateBrands();
  redirect(`/admin/marcas/${savedId}?guardado=1`);
}

export async function deleteBrandAction(id: string, _: unknown, _fd: FormData): Promise<{ error?: string }> {
  await requireStaff('brands');
  const prev = await getStore().getBrandRecord(id);
  if (!prev) return { error: 'Marca no encontrada.' };
  try { await getStore().deleteBrand(id); } catch (e) { return { error: (e as Error).message }; }
  revalidateBrands();
  redirect(`/admin/marcas?eliminado=${encodeURIComponent(prev.name)}`);
}

// ---------------------------------------------------------------- Servicios
function revalidateServices(...slugs: string[]) {
  revalidatePath('/servicios'); revalidatePath('/sitemap.xml'); revalidatePath('/admin/servicios');
  for (const s of new Set(slugs)) revalidatePath(`/servicios/${s}`);
}

export async function saveServiceAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  await requireStaff('services');
  // Los servicios del catálogo base conservan su URL.
  const baseSlug = String(fd.get('base_slug') ?? '');
  if (baseSlug) { if (!SERVICES.some((s) => s.slug === baseSlug)) return { error: 'Servicio base no válido.' }; fd.set('slug', baseSlug); }
  const parsed = parseServiceForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;
  if (!baseSlug && SERVICES.some((s) => s.slug === input.slug)) return { error: 'Esa URL pertenece a un servicio del catálogo base. Elige otra.' };
  const store = getStore();
  const rows = await store.listServiceRows();
  const prev = input.id ? rows.find((r) => r.id === input.id) : rows.find((r) => r.slug === baseSlug && baseSlug);
  if (input.id && !prev) return { error: 'Servicio no encontrado.' };
  if (prev && !input.id) input.id = prev.id; // servicio base que ya tenía fila
  if (input.cover_id && input.cover_id !== prev?.cover?.id) return { error: 'La imagen cambió mientras editabas. Recarga la página.' };
  const coverFile = files(fd.getAll('new_cover'))[0];
  const c = await checkedImages(coverFile ? [coverFile] : []);
  if (typeof c === 'string') return { error: c };
  try {
    if (c[0]) input.cover_id = (await store.uploadMedia({ bytes: c[0].bytes, mime: c[0].t.mime, ext: c[0].t.ext, kind: 'image', folder: 'services', alt: input.name })).id;
    await store.saveService(input);
  } catch (e) { return { error: (e as Error).message }; }
  revalidateServices(input.slug, ...(prev ? [prev.slug] : []));
  redirect(`/admin/servicios/${input.slug}?guardado=1`);
}

/** Servicio nuevo: lo elimina. Servicio base: borra su fila y vuelve a la versión base (provisional). */
export async function deleteServiceAction(slug: string, _: unknown, _fd: FormData): Promise<{ error?: string }> {
  await requireStaff('services');
  const store = getStore();
  const row = (await store.listServiceRows()).find((r) => r.slug === slug);
  if (!row) return { error: 'Servicio no encontrado.' };
  try { await store.deleteService(row.id); } catch (e) { return { error: (e as Error).message }; }
  revalidateServices(slug);
  const base = SERVICES.some((s) => s.slug === slug);
  redirect(base ? `/admin/servicios/${slug}?restaurado=1` : `/admin/servicios?eliminado=${encodeURIComponent(row.name)}`);
}
