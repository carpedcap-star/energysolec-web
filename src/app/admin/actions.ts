'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireStaff, signIn, signOut, can, activateAccount } from '@/lib/auth';
import { headers } from 'next/headers';
import { SITE } from '@/lib/site';
import { guard } from '@/lib/request';
import { esc, sendEmail } from '@/lib/services/messaging';
import { parseUserForm, roleChangeProblem } from '@/lib/services/users';
import { normalizeIdentity, parseColorsForm, type Identity } from '@/lib/services/identity';
import { getStore, getStoreAs } from '@/lib/data/store';
import { parseParamsForm } from '@/lib/services/params-form';
import { parseTariffForm } from '@/lib/services/tariff-form';
import { LEAD_STAGES, ORDER_STATUSES, PAID_STATES, type AppRole } from '@/lib/data/types';
import { checkUpload, parseProductForm, UPLOAD_LIMITS, type SniffedType } from '@/lib/services/catalog';
import { parseProjectForm, PROJECT_MEDIA_LIMITS } from '@/lib/services/projects';
import { findBlock, parseBlockForm } from '@/content/blocks';
import { parseBrandForm } from '@/lib/services/brands';
import { parseServiceForm } from '@/lib/services/service-catalog';
import { parsePostForm } from '@/lib/services/blog';
import { SERVICES } from '@/content/segments';
import { canTransition, requiresApprover, ReviewSchema, tierLabel, TRADE_STATUS } from '@/lib/services/trade';
import { sendTradeAccessEmail, tradeAccessUrl } from '@/lib/services/trade-mail';
import { runJobs } from '@/lib/services/cron-jobs';
import { parseEcLocal } from '@/lib/services/followup';
import { checkSources, type SourceCheck } from '@/lib/engine/resource';
import { parseSettingsForm } from '@/lib/services/site-settings';
import { canEvalTransition, EVAL_STATUS, EvaluationSchema } from '@/lib/services/industrial';

export async function loginAction(_: unknown, fd: FormData) {
  const err = await signIn(String(fd.get('email') ?? ''), String(fd.get('password') ?? ''), (fd.get('role') as AppRole) || 'superadmin');
  if (err) return { error: err };
  redirect('/admin');
}
export async function logoutAction() { await signOut(); redirect('/admin/login'); }

export async function updateLeadAction(id: string, fd: FormData) {
  const staff = await requireStaff('leads_edit');
  const store = getStoreAs(staff.id);
  const lead = await store.getLead(id);
  if (!lead) throw new Error('Lead no encontrado');
  if (staff.role === 'ventas' && lead.advisor_id && lead.advisor_id !== staff.id) throw new Error('Este lead está asignado a otro asesor');
  const stage = fd.get('stage') as string;
  const patch: Record<string, unknown> = {};
  if (stage && LEAD_STAGES.some((s) => s.id === stage)) patch.stage = stage;
  // La fecha del formulario es hora de Ecuador (el servidor corre en UTC).
  const next = parseEcLocal(String(fd.get('next_activity_at') ?? ''));
  const nextNote = (fd.get('next_activity_note') as string)?.trim();
  // El campo viene precargado con la actividad actual: «realizada» la quita salvo que se haya puesto otra fecha.
  const newDate = !!next && next !== lead.next_activity_at;
  if (fd.get('activity_done') === 'on' && !newDate) { patch.next_activity_at = null; patch.next_activity_note = null; }
  else if (next) { patch.next_activity_at = next; patch.next_activity_note = nextNote ? nextNote.slice(0, 300) : null; }
  if (!lead.advisor_id && staff.role === 'ventas') patch.advisor_id = staff.id;
  // Asignación por Gerencia: solo a un asesor activo; el asesor recibe un aviso.
  let assigned: { email: string; full_name: string } | null = null;
  if (can(staff, 'assign_leads') && fd.has('advisor_id')) {
    const to = String(fd.get('advisor_id') ?? '');
    if (to !== (lead.advisor_id ?? '')) {
      if (!to) patch.advisor_id = null;
      else {
        const u = (await store.listUsers()).find((x) => x.id === to && x.active && x.is_advisor);
        if (!u) throw new Error('Elige un asesor activo.');
        patch.advisor_id = u.id;
        if (u.id !== staff.id) assigned = u;
      }
    }
  }
  const prevAdvisor = lead.advisor_id ?? null;   // antes de guardar: el almacén puede devolver el mismo objeto que modifica
  await store.updateLead(id, patch as any, staff.id);
  if ('advisor_id' in patch && patch.advisor_id !== prevAdvisor)
    await store.addActivity(id, 'sistema', patch.advisor_id ? `Asignado a ${assigned?.full_name ?? staff.full_name}` : 'Sin asesor asignado', staff.id);
  if (assigned) await sendEmail({
    to: assigned.email, template: 'lead_asignado', subject: `Te asignaron un lead: ${lead.full_name}`,
    html: `<div style="font-family:Arial,sans-serif"><p>Hola ${esc(assigned.full_name)},</p><p>Te asignaron el lead <b>${esc(lead.full_name)}</b>${lead.company ? ` (${esc(lead.company)})` : ''}, fuente ${esc(lead.source)}.</p><p><a href="${esc(SITE.url)}/admin/leads/${encodeURIComponent(id)}">Abrir en el CRM</a></p></div>`,
  });
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
    const order = await getStoreAs(staff.id).getOrder(id);
    const alreadyVerified = !!order?.payment_verified_by;
    if (!alreadyVerified) {
      if (!can(staff, 'verify_payment')) return { error: 'Solo Gerencia puede registrar la verificación del pago.' };
      if (!ref || ref.length < 4) return { error: 'Ingresa la referencia verificable del pago (comprobante, transferencia, voucher).' };
    }
  }
  try {
    await getStoreAs(staff.id).updateOrderStatus(id, status as any, staff.id, ref && can(staff, 'verify_payment') ? { reference: ref } : undefined);
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath(`/admin/pedidos/${id}`); revalidatePath('/admin/pedidos');
  return { ok: true };
}

/** Solo Gerencia (o superadmin) valida los parámetros; cualquier otro cambio los deja provisionales. */
const VALIDATES_PARAMS: AppRole[] = ['superadmin', 'gerencia'];

export async function saveParamsAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('params');
  const parsed = parseParamsForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const data = parsed.data;
  // Quien no valida deja siempre la versión pendiente de Gerencia (aunque la anterior estuviera validada).
  const forcedPending = !VALIDATES_PARAMS.includes(staff.role);
  if (forcedPending) data.isPlaceholder = true;
  let version: number;
  try { version = (await getStoreAs(staff.id).saveParams(data, staff.id)).version; } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/admin/parametros'); revalidatePath('/calculadora');
  redirect(`/admin/parametros?guardado=${version}${forcedPending ? '&pendiente=1' : ''}`);
}

export async function saveTariffAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('tariffs');
  const parsed = parseTariffForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const t = parsed.data;
  const store = getStoreAs(staff.id);
  const all = await store.listTariffs();
  if (t.id && !all.some((x) => x.id === t.id)) return { error: 'Tarifa no encontrada.' };
  // La calculadora elige la tarifa por su código: no puede repetirse entre tarifas activas.
  if (all.some((x) => x.code === t.code && x.id !== t.id)) return { error: `Ya existe otra tarifa activa con el código ${t.code}.` };
  let id: string;
  try { id = await store.saveTariff(t); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/admin/tarifas'); revalidatePath('/calculadora');
  redirect(`/admin/tarifas/${id}?guardado=1`);
}

export async function deactivateTariffAction(id: string, _: unknown, _fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('tariffs');
  const store = getStoreAs(staff.id);
  const all = await store.listTariffs();
  const t = all.find((x) => x.id === id);
  if (!t) return { error: 'Tarifa no encontrada.' };
  // Sin ninguna tarifa activa, la calculadora usaría en silencio la tarifa de referencia interna (provisional).
  if (!all.some((x) => x.id !== id && x.segment === t.segment)) return { error: `Es la única tarifa activa del segmento ${t.segment}: agrega otra antes de desactivarla.` };
  try { await store.deactivateTariff(id); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/admin/tarifas'); revalidatePath('/calculadora');
  redirect(`/admin/tarifas?desactivada=${encodeURIComponent(t.code)}`);
}

export async function saveStatAction(fd: FormData) {
  const staff = await requireStaff('stats');
  const s = z.object({ id: z.string(), label: z.string().min(2), value: z.coerce.number().min(0), unit: z.string().max(12).optional(), source_note: z.string().min(5), verified: z.boolean(), sort: z.coerce.number() })
    .parse({ id: fd.get('id'), label: fd.get('label'), value: fd.get('value'), unit: fd.get('unit') || undefined, source_note: fd.get('source_note'), verified: fd.get('verified') === 'on', sort: fd.get('sort') });
  await getStoreAs(staff.id).saveStat({ ...s, unit: s.unit ?? null });
  revalidatePath('/admin/indicadores'); revalidatePath('/');
}

// ---------------------------------------------------------------- Productos
const files = (v: FormDataEntryValue[]) => v.filter((f): f is File => f instanceof File && f.size > 0);
function revalidateCatalog(...slugs: (string | undefined)[]) {
  revalidatePath('/admin/productos'); revalidatePath('/tienda'); revalidatePath('/sitemap.xml');
  for (const s of new Set(slugs.filter(Boolean))) revalidatePath(`/tienda/${s}`);
}

export async function saveProductAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('products');
  const parsed = parseProductForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;
  const store = getStoreAs(staff.id);
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
  const staff = await requireStaff('products');
  const store = getStoreAs(staff.id);
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
  const staff = await requireStaff('projects');
  const parsed = parseProjectForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;
  const store = getStoreAs(staff.id);
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
  const staff = await requireStaff('projects');
  const store = getStoreAs(staff.id);
  const prev = await store.getProjectRecord(id);
  if (!prev) return { error: 'Proyecto no encontrado.' };
  try { await store.deleteProject(id); } catch (e) { return { error: (e as Error).message }; }
  revalidateProjects(prev.slug);
  redirect(`/admin/proyectos?eliminado=${encodeURIComponent(prev.title)}`);
}

// ---------------------------------------------------------------- Contenido del sitio
function revalidateBlock(path: string) { revalidatePath(path); revalidatePath('/'); revalidatePath('/admin/contenido'); }

export async function saveContentBlockAction(page: string, slot: string, _: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('content');
  const def = findBlock(page, slot);
  if (!def) return { error: 'Bloque no encontrado.' };
  const parsed = parseBlockForm(def, fd);
  if ('error' in parsed) return { error: parsed.error };
  const data = parsed.data;
  const store = getStoreAs(staff.id);
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
  const staff = await requireStaff('content');
  const def = findBlock(page, slot);
  if (!def) return { error: 'Bloque no encontrado.' };
  try { await getStoreAs(staff.id).deleteContentBlock(page, slot); } catch (e) { return { error: (e as Error).message }; }
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
  const staff = await requireStaff('brands');
  const store = getStoreAs(staff.id);
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
  const staff = await requireStaff('brands');
  const prev = await getStoreAs(staff.id).getBrandRecord(id);
  if (!prev) return { error: 'Marca no encontrada.' };
  try { await getStoreAs(staff.id).deleteBrand(id); } catch (e) { return { error: (e as Error).message }; }
  revalidateBrands();
  redirect(`/admin/marcas?eliminado=${encodeURIComponent(prev.name)}`);
}

// ---------------------------------------------------------------- Servicios
function revalidateServices(...slugs: string[]) {
  revalidatePath('/servicios'); revalidatePath('/sitemap.xml'); revalidatePath('/admin/servicios');
  for (const s of new Set(slugs)) revalidatePath(`/servicios/${s}`);
}

export async function saveServiceAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('services');
  // Los servicios del catálogo base conservan su URL.
  const baseSlug = String(fd.get('base_slug') ?? '');
  if (baseSlug) { if (!SERVICES.some((s) => s.slug === baseSlug)) return { error: 'Servicio base no válido.' }; fd.set('slug', baseSlug); }
  const parsed = parseServiceForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;
  if (!baseSlug && SERVICES.some((s) => s.slug === input.slug)) return { error: 'Esa URL pertenece a un servicio del catálogo base. Elige otra.' };
  const store = getStoreAs(staff.id);
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
  const staff = await requireStaff('services');
  const store = getStoreAs(staff.id);
  const row = (await store.listServiceRows()).find((r) => r.slug === slug);
  if (!row) return { error: 'Servicio no encontrado.' };
  try { await store.deleteService(row.id); } catch (e) { return { error: (e as Error).message }; }
  revalidateServices(slug);
  const base = SERVICES.some((s) => s.slug === slug);
  redirect(base ? `/admin/servicios/${slug}?restaurado=1` : `/admin/servicios?eliminado=${encodeURIComponent(row.name)}`);
}

// ---------------------------------------------------------------- Blog
function revalidateBlog(...slugs: string[]) {
  revalidatePath('/blog'); revalidatePath('/sitemap.xml'); revalidatePath('/admin/blog');
  for (const s of new Set(slugs)) revalidatePath(`/blog/${s}`);
}

export async function savePostAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('blog');
  const parsed = parsePostForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const input = parsed.data;
  const store = getStoreAs(staff.id);
  const prev = input.id ? await store.getPostRecord(input.id) : null;
  if (input.id && !prev) return { error: 'Artículo no encontrado.' };
  if (input.cover_id && input.cover_id !== prev?.cover?.id) return { error: 'La imagen cambió mientras editabas. Recarga la página.' };
  const coverFile = files(fd.getAll('new_cover'))[0];
  const c = await checkedImages(coverFile ? [coverFile] : []);
  if (typeof c === 'string') return { error: c };
  let id: string;
  try {
    if (c[0]) input.cover_id = (await store.uploadMedia({ bytes: c[0].bytes, mime: c[0].t.mime, ext: c[0].t.ext, kind: 'image', folder: 'blog', alt: input.title })).id;
    id = await store.savePost(input, { id: staff.id, name: staff.full_name });
  } catch (e) { return { error: (e as Error).message }; }
  revalidateBlog(input.slug, ...(prev ? [prev.slug] : []));
  redirect(`/admin/blog/${id}?guardado=1`);
}

export async function deletePostAction(id: string, _: unknown, _fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('blog');
  const prev = await getStoreAs(staff.id).getPostRecord(id);
  if (!prev) return { error: 'Artículo no encontrado.' };
  try { await getStoreAs(staff.id).deletePost(id); } catch (e) { return { error: (e as Error).message }; }
  revalidateBlog(prev.slug);
  redirect(`/admin/blog?eliminado=${encodeURIComponent(prev.title)}`);
}

/** Imagen dentro del artículo: se sube y se devuelve su URL para insertarla en el Markdown. */
export async function uploadPostImageAction(fd: FormData): Promise<{ url?: string; error?: string }> {
  const staff = await requireStaff('blog');
  const f = files(fd.getAll('image'))[0];
  if (!f) return { error: 'Elige una imagen.' };
  const c = await checkedImages([f]);
  if (typeof c === 'string') return { error: c };
  try {
    const alt = String(fd.get('alt') ?? '').slice(0, 140) || null;
    const m = await getStoreAs(staff.id).uploadMedia({ bytes: c[0].bytes, mime: c[0].t.mime, ext: c[0].t.ext, kind: 'image', folder: 'blog', alt });
    return { url: m.url };
  } catch (e) { return { error: (e as Error).message }; }
}

// ---------------------------------------------------------------- Usuarios
type LinkResult = { error?: string; ok?: boolean; id?: string; emailSent?: boolean; link?: string };

/** Enlace de activación. En producción, siempre la URL oficial (nunca el Host de la petición, que se puede falsificar). */
async function accessUrl(token: string, type: 'invite' | 'recovery') {
  let base = SITE.url;
  if (process.env.NODE_ENV !== 'production') {
    const h = await headers();
    base = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`;
  }
  return `${base}/admin/activar?token_hash=${encodeURIComponent(token)}&type=${type}`;
}
async function sendAccessEmail(to: string, name: string, link: string, type: 'invite' | 'recovery') {
  const invite = type === 'invite';
  const r = await sendEmail({
    to, template: invite ? 'invitacion_panel' : 'acceso_panel',
    subject: invite ? 'Tu acceso al panel de Energy Solutions Ecuador' : 'Restablece tu contraseña del panel — Energy Solutions Ecuador',
    html: `<div style="font-family:Arial,sans-serif"><p>Hola ${esc(name)},</p><p>${invite ? 'Se creó tu usuario en el panel de Energy Solutions Ecuador.' : 'Recibimos una solicitud para restablecer tu contraseña del panel.'} Usa este enlace personal para ${invite ? 'activar tu cuenta y elegir' : 'elegir'} tu contraseña:</p><p><a href="${esc(link)}">${invite ? 'Activar mi cuenta' : 'Elegir nueva contraseña'}</a></p><p style="color:#666">El enlace es de un solo uso y vence en 24 horas. Si no esperabas este correo, ignóralo.</p></div>`,
  });
  return r.sent;
}

export async function createUserAction(_: unknown, fd: FormData): Promise<LinkResult> {
  const staff = await requireStaff('users');
  const parsed = parseUserForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const { active: _a, ...input } = parsed.data;
  let created: Awaited<ReturnType<ReturnType<typeof getStore>['createUser']>>;
  try { created = await getStoreAs(staff.id).createUser(input); } catch (e) { return { error: (e as Error).message }; }
  const link = await accessUrl(created.token_hash, created.type);
  const emailSent = await sendAccessEmail(input.email, input.full_name, link, created.type);
  revalidatePath('/admin/usuarios');
  // El enlace solo se muestra si el correo no salió (p. ej. sin proveedor configurado).
  return { ok: true, id: created.id, emailSent, link: emailSent ? undefined : link };
}

export async function updateUserAction(id: string, _: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('users');
  const parsed = parseUserForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const store = getStoreAs(staff.id);
  const all = await store.listUsers();
  const target = all.find((u) => u.id === id);
  if (!target) return { error: 'Usuario no encontrado.' };
  const { email: _e, ...patch } = parsed.data;
  const problem = roleChangeProblem(target, patch, staff.id, all);
  if (problem) return { error: problem };
  const reassignTo = String(fd.get('reassign_to') ?? '');
  if (reassignTo) {
    const to = all.find((u) => u.id === reassignTo);
    if (!to || !to.active || !to.is_advisor || to.id === id) return { error: 'Elige un asesor activo para reasignar los leads.' };
  }
  try {
    await store.updateUser(id, patch);
    if (reassignTo && (!patch.active || !patch.is_advisor)) await store.reassignOpenLeads(id, reassignTo, staff.id);
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/admin/usuarios'); revalidatePath('/admin/leads');
  redirect(`/admin/usuarios/${id}?guardado=1`);
}

export async function sendAccessLinkAction(id: string, _: unknown, _fd: FormData): Promise<LinkResult> {
  const staff = await requireStaff('users');
  const store = getStoreAs(staff.id);
  const u = (await store.listUsers()).find((x) => x.id === id);
  if (!u) return { error: 'Usuario no encontrado.' };
  if (!u.active) return { error: 'El usuario está desactivado. Actívalo antes de enviarle un enlace.' };
  let t: { token_hash: string; type: 'invite' | 'recovery' };
  try { t = await store.createAccessToken(id); } catch (e) { return { error: (e as Error).message }; }
  const link = await accessUrl(t.token_hash, t.type);
  const emailSent = await sendAccessEmail(u.email, u.full_name, link, u.activated ? 'recovery' : 'invite');
  return { ok: true, emailSent, link: emailSent ? undefined : link };
}

export async function activateAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  // Ruta pública: límite por IP contra intentos repetidos con tokens.
  if (!(await guard('activate', 10, 900))) return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  const password = String(fd.get('password') ?? ''), confirm = String(fd.get('confirm') ?? '');
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' };
  const type = fd.get('type') === 'recovery' ? 'recovery' : 'invite';
  const err = await activateAccount(String(fd.get('token_hash') ?? ''), type, password);
  if (err) return { error: err };
  redirect('/admin');
}

// ---------------------------------------------------------------- Identidad gráfica
export async function saveIdentityAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('identity');
  const parsed = parseColorsForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const store = getStoreAs(staff.id);
  const current = normalizeIdentity(await store.getSetting<unknown>('brand', null));
  const next: Identity = { colors: parsed.data, logo: null, logoDark: null, favicon: null };
  const LOGOS = [['logo', 'Logo para fondos claros'], ['logoDark', 'Logo para fondos oscuros'], ['favicon', 'Ícono del sitio']] as const;
  const uploads: [typeof LOGOS[number][0], { bytes: Uint8Array; t: SniffedType }][] = [];
  for (const [k, label] of LOGOS) {
    // «<k>_id»: el logo cargado que se conserva; vacío = volver al original de public/brand.
    const keep = String(fd.get(`${k}_id`) ?? '');
    if (keep && keep !== current[k]) return { error: 'Los logos cambiaron mientras editabas. Recarga la página.' };
    next[k] = keep || null;
    const f = files(fd.getAll(`${k}_file`))[0];
    if (!f) continue;
    const c = await checkedImages([f]);
    if (typeof c === 'string') return { error: `${label}: ${c} Usa PNG o WebP (SVG no se acepta por seguridad).` };
    uploads.push([k, c[0]]);
  }
  try {
    for (const [k, c] of uploads) next[k] = (await store.uploadMedia({ bytes: c.bytes, mime: c.t.mime, ext: c.t.ext, kind: 'image', folder: 'brand', alt: 'Energy Solutions Ecuador' })).id;
    await store.saveSetting('brand', next, staff.id);
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/', 'layout'); // colores y logos afectan a todas las páginas
  redirect('/admin/identidad?guardado=1');
}

// ---------------------------------------------------------------- Cuentas comerciales
export async function reviewTradeAction(id: string, _: unknown, fd: FormData): Promise<LinkResult> {
  const staff = await requireStaff('trade');
  const p = ReviewSchema.safeParse({ status: fd.get('status'), tier: fd.get('tier'), review_note: String(fd.get('review_note') ?? '') });
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
  const r = p.data;
  const store = getStoreAs(staff.id);
  const t = await store.getTradeAccount(id);
  if (!t) return { error: 'Cuenta no encontrada.' };
  if (!canTransition(t.status, r.status)) return { error: `No se puede pasar de «${TRADE_STATUS[t.status]}» a «${TRADE_STATUS[r.status]}».` };
  if (requiresApprover(r.status) && !can(staff, 'trade_approve')) return { error: 'Solo Gerencia puede aprobar o suspender cuentas comerciales.' };
  let link: Awaited<ReturnType<typeof store.reviewTradeAccount>>;
  try { link = await store.reviewTradeAccount(id, r, staff.id); } catch (e) { return { error: (e as Error).message }; }
  if (t.lead_id) await store.addActivity(t.lead_id, 'sistema', `Cuenta comercial ${TRADE_STATUS[r.status].toLowerCase()} (${tierLabel(r.tier).toLowerCase()})${r.review_note ? `: ${r.review_note}` : ''}`, staff.id).catch(() => {});
  revalidatePath('/admin/cuentas');
  if (link) {
    const url = await tradeAccessUrl(link.token_hash, link.type);
    const emailSent = await sendTradeAccessEmail(t.email, t.contact_name, t.company, url, 'invite');
    return { ok: true, id, emailSent, link: emailSent ? undefined : url };
  }
  redirect(`/admin/cuentas/${id}?guardado=1`);
}

export async function sendTradeAccessLinkAction(id: string, _: unknown, _fd: FormData): Promise<LinkResult> {
  const staff = await requireStaff('trade');
  const store = getStoreAs(staff.id);
  const t = await store.getTradeAccount(id);
  if (!t || t.status !== 'aprobada') return { error: 'La cuenta no está aprobada.' };
  let tok: { token_hash: string; type: 'invite' | 'recovery' };
  try { tok = await store.createTradeAccessToken(id); } catch (e) { return { error: (e as Error).message }; }
  const type = t.activated ? 'recovery' : 'invite';
  const url = await tradeAccessUrl(tok.token_hash, type);
  const emailSent = await sendTradeAccessEmail(t.email, t.contact_name, t.company, url, type);
  return { ok: true, emailSent, link: emailSent ? undefined : url };
}

// ---------------------------------------------------------------- Mensajes y tareas programadas
export async function runJobsAction(_: unknown, _fd: FormData): Promise<{ error?: string; ok?: boolean; summary?: Record<string, unknown> }> {
  const staff = await requireStaff('messages');
  if (!(await guard(`run_jobs:${staff.id}`, 6, 600))) return { error: 'Ya ejecutaste las tareas varias veces. Espera unos minutos.' };
  const r = await runJobs('panel', staff.id);
  revalidatePath('/admin/mensajes');
  return r.ok ? { ok: true, summary: r.summary } : { error: `Algunas tareas fallaron: ${r.errors.join(' | ')}`, summary: r.summary };
}

export async function requeueMessageAction(id: string, _fd: FormData) {
  const staff = await requireStaff('messages');
  await getStoreAs(staff.id).requeueMessage(id);
  revalidatePath('/admin/mensajes');
}

// ---------------------------------------------------------------- Recurso solar
export async function verifySourcesAction(_: unknown, _fd: FormData): Promise<{ error?: string; checks?: SourceCheck[]; at?: string }> {
  const staff = await requireStaff('params');
  // 9 consultas a servicios públicos por verificación: con límite para no abusar de ellos.
  if (!(await guard(`verify_sources:${staff.id}`, 5, 600))) return { error: 'Ya verificaste varias veces. Espera unos minutos.' };
  return { checks: await checkSources(fetch), at: new Date().toISOString() };
}

export async function clearSolarCacheAction(_: unknown, _fd: FormData): Promise<{ error?: string; cleared?: number }> {
  const staff = await requireStaff('params');
  let n: number;
  try { n = await getStoreAs(staff.id).clearSolarCache(); } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/admin/recurso-solar');
  return { cleared: n };
}

// ---------------------------------------------------------------- Contacto, avisos e integraciones
export async function saveSettingsAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const staff = await requireStaff('settings');
  const parsed = parseSettingsForm(fd);
  if ('error' in parsed) return { error: parsed.error };
  const store = getStoreAs(staff.id);
  try {
    await store.saveSetting('contact', parsed.data.contact, staff.id);
    await store.saveSetting('notifications', parsed.data.notifications, staff.id);
    await store.saveSetting('integrations_public', parsed.data.integrations, staff.id);
  } catch (e) { return { error: (e as Error).message }; }
  revalidatePath('/', 'layout'); // el contacto aparece en todas las páginas (pie, botón de WhatsApp, datos estructurados)
  redirect('/admin/configuracion?guardado=1');
}

// ---------------------------------------------------------------- Cotizaciones industriales
export async function evaluateIndustrialAction(id: string, _: unknown, fd: FormData): Promise<{ error?: string; ok?: boolean }> {
  const staff = await requireStaff('industrial_eval');
  const kwpRaw = String(fd.get('kwp') ?? '').replace(',', '.').trim();
  const p = EvaluationSchema.safeParse({ status: fd.get('status'), kwp: kwpRaw === '' ? null : Number(kwpRaw), notes: String(fd.get('notes') ?? '') });
  if (!p.success) return { error: p.error.issues[0]?.message ?? 'Datos no válidos' };
  const store = getStoreAs(staff.id);
  const r = await store.getIndustrialRequest(id);
  if (!r) return { error: 'Solicitud no encontrada.' };
  if (!canEvalTransition(r.eval_status, p.data.status)) return { error: `No se puede pasar de «${EVAL_STATUS[r.eval_status]}» a «${EVAL_STATUS[p.data.status]}».` };
  try { await store.evaluateIndustrialRequest(id, p.data, staff.id); } catch (e) { return { error: (e as Error).message }; }
  if (p.data.status !== r.eval_status)
    await store.addActivity(r.lead_id, 'ingenieria', `Evaluación de ingeniería: ${EVAL_STATUS[p.data.status]}${p.data.kwp ? ` · ${p.data.kwp} kWp estimados` : ''}${p.data.notes ? `\n${p.data.notes}` : ''}`, staff.id).catch(() => {});
  revalidatePath(`/admin/leads/${r.lead_id}`); revalidatePath('/admin/industrial');
  return { ok: true };
}
