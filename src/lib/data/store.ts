import 'server-only';
import { promises as fs, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CalcParams, DEFAULT_PARAMS } from '../engine/params';
import { DEFAULT_TARIFFS } from '../engine/default-tariffs';
import type { Tariff } from '../engine/tariff';
import type { Activity, BlogPost, BlogPostInput, BlogPostRecord, Brand, BrandAssetKind, BrandInput, BrandRecord, Consent, ContentBlockRow, Lead, LeadStage, MediaRef, Order, OrderStatus, Product, ProductInput, ProductRecord, Project, ProjectInput, ProjectRecord, ServiceInput, ServiceRow, StaffUser, StaffUserInput, Stat, Study, TierPrice, MediaBucket, BillUpload, PriceTier, TradeAccount, TradeApplicationInput, TradeReview, OutboundMessage, MessagePayload, CronRun, IndustrialDocument, IndustrialRequestRecord, IndustrialRequestInput } from './types';
import { PAID_STATES } from './types';
import { SEED_BRANDS, SEED_PRODUCTS, SEED_PROJECTS, SEED_STATS } from './seed';
import { effectivePrice } from '../services/catalog';
import { productPricing } from '../services/trade';
import type { ReminderLead } from '../services/followup';
import { sum } from '../engine/solar';
import type { ResourceCache, SourceId, SourceResult } from '../engine/resource';
import { toPublicProject } from '../services/projects';
import { toPublicBrand } from '../services/brands';
import { isLive, toPublicPost } from '../services/blog';

/**
 * Capa de acceso a datos del servidor. Dos implementaciones con la misma interfaz:
 *  - Supabase (producción): service role SOLO en el servidor; la RLS protege accesos desde el navegador.
 *  - Archivo local .data/dev-db.json (desarrollo sin credenciales). Nunca se usa en producción.
 */
export type AccessLinkType = 'invite' | 'recovery';
const CLOSED_STAGES: LeadStage[] = ['ganado', 'perdido'];

export interface Store {
  kind: 'supabase' | 'dev';
  getActiveParams(): Promise<CalcParams>;
  saveParams(p: Omit<CalcParams, 'version'>, actor: string): Promise<CalcParams>;
  /** Solo tarifas activas. */
  listTariffs(): Promise<Tariff[]>;
  /** Crea o actualiza (si trae id). Devuelve el id. */
  saveTariff(t: Tariff): Promise<string>;
  /** La tarifa deja de ofrecerse en la calculadora (se conserva para los estudios que la usaron). */
  deactivateTariff(id: string): Promise<void>;
  createStudy(s: Omit<Study, 'id' | 'code' | 'created_at' | 'unlocked' | 'visit_requested' | 'lead_id'>): Promise<Study>;
  getStudyByCode(code: string): Promise<Study | null>;
  /** Estudios desbloqueados por un lead, del más reciente al más antiguo (ficha del CRM). */
  listStudiesForLead(leadId: string): Promise<Study[]>;
  /** Marca el estudio como desbloqueado y vincula el lead (también a la planilla cargada para ese estudio, si la hay). */
  unlockStudy(code: string, leadId: string): Promise<void>;
  // ---- Planillas subidas por clientes (bucket privado 'bills')
  /** Guarda el archivo en el almacenamiento privado y registra la propuesta de la IA. Devuelve el id. */
  saveBillUpload(f: { bytes: Uint8Array; mime: string; ext: string; extracted: unknown }): Promise<string>;
  getBillUpload(id: string): Promise<BillUpload | null>;
  /** Vincula la carga al estudio con los datos que confirmó el cliente. Solo una vez: false si ya estaba vinculada. */
  confirmBillUpload(id: string, studyId: string, confirmed: unknown): Promise<boolean>;
  listBillUploadsForLead(leadId: string): Promise<BillUpload[]>;
  /** Archivo de la planilla (solo panel): bytes en desarrollo, URL firmada de corta duración en Supabase. */
  getBillFile(id: string): Promise<{ bytes: Uint8Array; mime: string; filename: string } | { signedUrl: string } | null>;
  requestVisit(code: string): Promise<void>;
  createLead(l: Omit<Lead, 'id' | 'created_at' | 'stage' | 'advisor_id'>, consents: Consent[], meta: { ipHash: string; ua: string; policyVersion: string }): Promise<Lead>;
  listLeads(f?: { stage?: LeadStage; advisor?: string }): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  updateLead(id: string, patch: Partial<Lead>, actor: string): Promise<void>;
  addActivity(leadId: string, kind: string, body: string, actor: string | null): Promise<void>;
  listActivities(leadId: string): Promise<Activity[]>;
  hasMarketingConsent(email: string): Promise<boolean>;
  /** `tier`: precios de ese nivel (cuenta comercial aprobada); por defecto, cliente final. */
  listProducts(opts?: { includeUnpublished?: boolean; tier?: PriceTier }): Promise<Product[]>;
  getProductsByIds(ids: string[], tier?: PriceTier): Promise<Product[]>;
  getProductBySlug(slug: string, tier?: PriceTier): Promise<Product | null>;
  // ---- Panel: catálogo (incluye borradores y todos los niveles de precio)
  listProductRecords(): Promise<ProductRecord[]>;
  getProductRecord(id: string): Promise<ProductRecord | null>;
  /** Crea o actualiza (si trae id). Devuelve el id. Lanza Error con mensaje legible ante SKU/URL duplicados. */
  saveProduct(p: ProductInput): Promise<string>;
  /** Lanza Error si el producto figura en pedidos: en ese caso se despublica, no se elimina. */
  deleteProduct(id: string): Promise<void>;
  /** Sube un archivo ya validado al bucket public-media y lo registra en `media`. */
  uploadMedia(f: { bytes: Uint8Array; mime: string; ext: string; kind: 'image' | 'document'; folder: string; alt: string | null; bucket?: MediaBucket }): Promise<MediaRef>;
  /** Documento del bucket privado (solo panel): bytes en desarrollo, URL firmada de corta duración en Supabase. */
  getPrivateDocument(id: string): Promise<{ bytes: Uint8Array; mime: string; filename: string } | { signedUrl: string } | null>;
  createOrder(o: Omit<Order, 'id' | 'number' | 'created_at' | 'status' | 'payment_reference' | 'payment_verified_by' | 'payment_verified_at' | 'whatsapp_message'>): Promise<Order>;
  setOrderWhatsapp(id: string, msg: string, channel: 'cloud_api' | 'wa_link'): Promise<void>;
  listOrders(): Promise<Order[]>;
  // ---- Cuentas comerciales (instaladores y distribuidores)
  /** Registra la solicitud (pendiente). Lanza Error legible si ya hay una solicitud viva con ese correo o RUC. */
  createTradeApplication(a: TradeApplicationInput, leadId: string | null): Promise<string>;
  listTradeAccounts(): Promise<TradeAccount[]>;
  getTradeAccount(id: string): Promise<TradeAccount | null>;
  /** Cuenta APROBADA del usuario autenticado (Supabase Auth), o null. */
  getApprovedTradeAccountForUser(userId: string): Promise<TradeAccount | null>;
  /**
   * Cambia el estado. Al aprobar por primera vez crea el usuario de acceso y devuelve su enlace (token); en los demás
   * casos devuelve null. `actor` es quien aprueba (la base exige Gerencia o superadmin).
   */
  reviewTradeAccount(id: string, r: TradeReview, actor: string): Promise<{ token_hash: string; type: AccessLinkType } | null>;
  /** Nuevo enlace de acceso (activar o restablecer contraseña) para una cuenta aprobada. */
  createTradeAccessToken(id: string): Promise<{ token_hash: string; type: AccessLinkType }>;
  listOrdersForTradeAccount(id: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  updateOrderStatus(id: string, status: OrderStatus, actor: string, payment?: { reference: string }): Promise<void>;
  listStats(): Promise<Stat[]>;
  saveStat(s: Stat): Promise<void>;
  /** Proyectos para lo público, SIEMPRE enmascarados con toPublicProject (regla 3). */
  listProjects(opts?: { includeUnpublished?: boolean }): Promise<Project[]>;
  // ---- Panel: proyectos (datos completos con banderas de autorización)
  listProjectRecords(): Promise<ProjectRecord[]>;
  getProjectRecord(id: string): Promise<ProjectRecord | null>;
  /** Crea o actualiza (si trae id). Devuelve el id. */
  saveProject(p: ProjectInput): Promise<string>;
  deleteProject(id: string): Promise<void>;
  /** Marcas para lo público, SIEMPRE con toPublicBrand (relación solo con respaldo vigente). */
  listBrands(opts?: { includeUnpublished?: boolean }): Promise<Brand[]>;
  listBrandRecords(): Promise<BrandRecord[]>;
  getBrandRecord(id: string): Promise<BrandRecord | null>;
  saveBrand(b: BrandInput): Promise<string>;
  /** Lanza Error si hay productos de la marca. */
  deleteBrand(id: string): Promise<void>;
  // ---- Blog
  /** Solo publicados con fecha cumplida, del más reciente al más antiguo. */
  listPublishedPosts(): Promise<BlogPost[]>;
  getPublishedPost(slug: string): Promise<BlogPost | null>;
  listPostRecords(): Promise<BlogPostRecord[]>;
  getPostRecord(id: string): Promise<BlogPostRecord | null>;
  /** El autor se fija al crear; al editar se conserva. */
  savePost(p: BlogPostInput, author: { id: string; name: string }): Promise<string>;
  deletePost(id: string): Promise<void>;
  // ---- Usuarios del panel
  listUsers(): Promise<StaffUser[]>;
  /** Crea el usuario sin contraseña y devuelve el token del enlace de activación (invitación). */
  createUser(u: Omit<StaffUserInput, 'active'>): Promise<{ id: string; token_hash: string; type: AccessLinkType }>;
  /** El correo no cambia después de crear el usuario. */
  updateUser(id: string, patch: Omit<StaffUserInput, 'email'>): Promise<void>;
  /** Nuevo enlace de acceso (activar o restablecer la contraseña). */
  createAccessToken(id: string): Promise<{ token_hash: string; type: AccessLinkType }>;
  /** Leads abiertos (no ganados ni perdidos) por asesor. */
  openLeadsByAdvisor(): Promise<Record<string, number>>;
  reassignOpenLeads(from: string, to: string, actor: string): Promise<number>;
  // ---- Servicios (filas de la tabla; el catálogo base se combina en services/service-catalog.ts)
  listServiceRows(): Promise<ServiceRow[]>;
  saveService(s: ServiceInput): Promise<string>;
  deleteService(id: string): Promise<void>;
  // ---- Bloques de contenido
  listContentBlocks(): Promise<ContentBlockRow[]>;
  /** Solo publicados, para las páginas públicas. */
  getPublishedBlocks(page: string): Promise<ContentBlockRow[]>;
  saveContentBlock(b: Omit<ContentBlockRow, 'updated_at'>): Promise<void>;
  /** Borra el bloque: la página vuelve al texto base. */
  deleteContentBlock(page: string, slot: string): Promise<void>;
  /** URL pública y datos de archivos de `media` por id (los que no existen se omiten). */
  resolveMedia(ids: string[]): Promise<Record<string, MediaRef>>;
  getSetting<T>(key: string, fallback: T): Promise<T>;
  saveSetting(key: string, value: unknown, actor: string): Promise<void>;
  /** Registra un mensaje en la cola. Con `status: 'pendiente'` y `next_attempt_at`, la tarea programada lo reintenta. */
  queueMessage(m: { channel: 'email' | 'whatsapp'; to: string; template: string; payload: MessagePayload; status: OutboundMessage['status']; error?: string; is_marketing?: boolean; attempts?: number; next_attempt_at?: string | null }): Promise<void>;
  /** Reserva mensajes vencidos (no los toma otra ejecución durante 5 min) y cuenta el intento. */
  claimDueMessages(limit: number): Promise<OutboundMessage[]>;
  /** Resultado de un intento. `clearBody` borra el cuerpo guardado (al enviarse o al quedar en error definitivo). */
  finishMessage(id: string, r: { status: OutboundMessage['status']; error?: string | null; next_attempt_at?: string | null; clearBody?: boolean }): Promise<void>;
  /** Para el panel: sin el cuerpo del correo. */
  listMessages(f?: { status?: OutboundMessage['status']; limit?: number }): Promise<OutboundMessage[]>;
  messageStats(): Promise<Record<OutboundMessage['status'], number> & { sent7d: number }>;
  /** Vuelve a poner en cola un mensaje en error que conserva su cuerpo. false si no se puede. */
  requeueMessage(id: string): Promise<boolean>;
  // ---- Recordatorios y depuración (tareas programadas)
  listLeadsForReminders(): Promise<ReminderLead[]>;
  markLeadReminders(u: { id: string; reminded_for?: string; uncontacted?: boolean }[]): Promise<void>;
  /** Borra planillas (archivo y fila) sin lead creadas antes de `before`. Devuelve cuántas. */
  purgeBillUploads(before: string): Promise<number>;
  pruneRateLimits(): Promise<number>;
  startCronRun(trigger: CronRun['trigger'], actor: string | null): Promise<string>;
  finishCronRun(id: string, r: { ok: boolean; summary: Record<string, unknown>; error?: string | null }): Promise<void>;
  listCronRuns(limit?: number): Promise<CronRun[]>;
  // ---- Cotización industrial (documentos en el bucket privado 'project-docs')
  /** Guarda un documento ya validado, aún sin solicitud. Devuelve su id. */
  saveIndustrialDoc(f: { bytes: Uint8Array; mime: string; ext: string; filename: string }): Promise<string>;
  getIndustrialDocMeta(id: string): Promise<IndustrialDocument | null>;
  /** Crea la solicitud y le vincula los documentos (solo los que aún no tienen solicitud). Devuelve el id. */
  createIndustrialRequest(r: IndustrialRequestInput, docs: { id: string; kind: IndustrialDocument['kind'] }[]): Promise<string>;
  listIndustrialRequests(): Promise<IndustrialRequestRecord[]>;
  getIndustrialRequest(id: string): Promise<IndustrialRequestRecord | null>;
  listIndustrialRequestsForLead(leadId: string): Promise<IndustrialRequestRecord[]>;
  evaluateIndustrialRequest(id: string, e: { status: IndustrialRequestRecord['eval_status']; kwp: number | null; notes: string }, actor: string): Promise<void>;
  /** Archivo (solo panel): bytes en desarrollo, URL firmada de corta duración en Supabase. */
  getIndustrialDocFile(id: string): Promise<{ bytes: Uint8Array; mime: string; filename: string } | { signedUrl: string; mime: string; filename: string } | null>;
  /** Borra documentos sin solicitud subidos antes de `before`. */
  purgeOrphanIndustrialDocs(before: string): Promise<number>;
  // ---- Caché del recurso solar (una fila por celda y fuente)
  getSolarCache(cell: string, source: SourceId): Promise<SourceResult | null>;
  putSolarCache(cell: string, source: SourceId, r: SourceResult, at: { lat: number; lng: number; tilt: number }): Promise<void>;
  solarCacheStats(): Promise<{ rows: number; cells: number; oldest: string | null; newest: string | null; bySource: Record<string, number> }>;
  /** Vacía la caché (todas las filas, o las consultadas antes de `before`). Devuelve cuántas borró. */
  clearSolarCache(before?: string): Promise<number>;
  track(name: string, props?: Record<string, unknown>): Promise<void>;
  countEvents(name: string, sinceDays: number): Promise<number>;
  rateLimit(bucket: string, max: number, windowSec: number): Promise<boolean>;
}

const year = () => new Date().getFullYear();
const pad = (n: number) => String(n).padStart(6, '0');

// ======================= Implementación de desarrollo =======================
type DevDb = {
  params: CalcParams[]; tariffs: Tariff[]; studies: Study[]; leads: Lead[]; activities: Activity[];
  consents: (Consent & { email: string; at: string })[]; products: DevProduct[]; orders: Order[]; stats: Stat[];
  projects: DevProject[]; brands: DevBrand[]; messages: OutboundMessage[]; events: { name: string; at: string; props?: unknown }[];
  seq: { study: number; order: number }; rl: Record<string, { c: number; t: number }>;
  media: { id: string; bucket: string; path: string; kind: 'image' | 'document'; alt: string | null; created_at: string }[];
  content_blocks: ContentBlockRow[];
  services: DevService[];
  posts: DevPost[];
  users: DevUser[];
  settings: Record<string, unknown>;
  bills: (BillUpload & { path: string; mime: string })[];
  trade: DevTrade[];
  cron_runs: CronRun[];
  industrial: Omit<IndustrialRequestRecord, 'documents' | 'lead_name' | 'advisor_id'>[];
  industrial_docs: (IndustrialDocument & { path: string })[];
  solar_cache: Record<string, SourceResult & { cell: string; source: SourceId; lat: number; lng: number; tilt: number }>;
};
/** Cuenta comercial en el archivo local: contraseña scrypt y token de acceso guardado solo como hash. */
type DevTrade = Omit<TradeAccount, 'activated'> & { approved_by: string | null; password_hash?: string; token_hash?: string; token_expires?: number };
/** Usuario de desarrollo: contraseña con scrypt y token de acceso guardado solo como hash SHA-256. */
type DevUser = Omit<StaffUser, 'activated'> & { password_hash?: string; token_hash?: string; token_expires?: number };
type DevPost = Omit<BlogPostRecord, 'cover'> & { cover_id: string | null };
type DevAsset = { id: string; kind: BrandAssetKind; title: string; media_id: string | null; url: string | null };
/** Marca en el archivo local: medios por id; archivos anteriores no traen los campos nuevos. */
type DevBrand = Omit<BrandRecord, 'logo' | 'relationship_doc' | 'assets' | 'relationship_valid_until' | 'sort'> & {
  logo?: unknown; logo_id?: string | null; relationship_doc_id?: string | null; relationship_valid_until?: string | null; sort?: number; assets?: unknown;
  asset_rows?: DevAsset[];
};
type DevService = Omit<ServiceRow, 'cover'> & { cover_id: string | null };
/** Proyecto en el archivo local: medios por id; las banderas faltan en archivos anteriores y valen false. */
type DevProject = Omit<ProjectRecord, 'cover' | 'gallery' | 'client_name_authorized' | 'financials_authorized' | 'testimonial_verified' | 'updated_at'>
  & Partial<Pick<ProjectRecord, 'client_name_authorized' | 'financials_authorized' | 'testimonial_verified' | 'updated_at'>>
  & { cover?: unknown; gallery?: unknown; cover_id?: string | null; gallery_ids?: string[] };
function devProjectRecord(db: DevDb, p: DevProject): ProjectRecord {
  const { cover_id, gallery_ids, cover: _c, gallery: _g, ...base } = p;
  return {
    ...base, client_name_authorized: !!p.client_name_authorized, financials_authorized: !!p.financials_authorized,
    testimonial_verified: !!p.testimonial_verified, updated_at: p.updated_at ?? null,
    cover: cover_id ? devMediaRef(db, cover_id) : null,
    gallery: (gallery_ids ?? []).map((id) => devMediaRef(db, id)).filter((m): m is MediaRef => !!m),
  };
}
/** En el archivo local el producto guarda los precios por nivel y los ids de medios; `price`, `images`, etc. se derivan al leer. */
type DevProduct = Product & { brand_id?: string | null; prices?: TierPrice[]; image_ids?: string[]; datasheet_id?: string | null; updated_at?: string | null };
const DEV_MEDIA_DIR = path.join(process.cwd(), '.data', 'media');
/** Archivos privados de desarrollo: fuera de .data/media, nunca servidos por /api/dev-media. */
const DEV_PRIVATE_DIR = path.join(process.cwd(), '.data', 'private');
/** Ruta protegida del panel para documentos privados (requiere sesión con permiso). */
export const privateDocUrl = (id: string) => `/admin/documentos/${id}`;
export const devMediaFile = (rel: string) => path.join(DEV_MEDIA_DIR, rel);
const devMediaUrl = (rel: string) => `/api/dev-media/${rel}`;
const devPrices = (p: DevProduct): TierPrice[] => p.prices ?? [{ tier: 'final', price: p.price, promo_price: p.promo_price, promo_until: null }];
const devMediaRef = (db: DevDb, id: string): MediaRef | null => {
  const m = db.media.find((x) => x.id === id);
  return m ? { id: m.id, path: m.path, url: m.bucket === 'private-docs' ? privateDocUrl(m.id) : devMediaUrl(m.path), alt: m.alt } : null;
};
function devBrandRecord(db: DevDb, b: DevBrand): BrandRecord {
  return {
    id: b.id, slug: b.slug, name: b.name, description: b.description, relationship: b.relationship, relationship_verified: b.relationship_verified,
    published: b.published, sort: b.sort ?? 0, relationship_valid_until: b.relationship_valid_until ?? null,
    logo: b.logo_id ? devMediaRef(db, b.logo_id) : null,
    relationship_doc: b.relationship_doc_id ? devMediaRef(db, b.relationship_doc_id) : null,
    assets: (b.asset_rows ?? []).map((a) => ({ id: a.id, kind: a.kind, title: a.title, url: a.url, media: a.media_id ? devMediaRef(db, a.media_id) : null })),
  };
}
const devPostRecord = (db: DevDb, p: DevPost): BlogPostRecord => {
  const { cover_id, ...rest } = p;
  return { ...rest, cover: cover_id ? devMediaRef(db, cover_id) : null };
};
const byDateDesc = (a: { published_at: string | null }, b: { published_at: string | null }) => (b.published_at ?? '').localeCompare(a.published_at ?? '');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const devUserOut = (u: DevUser): StaffUser => {
  const { password_hash, token_hash: _t, token_expires: _e, ...rest } = u;
  return { ...rest, activated: !!password_hash };
};
/** Emite un token de acceso de desarrollo (24 h). Solo su hash queda guardado. */
function devIssueToken(u: { token_hash?: string; token_expires?: number }) {
  const token = randomBytes(32).toString('base64url');
  u.token_hash = sha256(token); u.token_expires = Date.now() + 24 * 3600e3;
  return token;
}
function devLegacyMessage(m: unknown): OutboundMessage {
  const o = m as { channel?: 'email' | 'whatsapp'; to?: string; template?: string; payload?: MessagePayload; status?: string; error?: string; at?: string };
  const status = o.status === 'pendiente' ? 'error' : ((o.status ?? 'error') as OutboundMessage['status']);
  return {
    id: randomUUID(), channel: o.channel ?? 'email', to_address: o.to ?? '', template: o.template ?? '', payload: { subject: o.payload?.subject ?? '' },
    is_marketing: false, status, error: o.status === 'pendiente' ? `${o.error ?? ''} · sin cuerpo guardado (anterior a 0007)` : o.error ?? null,
    attempts: 0, created_at: o.at ?? new Date().toISOString(), sent_at: status === 'enviado' ? o.at ?? null : null, next_attempt_at: null, last_attempt_at: null,
  };
}
const DEV_PROJECT_DOCS = path.join(DEV_PRIVATE_DIR, 'project-docs');
const devDocOut = ({ path: _p, ...d }: IndustrialDocument & { path: string }): IndustrialDocument => d;
function devIndustrialRecord(db: DevDb, r: DevDb['industrial'][number]): IndustrialRequestRecord {
  const lead = db.leads.find((l) => l.id === r.lead_id);
  return { ...r, lead_name: lead?.full_name ?? null, advisor_id: lead?.advisor_id ?? null, documents: db.industrial_docs.filter((d) => d.request_id === r.id).map(devDocOut) };
}
function solarStats(rows: { cell: string; source: string; fetched_at: string }[]) {
  const dates = rows.map((r) => r.fetched_at).sort();
  const bySource: Record<string, number> = {};
  for (const r of rows) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  return { rows: rows.length, cells: new Set(rows.map((r) => r.cell)).size, oldest: dates[0] ?? null, newest: dates.at(-1) ?? null, bySource };
}
/** Adaptador de la caché del almacén para el motor (src/lib/engine/resource.ts). */
export const solarResourceCache = (): ResourceCache => {
  const st = getStore();
  return { get: (c, s) => st.getSolarCache(c, s), put: (c, s, r, at) => st.putSolarCache(c, s, r, at) };
};
const withoutBody = (m: OutboundMessage): OutboundMessage => ({ ...m, payload: { subject: m.payload?.subject ?? '', has_body: !!m.payload?.html } });
const EMPTY_STATS = { pendiente: 0, enviado: 0, error: 0, bloqueado_sin_consentimiento: 0 };
const devTradeOut = (t: DevTrade): TradeAccount => {
  const { password_hash, token_hash: _t, token_expires: _e, ...rest } = t;
  return { ...rest, activated: !!password_hash };
};
/** Autenticación de clientes comerciales en modo desarrollo. La usa solo src/lib/trade-auth.ts. */
export const devTradeAuth = {
  findById: (id: string) => tx((db) => { const t = db.trade.find((x) => x.id === id); return t ? { ...t } : null; }),
  findByEmail: (email: string) => tx((db) => { const t = db.trade.find((x) => x.email === email.trim().toLowerCase() && x.status !== 'rechazada'); return t ? { ...t } : null; }),
  consumeToken: (token: string) => tx((db) => {
    const h = sha256(token);
    const t = db.trade.find((x) => x.token_hash === h);
    if (!t || !t.token_expires || t.token_expires < Date.now()) return null;
    delete t.token_hash; delete t.token_expires;
    return { ...t };
  }),
  setPasswordHash: (id: string, hash: string) => tx((db) => { const t = db.trade.find((x) => x.id === id); if (t) t.password_hash = hash; }),
};
/** Autenticación de usuarios en modo desarrollo (sin Supabase). La usa solo src/lib/auth.ts. */
export const devUserAuth = {
  findById: (id: string) => tx((db) => db.users.find((u) => u.id === id) ?? null),
  findByEmail: (email: string) => tx((db) => db.users.find((u) => u.email === email.trim().toLowerCase()) ?? null),
  /** Consume el token (un solo uso). Devuelve el usuario o null si no existe o venció. */
  consumeToken: (token: string) => tx((db) => {
    const h = sha256(token);
    const u = db.users.find((x) => x.token_hash === h);
    if (!u || !u.token_expires || u.token_expires < Date.now()) return null;
    delete u.token_hash; delete u.token_expires;
    return { ...u };
  }),
  setPasswordHash: (id: string, hash: string) => tx((db) => { const u = db.users.find((x) => x.id === id); if (u) u.password_hash = hash; }),
};
const devServiceRow = (db: DevDb, s: DevService): ServiceRow => {
  const { cover_id, ...rest } = s;
  return { ...rest, cover: cover_id ? devMediaRef(db, cover_id) : null };
};
const devBrandName = (db: DevDb, p: DevProduct) => (p.brand_id !== undefined ? (p.brand_id ? db.brands.find((b) => b.id === p.brand_id)?.name ?? null : null) : p.brand);
function devPublic(db: DevDb, p: DevProduct, tier: PriceTier = 'final'): Product {
  const { brand_id: _b, prices: _p, image_ids, datasheet_id, updated_at: _u, ...base } = p;
  const eff = tier === 'final' ? effectivePrice(devPrices(p)) ?? { price: 0, promo_price: null } : productPricing(devPrices(p), tier);
  return {
    ...base, ...eff, brand: devBrandName(db, p),
    images: image_ids ? image_ids.map((id) => devMediaRef(db, id)?.url).filter((u): u is string => !!u) : p.images,
    datasheet_url: datasheet_id !== undefined ? (datasheet_id ? devMediaRef(db, datasheet_id)?.url ?? null : null) : p.datasheet_url,
  };
}
function devRecord(db: DevDb, p: DevProduct): ProductRecord {
  const { price: _pr, promo_price: _pp, images: _i, datasheet_url: _d, image_ids, datasheet_id, ...base } = p;
  return {
    ...base, brand: devBrandName(db, p), brand_id: p.brand_id ?? null, prices: devPrices(p), updated_at: p.updated_at ?? null,
    images: (image_ids ?? []).map((id) => devMediaRef(db, id)).filter((m): m is MediaRef => !!m),
    datasheet: datasheet_id ? devMediaRef(db, datasheet_id) : null,
  };
}
/** Las pruebas de extremo a extremo usan su propia copia (DEV_DB_FILE) para no tocar el archivo versionado. */
const DEV_FILE = process.env.DEV_DB_FILE ? path.resolve(process.env.DEV_DB_FILE) : path.join(process.cwd(), '.data', 'dev-db.json');
/**
 * Estado del almacén de desarrollo COMPARTIDO por todo el proceso. En `next dev` cada ruta se compila por separado y
 * este módulo se instancia varias veces; con variables de módulo, cada instancia tenía su propia copia de la base y al
 * guardar sobrescribía los cambios de las demás (escrituras perdidas). globalThis es único por proceso.
 */
const devState: { cache: DevDb | null; lock: Promise<unknown> } =
  ((globalThis as { __eseDevStore?: { cache: DevDb | null; lock: Promise<unknown> } }).__eseDevStore ??= { cache: null, lock: Promise.resolve() });

async function devLoad(): Promise<DevDb> {
  if (devState.cache) return devState.cache;
  let raw: string | null = null;
  // Lectura SÍNCRONA a propósito: en `next dev`, React 19 registra el valor de cada E/S asíncrona que espera un
  // componente de servidor y lo envía al navegador para DevTools. Con fs.readFile, el archivo completo (incluidos
  // datos no autorizados) acababa en el HTML de la primera página renderizada. En producción no ocurre.
  try { raw = readFileSync(DEV_FILE, 'utf8'); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  // Solo se crea una base nueva si el archivo no existe: un JSON dañado se reporta, nunca se sobrescribe con la semilla.
  if (raw != null) {
    const db = JSON.parse(raw) as DevDb;
    db.media ??= []; db.content_blocks ??= []; db.services ??= []; db.posts ??= []; db.users ??= []; db.settings ??= {}; db.bills ??= []; db.trade ??= []; db.cron_runs ??= []; db.solar_cache ??= {}; db.industrial ??= []; db.industrial_docs ??= [];
    // Mensajes de archivos anteriores (sin id ni cuerpo): no se pueden reintentar.
    db.messages = (db.messages ?? []).map((m) => (m as Partial<OutboundMessage>).id ? m : devLegacyMessage(m));
    devState.cache = db;
  }
  else {
    devState.cache = { params: [{ ...DEFAULT_PARAMS, version: 1 }], tariffs: DEFAULT_TARIFFS.map((t) => ({ ...t, id: randomUUID() })), studies: [], leads: [], activities: [], consents: [],
      products: SEED_PRODUCTS, orders: [], stats: SEED_STATS, projects: SEED_PROJECTS, brands: SEED_BRANDS, messages: [], events: [], seq: { study: 0, order: 999 }, rl: {}, media: [], content_blocks: [], services: [], posts: [], users: [], settings: {}, bills: [], trade: [], cron_runs: [], solar_cache: {}, industrial: [], industrial_docs: [] };
    await devSave();
  }
  return devState.cache!;
}
async function devSave() {
  // Escritura atómica (archivo temporal + rename): una lectura concurrente nunca ve un JSON a medio escribir.
  await fs.mkdir(path.dirname(DEV_FILE), { recursive: true });
  const tmp = `${DEV_FILE}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(devState.cache, null, 1));
  await fs.rename(tmp, DEV_FILE);
}
function tx<T>(fn: (db: DevDb) => T | Promise<T>): Promise<T> {
  const run = devState.lock.then(async () => { const db = await devLoad(); const r = await fn(db); await devSave(); return r; });
  devState.lock = run.catch(() => undefined);
  return run;
}

const devStore: Store = {
  kind: 'dev',
  // Igual que Supabase: se valida y se completan los campos agregados después (versiones guardadas antes).
  getActiveParams: () => tx((db) => CalcParams.parse(db.params[db.params.length - 1])),
  saveParams: (p) => tx((db) => { const v = { ...p, version: db.params.length + 1 } as CalcParams; db.params.push(v); return v; }),
  listTariffs: () => tx((db) => db.tariffs.filter((t) => (t as Tariff & { active?: boolean }).active !== false)),
  saveTariff: (t) => tx((db) => {
    const i = t.id ? db.tariffs.findIndex((x) => x.id === t.id) : -1;
    if (t.id && i < 0) throw new Error('Tarifa no encontrada.');
    const row = { ...t, id: t.id ?? randomUUID(), valid_from: t.valid_from ?? new Date().toISOString().slice(0, 10) };
    if (i >= 0) db.tariffs[i] = row; else db.tariffs.push(row);
    return row.id;
  }),
  deactivateTariff: (id) => tx((db) => { const t = db.tariffs.find((x) => x.id === id); if (t) (t as Tariff & { active?: boolean }).active = false; }),
  createStudy: (s) => tx((db) => {
    const st: Study = { ...s, id: randomUUID(), code: `ESE-${year()}-${pad(++db.seq.study)}`, lead_id: null, unlocked: false, visit_requested: false, created_at: new Date().toISOString() };
    db.studies.push(st); return st;
  }),
  getStudyByCode: (code) => tx((db) => db.studies.find((s) => s.code === code) ?? null),
  listStudiesForLead: (leadId) => tx((db) => db.studies.filter((s) => s.lead_id === leadId).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10)),
  unlockStudy: (code, leadId) => tx((db) => {
    const s = db.studies.find((x) => x.code === code);
    if (!s) return;
    s.unlocked = true; s.lead_id = leadId;
    for (const b of db.bills) if (b.study_id === s.id) b.lead_id = leadId;
  }),
  saveBillUpload: async (f) => {
    const id = randomUUID();
    const rel = `bills/${id}.${f.ext}`;
    const file = path.join(DEV_PRIVATE_DIR, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, f.bytes);
    return tx((db) => {
      db.bills.push({ id, path: rel, mime: f.mime, study_id: null, lead_id: null, extracted: f.extracted, confirmed_by_user: false, created_at: new Date().toISOString() });
      return id;
    });
  },
  getBillUpload: (id) => tx((db) => { const b = db.bills.find((x) => x.id === id); if (!b) return null; const { path: _p, mime: _m, ...row } = b; return row; }),
  confirmBillUpload: (id, studyId, confirmed) => tx((db) => {
    const b = db.bills.find((x) => x.id === id);
    if (!b || b.confirmed_by_user || b.study_id) return false;
    b.study_id = studyId; b.confirmed_by_user = true;
    b.extracted = { ...(b.extracted as object), confirmed };
    return true;
  }),
  listBillUploadsForLead: (leadId) => tx((db) => db.bills.filter((b) => b.lead_id === leadId).map(({ path: _p, mime: _m, ...row }) => row)),
  getBillFile: async (id) => {
    const b = await tx((db) => db.bills.find((x) => x.id === id) ?? null);
    if (!b) return null;
    try { return { bytes: new Uint8Array(await fs.readFile(path.join(DEV_PRIVATE_DIR, b.path))), mime: b.mime, filename: path.basename(b.path) }; }
    catch { return null; }
  },
  requestVisit: (code) => tx((db) => { const s = db.studies.find((x) => x.code === code); if (s) s.visit_requested = true; }),
  createLead: (l, consents, meta) => tx((db) => {
    const lead: Lead = { ...l, id: randomUUID(), stage: 'nuevo', advisor_id: null, created_at: new Date().toISOString() };
    db.leads.push(lead);
    for (const c of consents) db.consents.push({ ...c, email: l.email, at: lead.created_at });
    db.activities.push({ id: randomUUID(), lead_id: lead.id, kind: 'sistema', body: `Lead creado desde ${l.source} (política ${meta.policyVersion})`, at: lead.created_at, actor: null });
    return lead;
  }),
  listLeads: (f) => tx((db) => db.leads.filter((l) => (!f?.stage || l.stage === f.stage) && (!f?.advisor || l.advisor_id === f.advisor)).sort((a, b) => b.created_at.localeCompare(a.created_at))),
  getLead: (id) => tx((db) => db.leads.find((l) => l.id === id) ?? null),
  updateLead: (id, patch, actor) => tx((db) => {
    const l = db.leads.find((x) => x.id === id); if (!l) return;
    if (patch.stage && patch.stage !== l.stage) {
      db.activities.push({ id: randomUUID(), lead_id: id, kind: 'cambio_etapa', body: `${l.stage} → ${patch.stage}`, at: new Date().toISOString(), actor });
      if (l.stage === 'nuevo' && !l.first_contact_at) l.first_contact_at = new Date().toISOString();
    }
    Object.assign(l, patch);
  }),
  addActivity: (leadId, kind, body, actor) => tx((db) => { db.activities.push({ id: randomUUID(), lead_id: leadId, kind, body, at: new Date().toISOString(), actor }); }),
  listActivities: (leadId) => tx((db) => db.activities.filter((a) => a.lead_id === leadId).sort((a, b) => b.at.localeCompare(a.at))),
  hasMarketingConsent: (email) => tx((db) => {
    const last = db.consents.filter((c) => c.email === email && c.purpose === 'comercial_marketing').at(-1);
    return !!last?.granted;
  }),
  listProducts: (o) => tx((db) => db.products.filter((p) => o?.includeUnpublished || p.published).map((p) => devPublic(db, p, o?.tier))),
  getProductsByIds: (ids, tier) => tx((db) => db.products.filter((p) => ids.includes(p.id) && p.published).map((p) => devPublic(db, p, tier))),
  getProductBySlug: (slug, tier) => tx((db) => { const p = db.products.find((x) => x.slug === slug && x.published); return p ? devPublic(db, p, tier) : null; }),
  listProductRecords: () => tx((db) => db.products.map((p) => devRecord(db, p)).sort((a, b) => a.name.localeCompare(b.name, 'es'))),
  getProductRecord: (id) => tx((db) => { const p = db.products.find((x) => x.id === id); return p ? devRecord(db, p) : null; }),
  saveProduct: (input) => tx((db) => {
    const dup = db.products.find((x) => x.id !== input.id && (x.sku === input.sku || x.slug === input.slug));
    if (dup) throw new Error(dup.sku === input.sku ? `Ya existe otro producto con el SKU ${input.sku}.` : `Ya existe otro producto con la URL /tienda/${input.slug}.`);
    if (input.brand_id && !db.brands.some((b) => b.id === input.brand_id)) throw new Error('La marca seleccionada no existe.');
    for (const id of [...input.image_ids, ...(input.datasheet_id ? [input.datasheet_id] : [])])
      if (!db.media.some((m) => m.id === id)) throw new Error('Una de las imágenes o la ficha técnica ya no existe. Vuelve a cargarla.');
    const { id, image_ids, datasheet_id, ...rest } = input;
    const eff = effectivePrice(rest.prices) ?? { price: 0, promo_price: null };
    const row: DevProduct = { ...rest, id: id ?? randomUUID(), brand: null, price: eff.price, promo_price: eff.promo_price, images: [], datasheet_url: null,
      image_ids, datasheet_id, updated_at: new Date().toISOString() };
    row.brand = devBrandName(db, row);
    if (id) {
      const i = db.products.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('Producto no encontrado.');
      db.products[i] = row;
    } else db.products.push(row);
    return row.id;
  }),
  deleteProduct: (id) => tx((db) => {
    if (db.orders.some((o) => o.items.some((i) => i.product_id === id))) throw new Error('Este producto figura en pedidos registrados: despublícalo en lugar de eliminarlo para conservar el historial.');
    db.products = db.products.filter((p) => p.id !== id);
  }),
  uploadMedia: async (f) => {
    const bucket = f.bucket ?? 'public-media';
    const rel = `${f.folder}/${randomUUID()}.${f.ext}`;
    const file = path.join(bucket === 'private-docs' ? DEV_PRIVATE_DIR : DEV_MEDIA_DIR, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, f.bytes);
    return tx((db) => {
      const m = { id: randomUUID(), bucket, path: rel, kind: f.kind, alt: f.alt, created_at: new Date().toISOString() };
      db.media.push(m);
      return devMediaRef(db, m.id)!;
    });
  },
  getPrivateDocument: async (id) => {
    const m = await tx((db) => db.media.find((x) => x.id === id && x.bucket === 'private-docs') ?? null);
    if (!m) return null;
    try {
      const bytes = new Uint8Array(await fs.readFile(path.join(DEV_PRIVATE_DIR, m.path)));
      return { bytes, mime: m.path.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream', filename: path.basename(m.path) };
    } catch { return null; }
  },
  createOrder: (o) => tx((db) => {
    const ord: Order = { ...o, id: randomUUID(), number: `ESE-P-${year()}-${pad(++db.seq.order)}`, status: 'nuevo', payment_reference: null,
      payment_verified_by: null, payment_verified_at: null, whatsapp_message: '', created_at: new Date().toISOString() };
    db.orders.push(ord); return ord;
  }),
  setOrderWhatsapp: (id, msg) => tx((db) => { const o = db.orders.find((x) => x.id === id); if (o) o.whatsapp_message = msg; }),
  listOrders: () => tx((db) => [...db.orders].sort((a, b) => b.created_at.localeCompare(a.created_at))),
  createTradeApplication: (a, leadId) => tx((db) => {
    const live = db.trade.filter((t) => t.status !== 'rechazada');
    if (live.some((t) => t.email === a.email)) throw new Error('Ya existe una solicitud o cuenta con ese correo. Si olvidaste tu contraseña, recupérala desde «Ingresar».');
    if (live.some((t) => t.ruc === a.ruc)) throw new Error('Ya existe una solicitud o cuenta con ese RUC. Escríbenos si necesitas agregar otra persona de contacto.');
    const now = new Date().toISOString();
    const t: DevTrade = { ...a, id: randomUUID(), status: 'pendiente', review_note: null, reviewed_at: null, approved_by: null, lead_id: leadId, created_at: now, updated_at: now };
    db.trade.push(t);
    return t.id;
  }),
  listTradeAccounts: () => tx((db) => [...db.trade].sort((a, b) => b.created_at.localeCompare(a.created_at)).map(devTradeOut)),
  getTradeAccount: (id) => tx((db) => { const t = db.trade.find((x) => x.id === id); return t ? devTradeOut(t) : null; }),
  getApprovedTradeAccountForUser: (id) => tx((db) => { const t = db.trade.find((x) => x.id === id && x.status === 'aprobada'); return t ? devTradeOut(t) : null; }),
  reviewTradeAccount: (id, r, actor) => tx((db) => {
    const t = db.trade.find((x) => x.id === id);
    if (!t) throw new Error('Cuenta no encontrada.');
    const firstApproval = r.status === 'aprobada' && !t.password_hash && !t.approved_by;
    Object.assign(t, { status: r.status, tier: r.tier, review_note: r.review_note || null, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (r.status === 'aprobada' || r.status === 'suspendida') t.approved_by = actor;
    return firstApproval ? { token_hash: devIssueToken(t), type: 'invite' as AccessLinkType } : null;
  }),
  createTradeAccessToken: (id) => tx((db) => {
    const t = db.trade.find((x) => x.id === id);
    if (!t || t.status !== 'aprobada') throw new Error('La cuenta no está aprobada.');
    return { token_hash: devIssueToken(t), type: (t.password_hash ? 'recovery' : 'invite') as AccessLinkType };
  }),
  listOrdersForTradeAccount: (id) => tx((db) => db.orders.filter((o) => o.trade_account_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at))),
  getOrder: (id) => tx((db) => db.orders.find((o) => o.id === id) ?? null),
  updateOrderStatus: (id, status, actor, payment) => tx((db) => {
    const o = db.orders.find((x) => x.id === id); if (!o) throw new Error('Pedido no encontrado');
    if (payment) { o.payment_reference = payment.reference; o.payment_verified_by = actor; o.payment_verified_at = new Date().toISOString(); }
    if (PAID_STATES.includes(status) && !(o.payment_reference && o.payment_verified_by)) throw new Error('No se puede marcar como pagado sin una confirmación de pago verificada.');
    o.status = status;
  }),
  listStats: () => tx((db) => [...db.stats].sort((a, b) => a.sort - b.sort)),
  saveStat: (s) => tx((db) => { const i = db.stats.findIndex((x) => x.id === s.id); if (i >= 0) db.stats[i] = s; else db.stats.push(s); }),
  // Mismo orden que Supabase: ejecución más reciente primero, sin fecha al final.
  listProjects: (o) => tx((db) => db.projects.filter((p) => o?.includeUnpublished || p.published)
    .sort((a, b) => (b.executed_on ?? '').localeCompare(a.executed_on ?? ''))
    .map((p) => toPublicProject(devProjectRecord(db, p)))),
  listProjectRecords: () => tx((db) => db.projects.map((p) => devProjectRecord(db, p)).sort((a, b) => a.title.localeCompare(b.title, 'es'))),
  getProjectRecord: (id) => tx((db) => { const p = db.projects.find((x) => x.id === id); return p ? devProjectRecord(db, p) : null; }),
  saveProject: (input) => tx((db) => {
    if (db.projects.some((x) => x.id !== input.id && x.slug === input.slug)) throw new Error(`Ya existe otro proyecto con la URL /proyectos/${input.slug}.`);
    for (const id of [...input.gallery_ids, ...(input.cover_id ? [input.cover_id] : [])])
      if (!db.media.some((m) => m.id === id)) throw new Error('Una de las fotos ya no existe. Vuelve a cargarla.');
    const { id, ...rest } = input;
    const prev = id ? db.projects.find((x) => x.id === id) : undefined;
    if (id && !prev) throw new Error('Proyecto no encontrado.');
    const row: DevProject = { ...rest, id: id ?? randomUUID(), is_placeholder: prev?.is_placeholder ?? false, updated_at: new Date().toISOString() };
    if (prev) db.projects[db.projects.indexOf(prev)] = row; else db.projects.push(row);
    return row.id;
  }),
  deleteProject: (id) => tx((db) => { db.projects = db.projects.filter((p) => p.id !== id); }),
  listBrands: (o) => tx((db) => db.brands.filter((b) => o?.includeUnpublished || b.published)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((b) => toPublicBrand(devBrandRecord(db, b)))),
  listBrandRecords: () => tx((db) => db.brands.map((b) => devBrandRecord(db, b)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'es'))),
  getBrandRecord: (id) => tx((db) => { const b = db.brands.find((x) => x.id === id); return b ? devBrandRecord(db, b) : null; }),
  saveBrand: (input) => tx((db) => {
    if (db.brands.some((x) => x.id !== input.id && x.slug === input.slug)) throw new Error(`Ya existe otra marca con el identificador «${input.slug}».`);
    const ids = [input.logo_id, input.relationship_doc_id, ...input.assets.map((a) => a.media_id)].filter((x): x is string => !!x);
    for (const id of ids) if (!db.media.some((m) => m.id === id)) throw new Error('Uno de los archivos ya no existe. Vuelve a cargarlo.');
    if (input.relationship_doc_id && db.media.find((m) => m.id === input.relationship_doc_id)?.bucket !== 'private-docs') throw new Error('El documento de respaldo debe estar en el almacenamiento privado.');
    const { id, logo_id, relationship_doc_id, assets, ...rest } = input;
    const prev = id ? db.brands.find((x) => x.id === id) : undefined;
    if (id && !prev) throw new Error('Marca no encontrada.');
    const row: DevBrand = { ...rest, id: id ?? randomUUID(), logo_id, relationship_doc_id, asset_rows: assets.map((a) => ({ ...a, id: a.id ?? randomUUID() })) };
    if (prev) db.brands[db.brands.indexOf(prev)] = row; else db.brands.push(row);
    return row.id;
  }),
  deleteBrand: (id) => tx((db) => {
    if (db.products.some((p) => p.brand_id === id)) throw new Error('Hay productos de esta marca: cámbiales la marca o despublica la marca en lugar de eliminarla.');
    db.brands = db.brands.filter((b) => b.id !== id);
  }),
  listPublishedPosts: () => tx((db) => db.posts.filter((p) => isLive(p)).sort(byDateDesc).map((p) => toPublicPost(devPostRecord(db, p)))),
  getPublishedPost: (slug) => tx((db) => { const p = db.posts.find((x) => x.slug === slug && isLive(x)); return p ? toPublicPost(devPostRecord(db, p)) : null; }),
  listPostRecords: () => tx((db) => db.posts.map((p) => devPostRecord(db, p)).sort((a, b) => Number(a.published) - Number(b.published) || byDateDesc(a, b))),
  getPostRecord: (id) => tx((db) => { const p = db.posts.find((x) => x.id === id); return p ? devPostRecord(db, p) : null; }),
  savePost: (input, author) => tx((db) => {
    if (db.posts.some((x) => x.id !== input.id && x.slug === input.slug)) throw new Error(`Ya existe otro artículo con la URL /blog/${input.slug}.`);
    if (input.cover_id && !db.media.some((m) => m.id === input.cover_id)) throw new Error('La imagen ya no existe. Vuelve a cargarla.');
    const { id, ...rest } = input;
    const prev = id ? db.posts.find((x) => x.id === id) : undefined;
    if (id && !prev) throw new Error('Artículo no encontrado.');
    const row: DevPost = { ...rest, id: id ?? randomUUID(), author_id: prev ? prev.author_id : author.id, author: prev ? prev.author : author.name };
    if (prev) db.posts[db.posts.indexOf(prev)] = row; else db.posts.push(row);
    return row.id;
  }),
  deletePost: (id) => tx((db) => { db.posts = db.posts.filter((p) => p.id !== id); }),
  listUsers: () => tx((db) => db.users.map(devUserOut).sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name, 'es'))),
  createUser: (input) => tx((db) => {
    const email = input.email.toLowerCase();
    if (db.users.some((u) => u.email === email)) throw new Error('Ya existe un usuario con ese correo.');
    const u: DevUser = { ...input, email, id: randomUUID(), active: true, created_at: new Date().toISOString() };
    const token = devIssueToken(u);
    db.users.push(u);
    return { id: u.id, token_hash: token, type: 'invite' as const };
  }),
  updateUser: (id, patch) => tx((db) => { const u = db.users.find((x) => x.id === id); if (!u) throw new Error('Usuario no encontrado.'); Object.assign(u, patch); }),
  createAccessToken: (id) => tx((db) => {
    const u = db.users.find((x) => x.id === id);
    if (!u) throw new Error('Usuario no encontrado.');
    return { token_hash: devIssueToken(u), type: (u.password_hash ? 'recovery' : 'invite') as AccessLinkType };
  }),
  openLeadsByAdvisor: () => tx((db) => db.leads.filter((l) => l.advisor_id && !CLOSED_STAGES.includes(l.stage))
    .reduce<Record<string, number>>((a, l) => { a[l.advisor_id!] = (a[l.advisor_id!] ?? 0) + 1; return a; }, {})),
  reassignOpenLeads: (from, to, actor) => tx((db) => {
    const at = new Date().toISOString();
    const moved = db.leads.filter((l) => l.advisor_id === from && !CLOSED_STAGES.includes(l.stage));
    for (const l of moved) { l.advisor_id = to; db.activities.push({ id: randomUUID(), lead_id: l.id, kind: 'sistema', body: 'Lead reasignado por desactivación del asesor', at, actor }); }
    return moved.length;
  }),
  listServiceRows: () => tx((db) => db.services.map((s) => devServiceRow(db, s))),
  saveService: (input) => tx((db) => {
    if (db.services.some((x) => x.id !== input.id && x.slug === input.slug)) throw new Error(`Ya existe otro servicio con la URL /servicios/${input.slug}.`);
    if (input.cover_id && !db.media.some((m) => m.id === input.cover_id)) throw new Error('La imagen ya no existe. Vuelve a cargarla.');
    const { id, ...rest } = input;
    const prev = id ? db.services.find((x) => x.id === id) : undefined;
    if (id && !prev) throw new Error('Servicio no encontrado.');
    const row: DevService = { ...rest, id: id ?? randomUUID() };
    if (prev) db.services[db.services.indexOf(prev)] = row; else db.services.push(row);
    return row.id;
  }),
  deleteService: (id) => tx((db) => { db.services = db.services.filter((s) => s.id !== id); }),
  listContentBlocks: () => tx((db) => db.content_blocks.map((b) => ({ ...b }))),
  getPublishedBlocks: (page) => tx((db) => db.content_blocks.filter((b) => b.page === page && b.published).map((b) => ({ ...b }))),
  saveContentBlock: (b) => tx((db) => {
    const row = { ...b, updated_at: new Date().toISOString() };
    const i = db.content_blocks.findIndex((x) => x.page === b.page && x.slot === b.slot);
    if (i >= 0) db.content_blocks[i] = row; else db.content_blocks.push(row);
  }),
  deleteContentBlock: (page, slot) => tx((db) => { db.content_blocks = db.content_blocks.filter((x) => !(x.page === page && x.slot === slot)); }),
  resolveMedia: (ids) => tx((db) => Object.fromEntries(ids.map((id) => [id, devMediaRef(db, id)] as const).filter((e): e is [string, MediaRef] => !!e[1]))),
  getSetting: (key, fallback) => tx((db) => (key in db.settings ? structuredClone(db.settings[key]) : fallback) as typeof fallback),
  saveSetting: (key, value) => tx((db) => { db.settings[key] = structuredClone(value); }),
  queueMessage: (m) => tx((db) => {
    const now = new Date().toISOString();
    db.messages.push({ id: randomUUID(), channel: m.channel, to_address: m.to, template: m.template, payload: m.payload, is_marketing: !!m.is_marketing, status: m.status,
      error: m.error ?? null, attempts: m.attempts ?? 0, created_at: now, sent_at: m.status === 'enviado' ? now : null, next_attempt_at: m.next_attempt_at ?? null, last_attempt_at: m.attempts ? now : null });
  }),
  claimDueMessages: (limit) => tx((db) => {
    const now = Date.now();
    const due = db.messages.filter((m) => m.status === 'pendiente' && m.next_attempt_at && Date.parse(m.next_attempt_at) <= now)
      .sort((a, b) => a.next_attempt_at!.localeCompare(b.next_attempt_at!)).slice(0, limit);
    for (const m of due) { m.attempts += 1; m.last_attempt_at = new Date(now).toISOString(); m.next_attempt_at = new Date(now + 300e3).toISOString(); }
    return due.map((m) => ({ ...m }));
  }),
  finishMessage: (id, r) => tx((db) => {
    const m = db.messages.find((x) => x.id === id); if (!m) return;
    m.status = r.status; m.error = r.error ?? null; m.next_attempt_at = r.next_attempt_at ?? null;
    if (r.status === 'enviado') m.sent_at = new Date().toISOString();
    if (r.clearBody) m.payload = { subject: m.payload.subject };
  }),
  listMessages: (f) => tx((db) => db.messages.filter((m) => !f?.status || m.status === f.status).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, f?.limit ?? 100).map(withoutBody)),
  messageStats: () => tx((db) => {
    const st = { ...EMPTY_STATS, sent7d: 0 };
    const since = Date.now() - 7 * 86_400e3;
    for (const m of db.messages) { st[m.status] += 1; if (m.status === 'enviado' && m.sent_at && Date.parse(m.sent_at) >= since) st.sent7d += 1; }
    return st;
  }),
  requeueMessage: (id) => tx((db) => {
    const m = db.messages.find((x) => x.id === id);
    if (!m || m.status !== 'error' || !m.payload?.html) return false;
    Object.assign(m, { status: 'pendiente', attempts: 0, error: null, next_attempt_at: new Date().toISOString() });
    return true;
  }),
  listLeadsForReminders: () => tx((db) => db.leads.filter((l) => !CLOSED_STAGES.includes(l.stage) && (l.next_activity_at || l.stage === 'nuevo')).map((l) => ({ ...l }))),
  markLeadReminders: (u) => tx((db) => {
    const now = new Date().toISOString();
    for (const x of u) { const l = db.leads.find((y) => y.id === x.id); if (!l) continue; if (x.reminded_for) l.next_activity_reminded_for = x.reminded_for; if (x.uncontacted) l.uncontacted_alerted_at = now; }
  }),
  purgeBillUploads: async (before) => {
    const gone = await tx((db) => {
      const old = db.bills.filter((b) => !b.lead_id && b.created_at < before);
      db.bills = db.bills.filter((b) => !old.includes(b));
      return old.map((b) => b.path);
    });
    for (const rel of gone) await fs.rm(path.join(DEV_PRIVATE_DIR, rel), { force: true });
    return gone.length;
  },
  pruneRateLimits: () => tx((db) => {
    const cutoff = Date.now() - 86_400e3; let n = 0;
    for (const [k, v] of Object.entries(db.rl)) if (v.t < cutoff) { delete db.rl[k]; n++; }
    return n;
  }),
  startCronRun: (trigger, actor) => tx((db) => { const id = randomUUID(); db.cron_runs.push({ id, trigger, actor, started_at: new Date().toISOString(), finished_at: null, ok: null, summary: null, error: null }); return id; }),
  finishCronRun: (id, r) => tx((db) => { const c = db.cron_runs.find((x) => x.id === id); if (c) Object.assign(c, { finished_at: new Date().toISOString(), ok: r.ok, summary: r.summary, error: r.error ?? null }); db.cron_runs = db.cron_runs.slice(-200); }),
  listCronRuns: (limit = 20) => tx((db) => [...db.cron_runs].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit)),
  saveIndustrialDoc: async (f) => {
    const id = randomUUID();
    const rel = `${id}.${f.ext}`;
    await fs.mkdir(DEV_PROJECT_DOCS, { recursive: true });
    await fs.writeFile(path.join(DEV_PROJECT_DOCS, rel), f.bytes);
    return tx((db) => { db.industrial_docs.push({ id, request_id: null, kind: 'otro', filename: f.filename, mime: f.mime, size_bytes: f.bytes.length, created_at: new Date().toISOString(), path: rel }); return id; });
  },
  getIndustrialDocMeta: (id) => tx((db) => { const d = db.industrial_docs.find((x) => x.id === id); return d ? devDocOut(d) : null; }),
  createIndustrialRequest: (r, docs) => tx((db) => {
    const now = new Date().toISOString();
    const id = randomUUID();
    db.industrial.push({ ...r, id, eval_status: 'pendiente', eval_kwp: null, eval_notes: null, evaluated_by: null, evaluated_at: null, created_at: now, updated_at: now });
    for (const d of docs) { const x = db.industrial_docs.find((y) => y.id === d.id && !y.request_id); if (x) { x.request_id = id; x.kind = d.kind; } }
    return id;
  }),
  listIndustrialRequests: () => tx((db) => [...db.industrial].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => devIndustrialRecord(db, r))),
  getIndustrialRequest: (id) => tx((db) => { const r = db.industrial.find((x) => x.id === id); return r ? devIndustrialRecord(db, r) : null; }),
  listIndustrialRequestsForLead: (leadId) => tx((db) => db.industrial.filter((r) => r.lead_id === leadId).map((r) => devIndustrialRecord(db, r))),
  evaluateIndustrialRequest: (id, e, actor) => tx((db) => {
    const r = db.industrial.find((x) => x.id === id);
    if (!r) throw new Error('Solicitud no encontrada.');
    const closed = e.status === 'evaluada' || e.status === 'descartada';
    Object.assign(r, { eval_status: e.status, eval_kwp: e.kwp, eval_notes: e.notes || null, updated_at: new Date().toISOString(),
      evaluated_by: closed ? actor : r.evaluated_by, evaluated_at: closed ? new Date().toISOString() : r.evaluated_at });
  }),
  getIndustrialDocFile: async (id) => {
    const d = await tx((db) => db.industrial_docs.find((x) => x.id === id) ?? null);
    if (!d) return null;
    try { return { bytes: new Uint8Array(await fs.readFile(path.join(DEV_PROJECT_DOCS, d.path))), mime: d.mime, filename: d.filename }; } catch { return null; }
  },
  purgeOrphanIndustrialDocs: async (before) => {
    const gone = await tx((db) => {
      const old = db.industrial_docs.filter((d) => !d.request_id && d.created_at < before);
      db.industrial_docs = db.industrial_docs.filter((d) => !old.includes(d));
      return old.map((d) => d.path);
    });
    for (const rel of gone) await fs.rm(path.join(DEV_PROJECT_DOCS, rel), { force: true });
    return gone.length;
  },
  getSolarCache: (cell, source) => tx((db) => { const r = db.solar_cache[`${cell}#${source}`]; return r ? { monthlyYieldPreLoss: r.monthlyYieldPreLoss, monthlyPoaKwhM2: r.monthlyPoaKwhM2, period: r.period, fetchedAt: r.fetchedAt } : null; }),
  putSolarCache: (cell, source, r, at) => tx((db) => { db.solar_cache[`${cell}#${source}`] = { ...r, cell, source, ...at }; }),
  solarCacheStats: () => tx((db) => solarStats(Object.values(db.solar_cache).map((r) => ({ cell: r.cell, source: r.source, fetched_at: r.fetchedAt })))),
  clearSolarCache: (before) => tx((db) => {
    let n = 0;
    for (const [k, r] of Object.entries(db.solar_cache)) if (!before || r.fetchedAt < before) { delete db.solar_cache[k]; n++; }
    return n;
  }),
  track: (name, props) => tx((db) => { db.events.push({ name, props, at: new Date().toISOString() }); if (db.events.length > 5000) db.events.splice(0, 1000); }),
  countEvents: (name, days) => tx((db) => { const since = Date.now() - days * 864e5; return db.events.filter((e) => e.name === name && Date.parse(e.at) >= since).length; }),
  rateLimit: (bucket, max, win) => tx((db) => {
    const now = Date.now(); const r = db.rl[bucket];
    if (!r || now - r.t > win * 1000) { db.rl[bucket] = { c: 1, t: now }; return true; }
    if (r.c >= max) return false; r.c++; return true;
  }),
};

// ======================= Implementación Supabase =======================
/** Cliente con la clave de servicio; con `actor`, la cabecera x-ese-actor (la base solo la acepta con esta clave). */
function client(actor: string | null): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
    ...(actor ? { global: { headers: { 'x-ese-actor': actor } } } : {}),
  });
}
const sb = () => client(null);
function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
// products.images (uuid[]) y products.datasheet (uuid) apuntan a la tabla `media`; las URL públicas salen de su `path` en public-media.
const PUBLIC_BUCKET = 'public-media';
const PRIVATE_BUCKET = 'private-docs';
const BILLS_BUCKET = 'bills';
const PROJECT_DOCS_BUCKET = 'project-docs';
const DOC_COLS = 'id, request_id, kind, filename, mime, size_bytes, created_at';
const INDUSTRIAL_SELECT = `*, leads(full_name, advisor_id), industrial_documents(${DOC_COLS})`;
function mapIndustrial(rows: any[]): IndustrialRequestRecord[] {
  return rows.map(({ leads, industrial_documents, ...r }) => ({
    ...r, eval_kwp: r.eval_kwp == null ? null : Number(r.eval_kwp), lead_name: leads?.full_name ?? null, advisor_id: leads?.advisor_id ?? null,
    documents: ((industrial_documents ?? []) as IndustrialDocument[]).sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}
const TRADE_COLS = 'id, company, ruc, tier, contact_name, email, phone, city, notes, status, review_note, reviewed_at, approved_by, user_id, lead_id, created_at, updated_at';
/** Mapea filas de trade_accounts; «activated» = el usuario de Auth confirmó su correo (fijó contraseña con el enlace). */
async function mapTrade(rows: any[]): Promise<TradeAccount[]> {
  const ids = rows.map((r) => r.user_id).filter(Boolean) as string[];
  const confirmed = new Set<string>();
  for (const uid of ids) { const u = await sb().auth.admin.getUserById(uid); if (u.data.user?.email_confirmed_at) confirmed.add(uid); }
  return rows.map(({ user_id, ...r }) => ({ ...r, activated: !!user_id && confirmed.has(user_id) }));
}
const BILL_COLS = 'id, study_id, lead_id, extracted, confirmed_by_user, created_at';
const publicUrl = (p: string) => sb().storage.from(PUBLIC_BUCKET).getPublicUrl(p).data.publicUrl;
async function mediaMap(ids: string[]): Promise<Map<string, MediaRef>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = must(await sb().from('media').select('id, bucket, path, alt').in('id', uniq)) as { id: string; bucket: string; path: string; alt: string | null }[];
  return new Map(rows.map((r) => [r.id, { id: r.id, path: r.path, url: r.bucket === PRIVATE_BUCKET ? privateDocUrl(r.id) : publicUrl(r.path), alt: r.alt }]));
}
const mediaIdsOf = (rows: any[]) => rows.flatMap((p) => [...((p.images ?? []) as string[]), ...(p.datasheet ? [p.datasheet as string] : [])]);
const tierPrices = (p: any): TierPrice[] => ((p.product_prices ?? []) as any[]).map((x) => ({
  tier: x.tier, price: Number(x.price), promo_price: x.promo_price == null ? null : Number(x.promo_price), promo_until: x.promo_until ?? null,
}));
const mapProduct = (p: any, media: Map<string, MediaRef>, tier: PriceTier = 'final'): Product => ({
  id: p.id, sku: p.sku, slug: p.slug, name: p.name, brand: p.brands?.name ?? null, model: p.model, category: p.product_categories?.slug ?? '',
  summary: p.summary, specs: p.specs ?? {}, warranty: p.warranty, certifications: p.certifications ?? [],
  images: ((p.images ?? []) as string[]).map((id) => media.get(id)?.url).filter((u): u is string => !!u),
  datasheet_url: p.datasheet ? media.get(p.datasheet)?.url ?? null : null, vat_rate: Number(p.vat_rate), stock: p.stock,
  availability: p.availability, installable: p.installable,
  ...(tier === 'final' ? effectivePrice(tierPrices(p)) ?? { price: 0, promo_price: null } : productPricing(tierPrices(p), tier)),
  is_placeholder: p.is_placeholder, published: p.published,
});
const mapRecord = (p: any, media: Map<string, MediaRef>): ProductRecord => ({
  id: p.id, sku: p.sku, slug: p.slug, name: p.name, brand_id: p.brand_id ?? null, brand: p.brands?.name ?? null, model: p.model,
  category: p.product_categories?.slug ?? '', summary: p.summary, specs: p.specs ?? {}, warranty: p.warranty, certifications: p.certifications ?? [],
  vat_rate: Number(p.vat_rate), stock: p.stock, availability: p.availability, installable: p.installable, is_placeholder: p.is_placeholder,
  published: p.published, prices: tierPrices(p), updated_at: p.updated_at ?? null,
  images: ((p.images ?? []) as string[]).map((id) => media.get(id)).filter((m): m is MediaRef => !!m),
  datasheet: p.datasheet ? media.get(p.datasheet) ?? null : null,
});
async function mapProducts(rows: any[], tier?: PriceTier) { const m = await mediaMap(mediaIdsOf(rows)); return rows.map((r) => mapProduct(r, m, tier)); }
const POST_SELECT = 'id, slug, title, excerpt, body_md, category, cover, author_id, published, published_at, seo_title, seo_description, profiles(full_name)';
async function mapPostRecords(rows: any[]): Promise<BlogPostRecord[]> {
  const media = await mediaMap(rows.map((r) => r.cover).filter(Boolean));
  return rows.map((r) => ({
    id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt ?? null, body_md: r.body_md, category: r.category,
    cover: r.cover ? media.get(r.cover) ?? null : null, author_id: r.author_id ?? null, author: r.profiles?.full_name ?? null,
    published: r.published, published_at: r.published_at ?? null, seo_title: r.seo_title ?? null, seo_description: r.seo_description ?? null,
  }));
}
const BRAND_SELECT = '*, brand_assets(id, kind, title, media_id, url, sort)';
async function mapBrandRecords(rows: any[]): Promise<BrandRecord[]> {
  const media = await mediaMap(rows.flatMap((b) => [b.logo, b.relationship_doc, ...((b.brand_assets ?? []) as any[]).map((a) => a.media_id)]).filter(Boolean));
  return rows.map((b) => ({
    id: b.id, slug: b.slug, name: b.name, description: b.description, relationship: b.relationship, relationship_verified: b.relationship_verified,
    relationship_valid_until: b.relationship_valid_until ?? null, published: b.published, sort: b.sort ?? 0,
    logo: b.logo ? media.get(b.logo) ?? null : null,
    relationship_doc: b.relationship_doc ? media.get(b.relationship_doc) ?? null : null,
    assets: ((b.brand_assets ?? []) as any[]).sort((x, y) => (x.sort ?? 0) - (y.sort ?? 0))
      .map((a) => ({ id: a.id, kind: a.kind, title: a.title, url: a.url ?? null, media: a.media_id ? media.get(a.media_id) ?? null : null })),
  }));
}
function brandDbError(e: { code?: string; message: string }): Error {
  if (e.code === '23505') return new Error('Ya existe otra marca con ese identificador.');
  if (e.code === '23503') return new Error('Hay productos de esta marca: cámbiales la marca o despublica la marca en lugar de eliminarla.');
  if (e.code === '23514' && e.message.includes('relationship_verified_needs_backup')) return new Error('Para verificar la relación, indica el texto y carga el documento de respaldo.');
  if (e.code === '23514' && e.message.includes('brand_asset')) return new Error('Cada documento necesita un archivo o un enlace https.');
  return new Error(e.message);
}
const PROJECT_SELECT = '*, project_media(media_id, role, sort)';
async function mapProjectRecords(rows: any[]): Promise<ProjectRecord[]> {
  const media = await mediaMap(rows.flatMap((p) => ((p.project_media ?? []) as any[]).map((m) => m.media_id as string)));
  return rows.map((p) => {
    const { project_media, testimonial_verified, ...base } = p;
    const pm = ((project_media ?? []) as { media_id: string; role: string; sort: number }[]).sort((a, b) => a.sort - b.sort);
    const cover = pm.find((m) => m.role === 'cover');
    return {
      ...base, technology: p.technology ?? [], testimonial_verified: !!testimonial_verified, is_placeholder: false,
      lat: p.lat == null ? null : Number(p.lat), lng: p.lng == null ? null : Number(p.lng),
      capacity_kwp: p.capacity_kwp == null ? null : Number(p.capacity_kwp), inverter_kw: p.inverter_kw == null ? null : Number(p.inverter_kw),
      annual_generation_kwh: p.annual_generation_kwh == null ? null : Number(p.annual_generation_kwh),
      annual_savings_usd: p.annual_savings_usd == null ? null : Number(p.annual_savings_usd), co2_avoided_t: p.co2_avoided_t == null ? null : Number(p.co2_avoided_t),
      cover: cover ? media.get(cover.media_id) ?? null : null,
      gallery: pm.filter((m) => m.role === 'gallery').map((m) => media.get(m.media_id)).filter((m): m is MediaRef => !!m),
    } as ProjectRecord;
  });
}
function projectDbError(e: { code?: string; message: string }): Error {
  if (e.code === '23505') return new Error(e.message.includes('slug') ? 'Ya existe otro proyecto con esa URL.' : e.message.includes('one_cover') ? 'El proyecto ya tiene portada.' : 'Registro duplicado.');
  if (e.code === '23514') {
    const m: Record<string, string> = {
      client_authorized_needs_name: 'Marcaste el nombre del cliente como autorizado, pero no lo ingresaste.',
      location_authorized_needs_coords: 'Para mostrar el proyecto en el mapa ingresa sus coordenadas.',
      coords_in_ecuador: 'Las coordenadas están fuera del Ecuador.',
      testimonial_verified_needs_text: 'Un testimonio verificado necesita el texto y su autor.',
      project_figures_non_negative: 'Las cifras del proyecto no pueden ser negativas.',
    };
    const k = Object.keys(m).find((x) => e.message.includes(x));
    if (k) return new Error(m[k]);
  }
  return new Error(e.message);
}
const PRODUCT_SELECT = '*, brands(name), product_categories(slug), product_prices(tier, price, promo_price, promo_until)';
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
/** Traduce las restricciones de Postgres a mensajes para el panel. */
function productDbError(e: { code?: string; message: string }): Error {
  if (e.code === '23505') return new Error(e.message.includes('sku') ? 'Ya existe otro producto con ese SKU.' : e.message.includes('slug') ? 'Ya existe otro producto con esa URL.' : 'Registro duplicado.');
  if (e.code === '23514' && e.message.includes('no_placeholder_published')) return new Error('Un producto de ejemplo no puede publicarse.');
  if (e.code === '23503') return new Error('Este producto figura en pedidos registrados: despublícalo en lugar de eliminarlo para conservar el historial.');
  return new Error(e.message);
}

/**
 * Implementación Supabase ligada a un actor (usuario del panel): sus escrituras envían `x-ese-actor`, que la base usa
 * para la auditoría y para reglas como la verificación de pagos (migración 0010; solo vale con la clave de servicio).
 * Dentro del objeto, `sb()` es el cliente con esa cabecera; las funciones de lectura de fuera usan el cliente sin actor.
 */
function supabaseStoreFor(actor: string | null): Store {
const sb = () => client(actor);
return {
  kind: 'supabase',
  async getActiveParams() {
    const r = must(await sb().from('calc_params').select('*').eq('active', true).maybeSingle()) as any;
    if (!r) return DEFAULT_PARAMS;
    return CalcParams.parse({ version: r.version, isPlaceholder: r.is_placeholder, technical: r.technical, financial: r.financial, pricing: r.pricing });
  },
  async saveParams(p, actor) {
    const c = sb();
    const last = must(await c.from('calc_params').select('version').order('version', { ascending: false }).limit(1));
    const version = (last[0]?.version ?? 0) + 1;
    must(await c.from('calc_params').update({ active: false }).eq('active', true));
    must(await c.from('calc_params').insert({ version, technical: p.technical, financial: p.financial, pricing: p.pricing, is_placeholder: p.isPlaceholder, active: true, created_by: actor }));
    return { ...p, version };
  },
  async listTariffs() { return must(await sb().from('tariffs').select('*').eq('active', true).order('code')) as Tariff[]; },
  async saveTariff(t) {
    const r = must(await sb().from('tariffs').upsert({ ...t, valid_from: t.valid_from ?? new Date().toISOString().slice(0, 10), active: true }).select('id').single()) as { id: string };
    return r.id;
  },
  async deactivateTariff(id) { must(await sb().from('tariffs').update({ active: false }).eq('id', id)); },
  async createStudy(s) {
    const c = sb();
    const { count } = await c.from('solar_studies').select('id', { count: 'exact', head: true }).gte('created_at', `${year()}-01-01`);
    for (let i = 0; i < 5; i++) {
      const code = `ESE-${year()}-${pad((count ?? 0) + 1 + i)}`;
      const r = await c.from('solar_studies').insert({ code, mode: s.mode, inputs: s.inputs, results: s.results, params_version: s.params_version, solar_source: s.solar_source }).select().single();
      if (!r.error) return r.data as Study;
      if (!r.error.message.includes('duplicate')) throw new Error(r.error.message);
    }
    throw new Error('No se pudo generar el código de estudio');
  },
  async getStudyByCode(code) { return must(await sb().from('solar_studies').select('*').eq('code', code).maybeSingle()) as Study | null; },
  async listStudiesForLead(leadId) { return must(await sb().from('solar_studies').select('*').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(10)) as Study[]; },
  async unlockStudy(code, leadId) {
    const st = must(await sb().from('solar_studies').update({ unlocked: true, lead_id: leadId }).eq('code', code).select('id').maybeSingle()) as { id: string } | null;
    if (st) must(await sb().from('bill_uploads').update({ lead_id: leadId }).eq('study_id', st.id));
  },
  async saveBillUpload(f) {
    const c = sb();
    const p = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${f.ext}`;
    const up = await c.storage.from(BILLS_BUCKET).upload(p, f.bytes, { contentType: f.mime, upsert: false, cacheControl: '0' });
    if (up.error) throw new Error(`No se pudo guardar la planilla: ${up.error.message}`);
    const r = await c.from('bill_uploads').insert({ storage_path: p, extracted: f.extracted }).select('id').single();
    if (r.error) { await c.storage.from(BILLS_BUCKET).remove([p]); throw new Error(r.error.message); }
    return (r.data as { id: string }).id;
  },
  async getBillUpload(id) {
    if (!isUuid(id)) return null;
    return must(await sb().from('bill_uploads').select(BILL_COLS).eq('id', id).maybeSingle()) as BillUpload | null;
  },
  async confirmBillUpload(id, studyId, confirmed) {
    if (!isUuid(id)) return false;
    const c = sb();
    const cur = must(await c.from('bill_uploads').select('extracted').eq('id', id).maybeSingle()) as { extracted: unknown } | null;
    if (!cur) return false;
    // El filtro confirmed_by_user=false hace la vinculación de un solo uso aunque lleguen dos solicitudes a la vez.
    const r = must(await c.from('bill_uploads').update({ study_id: studyId, confirmed_by_user: true, extracted: { ...(cur.extracted as object), confirmed } })
      .eq('id', id).eq('confirmed_by_user', false).is('study_id', null).select('id')) as { id: string }[];
    return r.length === 1;
  },
  async listBillUploadsForLead(leadId) {
    return must(await sb().from('bill_uploads').select(BILL_COLS).eq('lead_id', leadId).order('created_at', { ascending: false })) as BillUpload[];
  },
  async getBillFile(id) {
    if (!isUuid(id)) return null;
    const b = must(await sb().from('bill_uploads').select('storage_path').eq('id', id).maybeSingle()) as { storage_path: string } | null;
    if (!b) return null;
    const r = await sb().storage.from(BILLS_BUCKET).createSignedUrl(b.storage_path, 60);
    return r.error || !r.data ? null : { signedUrl: r.data.signedUrl };
  },
  async requestVisit(code) { must(await sb().from('solar_studies').update({ visit_requested: true }).eq('code', code)); },
  async createLead(l, consents, meta) {
    const c = sb();
    const advisor = (await c.rpc('next_advisor')).data as string | null;
    const lead = must(await c.from('leads').insert({ ...l, advisor_id: advisor }).select().single()) as Lead;
    must(await c.from('consents').insert(consents.map((x) => ({ ...x, email: l.email, lead_id: lead.id, policy_version: meta.policyVersion, ip_hash: meta.ipHash, user_agent: meta.ua.slice(0, 300) }))));
    await c.from('lead_activities').insert({ lead_id: lead.id, kind: 'sistema', body: `Lead creado desde ${l.source}` });
    return lead;
  },
  async listLeads(f) {
    let q = sb().from('leads').select('*').order('created_at', { ascending: false }).limit(1000);
    if (f?.stage) q = q.eq('stage', f.stage);
    if (f?.advisor) q = q.eq('advisor_id', f.advisor);
    return must(await q) as Lead[];
  },
  async getLead(id) { return must(await sb().from('leads').select('*').eq('id', id).maybeSingle()) as Lead | null; },
  async updateLead(id, patch) { must(await sb().from('leads').update(patch).eq('id', id)); },
  async addActivity(leadId, kind, body, actor) { must(await sb().from('lead_activities').insert({ lead_id: leadId, kind, body, actor })); },
  async listActivities(leadId) { return must(await sb().from('lead_activities').select('*').eq('lead_id', leadId).order('at', { ascending: false })) as Activity[]; },
  async hasMarketingConsent(email) {
    const r = must(await sb().from('consents').select('granted').eq('email', email).eq('purpose', 'comercial_marketing').order('at', { ascending: false }).limit(1));
    return !!r[0]?.granted;
  },
  async listProducts(o) {
    let q = sb().from('products').select(PRODUCT_SELECT).order('name');
    if (!o?.includeUnpublished) q = q.eq('published', true);
    return mapProducts(must(await q) as any[], o?.tier);
  },
  async getProductsByIds(ids, tier) {
    const valid = ids.filter(isUuid);
    return valid.length ? mapProducts(must(await sb().from('products').select(PRODUCT_SELECT).in('id', valid).eq('published', true)) as any[], tier) : [];
  },
  async getProductBySlug(slug, tier) { const r = must(await sb().from('products').select(PRODUCT_SELECT).eq('slug', slug).eq('published', true).maybeSingle()); return r ? (await mapProducts([r], tier))[0] : null; },
  async listProductRecords() {
    const rows = must(await sb().from('products').select(PRODUCT_SELECT).order('name')) as any[];
    const m = await mediaMap(mediaIdsOf(rows));
    return rows.map((r) => mapRecord(r, m));
  },
  async getProductRecord(id) {
    if (!isUuid(id)) return null;
    const r = must(await sb().from('products').select(PRODUCT_SELECT).eq('id', id).maybeSingle());
    return r ? mapRecord(r, await mediaMap(mediaIdsOf([r]))) : null;
  },
  async saveProduct(input) {
    const c = sb();
    const cat = must(await c.from('product_categories').select('id').eq('slug', input.category).maybeSingle()) as { id: string } | null;
    if (!cat) throw new Error('La categoría no existe en la base de datos.');
    const { id, prices, category: _c, image_ids, datasheet_id, ...rest } = input;
    const row = { ...rest, category_id: cat.id, images: image_ids, datasheet: datasheet_id };
    const r = id ? await c.from('products').update(row).eq('id', id).select('id').maybeSingle() : await c.from('products').insert(row).select('id').single();
    if (r.error) throw productDbError(r.error);
    if (!r.data) throw new Error('Producto no encontrado.');
    const pid = (r.data as { id: string }).id;
    // Precios por nivel: se actualizan los ofrecidos y se eliminan los que ya no se ofrecen.
    const up = await c.from('product_prices').upsert(prices.map((t) => ({ product_id: pid, ...t })), { onConflict: 'product_id,tier' });
    if (up.error) throw productDbError(up.error);
    const drop = (['final', 'instalador', 'distribuidor'] as const).filter((t) => !prices.some((x) => x.tier === t));
    if (drop.length) { const d = await c.from('product_prices').delete().eq('product_id', pid).in('tier', drop); if (d.error) throw productDbError(d.error); }
    return pid;
  },
  async deleteProduct(id) {
    const r = await sb().from('products').delete().eq('id', id);
    if (r.error) throw productDbError(r.error);
  },
  async uploadMedia(f) {
    const c = sb();
    const bucket = f.bucket ?? PUBLIC_BUCKET;
    const p = `${f.folder}/${randomUUID()}.${f.ext}`;
    const up = await c.storage.from(bucket).upload(p, f.bytes, { contentType: f.mime, upsert: false, cacheControl: bucket === PUBLIC_BUCKET ? '31536000' : '0' });
    if (up.error) throw new Error(`No se pudo subir el archivo: ${up.error.message}`);
    const m = await c.from('media').insert({ bucket, path: p, kind: f.kind, alt: f.alt }).select('id').single();
    if (m.error) { await c.storage.from(bucket).remove([p]); throw new Error(m.error.message); }
    const id = (m.data as { id: string }).id;
    return { id, path: p, url: bucket === PRIVATE_BUCKET ? privateDocUrl(id) : publicUrl(p), alt: f.alt };
  },
  async getPrivateDocument(id) {
    if (!isUuid(id)) return null;
    const m = must(await sb().from('media').select('path').eq('id', id).eq('bucket', PRIVATE_BUCKET).maybeSingle()) as { path: string } | null;
    if (!m) return null;
    const r = await sb().storage.from(PRIVATE_BUCKET).createSignedUrl(m.path, 60);
    return r.error || !r.data ? null : { signedUrl: r.data.signedUrl };
  },
  async createOrder(o) {
    const c = sb();
    const { items, ...head } = o;
    const ord = must(await c.from('orders').insert(head).select().single()) as Order;
    const ins = await c.from('order_items').insert(items.map((i) => ({ ...i, order_id: ord.id })));
    if (ins.error) { await c.from('orders').delete().eq('id', ord.id); throw new Error(ins.error.message); }
    return { ...ord, items };
  },
  async setOrderWhatsapp(id, msg, channel) { must(await sb().from('orders').update({ whatsapp_message: msg, whatsapp_channel: channel }).eq('id', id)); },
  async listOrders() { return (must(await sb().from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false }).limit(500))) as Order[]; },
  async createTradeApplication(a, leadId) {
    const r = await sb().from('trade_accounts').insert({ ...a, lead_id: leadId, status: 'pendiente', approved: false }).select('id').single();
    if (r.error) {
      if (r.error.code === '23505') throw new Error(r.error.message.includes('ruc')
        ? 'Ya existe una solicitud o cuenta con ese RUC. Escríbenos si necesitas agregar otra persona de contacto.'
        : 'Ya existe una solicitud o cuenta con ese correo. Si olvidaste tu contraseña, recupérala desde «Ingresar».');
      throw new Error(r.error.message);
    }
    return (r.data as { id: string }).id;
  },
  async listTradeAccounts() { return mapTrade(must(await sb().from('trade_accounts').select(TRADE_COLS).order('created_at', { ascending: false })) as any[]); },
  async getTradeAccount(id) {
    if (!isUuid(id)) return null;
    const r = must(await sb().from('trade_accounts').select(TRADE_COLS).eq('id', id).maybeSingle());
    return r ? (await mapTrade([r]))[0] : null;
  },
  async getApprovedTradeAccountForUser(userId) {
    const r = must(await sb().from('trade_accounts').select(TRADE_COLS).eq('user_id', userId).eq('status', 'aprobada').maybeSingle());
    return r ? (await mapTrade([r]))[0] : null;
  },
  async reviewTradeAccount(id, rv, actor) {
    const c = sb();
    const cur = must(await c.from('trade_accounts').select('user_id, email').eq('id', id).maybeSingle()) as { user_id: string | null; email: string } | null;
    if (!cur) throw new Error('Cuenta no encontrada.');
    const patch: Record<string, unknown> = {
      status: rv.status, approved: rv.status === 'aprobada', tier: rv.tier, review_note: rv.review_note || null, reviewed_at: new Date().toISOString(),
    };
    if (rv.status === 'aprobada' || rv.status === 'suspendida') patch.approved_by = actor;
    let link: { token_hash: string; type: AccessLinkType } | null = null;
    let createdUser: string | null = null;
    if (rv.status === 'aprobada' && !cur.user_id) {
      // generateLink crea el usuario de Auth sin enviar correo; si ya existía (p. ej. solicitud anterior), se usa «recovery».
      let g = await c.auth.admin.generateLink({ type: 'invite', email: cur.email });
      if (g.error && /already|registered|exists/i.test(g.error.message)) g = await c.auth.admin.generateLink({ type: 'recovery', email: cur.email });
      else if (!g.error) createdUser = g.data.user?.id ?? null;
      if (g.error || !g.data.user) throw new Error(`No se pudo crear el acceso: ${g.error?.message ?? 'sin usuario'}`);
      patch.user_id = g.data.user.id;
      link = { token_hash: g.data.properties.hashed_token, type: createdUser ? 'invite' : 'recovery' };
    }
    const r = await c.from('trade_accounts').update(patch).eq('id', id);
    if (r.error) {
      if (createdUser) await c.auth.admin.deleteUser(createdUser); // no dejar un usuario de Auth huérfano
      throw new Error(r.error.message);
    }
    return link;
  },
  async createTradeAccessToken(id) {
    const c = sb();
    const t = must(await c.from('trade_accounts').select('email, status').eq('id', id).maybeSingle()) as { email: string; status: string } | null;
    if (!t || t.status !== 'aprobada') throw new Error('La cuenta no está aprobada.');
    const { data, error } = await c.auth.admin.generateLink({ type: 'recovery', email: t.email });
    if (error) throw new Error(`No se pudo generar el enlace: ${error.message}`);
    return { token_hash: data.properties.hashed_token, type: 'recovery' as const };
  },
  async listOrdersForTradeAccount(id) {
    return must(await sb().from('orders').select('*, items:order_items(*)').eq('trade_account_id', id).order('created_at', { ascending: false }).limit(100)) as Order[];
  },
  async getOrder(id) { return must(await sb().from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle()) as Order | null; },
  async updateOrderStatus(id, status, actor, payment) {
    const patch: Record<string, unknown> = { status };
    if (payment) Object.assign(patch, { payment_reference: payment.reference, payment_verified_by: actor, payment_verified_at: new Date().toISOString() });
    must(await sb().from('orders').update(patch).eq('id', id));
  },
  async listStats() { return must(await sb().from('company_stats').select('*').order('sort')) as Stat[]; },
  async saveStat(s) { must(await sb().from('company_stats').upsert(s)); },
  async listProjects(o) {
    let q = sb().from('projects').select(PROJECT_SELECT).order('executed_on', { ascending: false, nullsFirst: false });
    if (!o?.includeUnpublished) q = q.eq('published', true);
    return (await mapProjectRecords(must(await q) as any[])).map(toPublicProject);
  },
  async listProjectRecords() { return mapProjectRecords(must(await sb().from('projects').select(PROJECT_SELECT).order('title')) as any[]); },
  async getProjectRecord(id) {
    if (!isUuid(id)) return null;
    const r = must(await sb().from('projects').select(PROJECT_SELECT).eq('id', id).maybeSingle());
    return r ? (await mapProjectRecords([r]))[0] : null;
  },
  async saveProject(input) {
    const c = sb();
    const { id, cover_id, gallery_ids, ...row } = input;
    const r = id ? await c.from('projects').update(row).eq('id', id).select('id').maybeSingle() : await c.from('projects').insert(row).select('id').single();
    if (r.error) throw projectDbError(r.error);
    if (!r.data) throw new Error('Proyecto no encontrado.');
    const pid = (r.data as { id: string }).id;
    // Medios: se reemplaza el conjunto (portada + galería en orden). project_media_one_cover garantiza una sola portada.
    const del = await c.from('project_media').delete().eq('project_id', pid).in('role', ['cover', 'gallery']);
    if (del.error) throw projectDbError(del.error);
    const links = [...(cover_id ? [{ project_id: pid, media_id: cover_id, role: 'cover', sort: 0 }] : []),
      ...gallery_ids.map((m, i) => ({ project_id: pid, media_id: m, role: 'gallery', sort: i }))];
    if (links.length) { const ins = await c.from('project_media').insert(links); if (ins.error) throw projectDbError(ins.error); }
    return pid;
  },
  async deleteProject(id) { const r = await sb().from('projects').delete().eq('id', id); if (r.error) throw projectDbError(r.error); },
  async listContentBlocks() {
    return must(await sb().from('content_blocks').select('page, slot, data, is_placeholder, published, updated_at').order('page').order('slot')) as ContentBlockRow[];
  },
  async getPublishedBlocks(page) {
    return must(await sb().from('content_blocks').select('page, slot, data, is_placeholder, published, updated_at').eq('page', page).eq('published', true)) as ContentBlockRow[];
  },
  async saveContentBlock(b) {
    // content_blocks no tiene trigger de updated_at: se envía explícito.
    must(await sb().from('content_blocks').upsert({ page: b.page, slot: b.slot, data: b.data, is_placeholder: b.is_placeholder, published: b.published, updated_at: new Date().toISOString() }, { onConflict: 'page,slot' }));
  },
  async deleteContentBlock(page, slot) { must(await sb().from('content_blocks').delete().eq('page', page).eq('slot', slot)); },
  async resolveMedia(ids) { return Object.fromEntries((await mediaMap(ids)).entries()); },
  async listBrands(o) {
    let q = sb().from('brands').select(BRAND_SELECT).order('sort');
    if (!o?.includeUnpublished) q = q.eq('published', true);
    return (await mapBrandRecords(must(await q) as any[])).map((b) => toPublicBrand(b));
  },
  async listBrandRecords() { return mapBrandRecords(must(await sb().from('brands').select(BRAND_SELECT).order('sort').order('name')) as any[]); },
  async getBrandRecord(id) {
    if (!isUuid(id)) return null;
    const r = must(await sb().from('brands').select(BRAND_SELECT).eq('id', id).maybeSingle());
    return r ? (await mapBrandRecords([r]))[0] : null;
  },
  async saveBrand(input) {
    const c = sb();
    const { id, logo_id, relationship_doc_id, assets, ...rest } = input;
    const row = { ...rest, logo: logo_id, relationship_doc: relationship_doc_id };
    const r = id ? await c.from('brands').update(row).eq('id', id).select('id').maybeSingle() : await c.from('brands').insert(row).select('id').single();
    if (r.error) throw brandDbError(r.error);
    if (!r.data) throw new Error('Marca no encontrada.');
    const bid = (r.data as { id: string }).id;
    // Documentos de la marca: se reemplaza el conjunto en el orden del formulario.
    const del = await c.from('brand_assets').delete().eq('brand_id', bid);
    if (del.error) throw brandDbError(del.error);
    if (assets.length) {
      const ins = await c.from('brand_assets').insert(assets.map((a, i) => ({ brand_id: bid, kind: a.kind, title: a.title, media_id: a.media_id, url: a.url, sort: i })));
      if (ins.error) throw brandDbError(ins.error);
    }
    return bid;
  },
  async deleteBrand(id) { const r = await sb().from('brands').delete().eq('id', id); if (r.error) throw brandDbError(r.error); },
  async listPublishedPosts() {
    const rows = must(await sb().from('blog_posts').select(POST_SELECT).eq('published', true).lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }).limit(500)) as any[];
    return (await mapPostRecords(rows)).map(toPublicPost);
  },
  async getPublishedPost(slug) {
    const r = must(await sb().from('blog_posts').select(POST_SELECT).eq('slug', slug).eq('published', true).lte('published_at', new Date().toISOString()).maybeSingle());
    return r ? toPublicPost((await mapPostRecords([r]))[0]) : null;
  },
  async listPostRecords() { return mapPostRecords(must(await sb().from('blog_posts').select(POST_SELECT).order('published_at', { ascending: false, nullsFirst: true })) as any[]); },
  async getPostRecord(id) {
    if (!isUuid(id)) return null;
    const r = must(await sb().from('blog_posts').select(POST_SELECT).eq('id', id).maybeSingle());
    return r ? (await mapPostRecords([r]))[0] : null;
  },
  async savePost(input, author) {
    const c = sb();
    const { id, cover_id, ...rest } = input;
    const row = { ...rest, cover: cover_id, ...(id ? {} : { author_id: isUuid(author.id) ? author.id : null }) };
    const r = id ? await c.from('blog_posts').update(row).eq('id', id).select('id').maybeSingle() : await c.from('blog_posts').insert(row).select('id').single();
    if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe otro artículo con esa URL.' : r.error.message);
    if (!r.data) throw new Error('Artículo no encontrado.');
    return (r.data as { id: string }).id;
  },
  async deletePost(id) { must(await sb().from('blog_posts').delete().eq('id', id)); },
  async listUsers() {
    const c = sb();
    const profiles = must(await c.from('profiles').select('id, full_name, email, phone, role, is_advisor, active, created_at')) as Omit<StaffUser, 'activated'>[];
    const { data, error } = await c.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(error.message);
    const confirmed = new Set(data.users.filter((u) => u.email_confirmed_at).map((u) => u.id));
    return profiles.map((p) => ({ ...p, activated: confirmed.has(p.id) }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.full_name.localeCompare(b.full_name, 'es'));
  },
  async createUser(input) {
    const c = sb();
    const email = input.email.toLowerCase();
    // generateLink crea el usuario de Auth sin enviar correo: el enlace lo enviamos nosotros.
    const { data, error } = await c.auth.admin.generateLink({ type: 'invite', email });
    if (error || !data.user) throw new Error(/already|registered|exists/i.test(error?.message ?? '') ? 'Ya existe un usuario con ese correo.' : `No se pudo crear el usuario: ${error?.message}`);
    const ins = await c.from('profiles').insert({ id: data.user.id, ...input, email, active: true });
    if (ins.error) {
      await c.auth.admin.deleteUser(data.user.id); // no dejar un usuario de Auth sin perfil
      throw new Error(ins.error.code === '23505' ? 'Ya existe un usuario con ese correo.' : ins.error.message);
    }
    return { id: data.user.id, token_hash: data.properties.hashed_token, type: 'invite' as const };
  },
  async updateUser(id, patch) { must(await sb().from('profiles').update(patch).eq('id', id)); },
  async createAccessToken(id) {
    const c = sb();
    const p = must(await c.from('profiles').select('email').eq('id', id).maybeSingle()) as { email: string } | null;
    if (!p) throw new Error('Usuario no encontrado.');
    // «recovery» sirve para quien nunca activó y para quien olvidó su contraseña: inicia sesión y permite fijarla.
    const { data, error } = await c.auth.admin.generateLink({ type: 'recovery', email: p.email });
    if (error) throw new Error(`No se pudo generar el enlace: ${error.message}`);
    return { token_hash: data.properties.hashed_token, type: 'recovery' as const };
  },
  async openLeadsByAdvisor() {
    const rows = must(await sb().from('leads').select('advisor_id').not('advisor_id', 'is', null).not('stage', 'in', `(${CLOSED_STAGES.join(',')})`)) as { advisor_id: string }[];
    return rows.reduce<Record<string, number>>((a, r) => { a[r.advisor_id] = (a[r.advisor_id] ?? 0) + 1; return a; }, {});
  },
  async reassignOpenLeads(from, to, actor) {
    const c = sb();
    const moved = must(await c.from('leads').update({ advisor_id: to }).eq('advisor_id', from).not('stage', 'in', `(${CLOSED_STAGES.join(',')})`).select('id')) as { id: string }[];
    if (moved.length) await c.from('lead_activities').insert(moved.map((l) => ({ lead_id: l.id, kind: 'sistema', body: 'Lead reasignado por desactivación del asesor', actor: isUuid(actor) ? actor : null })));
    return moved.length;
  },
  async listServiceRows() {
    const rows = must(await sb().from('services').select('*').order('sort')) as any[];
    const media = await mediaMap(rows.map((r) => r.cover).filter(Boolean));
    return rows.map((r) => ({
      id: r.id, slug: r.slug, name: r.name, summary: r.summary ?? null, description: r.body?.description ?? null,
      benefits: r.body?.benefits ?? [], scope: r.body?.scope ?? [], segments: r.segments ?? [], published: r.published, sort: r.sort,
      cover: r.cover ? media.get(r.cover) ?? null : null,
    }));
  },
  async saveService(input) {
    const c = sb();
    const { id, cover_id, description, benefits, scope, ...rest } = input;
    const row = { ...rest, cover: cover_id, body: { description, benefits, scope } };
    const r = id ? await c.from('services').update(row).eq('id', id).select('id').maybeSingle() : await c.from('services').insert(row).select('id').single();
    if (r.error) throw new Error(r.error.code === '23505' ? 'Ya existe otro servicio con esa URL.' : r.error.message);
    if (!r.data) throw new Error('Servicio no encontrado.');
    return (r.data as { id: string }).id;
  },
  async deleteService(id) { must(await sb().from('services').delete().eq('id', id)); },
  async saveSetting(key, value, actor) { must(await sb().from('site_settings').upsert({ key, value, updated_at: new Date().toISOString(), updated_by: isUuid(actor) ? actor : null })); },
  async getSetting(key, fallback) { const r = await sb().from('site_settings').select('value').eq('key', key).maybeSingle(); return (r.data?.value ?? fallback) as any; },
  async queueMessage(m) {
    await sb().from('outbound_messages').insert({
      channel: m.channel, to_address: m.to, template: m.template, payload: m.payload, status: m.status, error: m.error, is_marketing: !!m.is_marketing,
      attempts: m.attempts ?? 0, next_attempt_at: m.next_attempt_at ?? null, last_attempt_at: m.attempts ? new Date().toISOString() : null,
      sent_at: m.status === 'enviado' ? new Date().toISOString() : null,
    });
  },
  async claimDueMessages(limit) { return must(await sb().rpc('claim_outbound', { p_limit: limit, p_lease_seconds: 300 })) as OutboundMessage[]; },
  async finishMessage(id, r) {
    const c = sb();
    const patch: Record<string, unknown> = { status: r.status, error: r.error ?? null, next_attempt_at: r.next_attempt_at ?? null };
    if (r.status === 'enviado') patch.sent_at = new Date().toISOString();
    if (r.clearBody) {
      const cur = must(await c.from('outbound_messages').select('payload').eq('id', id).maybeSingle()) as { payload: MessagePayload } | null;
      patch.payload = { subject: cur?.payload?.subject ?? '' };
    }
    must(await c.from('outbound_messages').update(patch).eq('id', id));
  },
  async listMessages(f) {
    let q = sb().from('outbound_messages').select('*').order('created_at', { ascending: false }).limit(f?.limit ?? 100);
    if (f?.status) q = q.eq('status', f.status);
    return (must(await q) as OutboundMessage[]).map(withoutBody);
  },
  async messageStats() {
    const c = sb();
    const count = async (status: string) => (await c.from('outbound_messages').select('id', { count: 'exact', head: true }).eq('status', status)).count ?? 0;
    const [pendiente, enviado, error, bloqueado_sin_consentimiento] = await Promise.all(['pendiente', 'enviado', 'error', 'bloqueado_sin_consentimiento'].map(count));
    const sent7d = (await c.from('outbound_messages').select('id', { count: 'exact', head: true }).eq('status', 'enviado').gte('sent_at', new Date(Date.now() - 7 * 86_400e3).toISOString())).count ?? 0;
    return { pendiente, enviado, error, bloqueado_sin_consentimiento, sent7d };
  },
  async requeueMessage(id) {
    if (!isUuid(id)) return false;
    const c = sb();
    const cur = must(await c.from('outbound_messages').select('status, payload').eq('id', id).maybeSingle()) as { status: string; payload: MessagePayload } | null;
    if (!cur || cur.status !== 'error' || !cur.payload?.html) return false;
    const r = must(await c.from('outbound_messages').update({ status: 'pendiente', attempts: 0, error: null, next_attempt_at: new Date().toISOString() }).eq('id', id).eq('status', 'error').select('id')) as unknown[];
    return r.length === 1;
  },
  async listLeadsForReminders() {
    const cols = 'id, full_name, company, stage, advisor_id, next_activity_at, next_activity_note, first_contact_at, created_at, source, next_activity_reminded_for, uncontacted_alerted_at';
    return must(await sb().from('leads').select(cols).not('stage', 'in', `(${CLOSED_STAGES.join(',')})`).or('next_activity_at.not.is.null,stage.eq.nuevo').limit(5000)) as ReminderLead[];
  },
  async markLeadReminders(u) {
    const c = sb(); const now = new Date().toISOString();
    for (const x of u) {
      const patch: Record<string, unknown> = {};
      if (x.reminded_for) patch.next_activity_reminded_for = x.reminded_for;
      if (x.uncontacted) patch.uncontacted_alerted_at = now;
      if (Object.keys(patch).length) must(await c.from('leads').update(patch).eq('id', x.id));
    }
  },
  async purgeBillUploads(before) {
    const c = sb();
    const rows = must(await c.from('bill_uploads').select('id, storage_path').is('lead_id', null).lt('created_at', before).limit(500)) as { id: string; storage_path: string }[];
    if (!rows.length) return 0;
    // Primero el archivo: si falla, la fila queda y se reintenta en la próxima ejecución.
    const rm = await c.storage.from(BILLS_BUCKET).remove(rows.map((r) => r.storage_path));
    if (rm.error) throw new Error(`No se pudieron borrar las planillas: ${rm.error.message}`);
    must(await c.from('bill_uploads').delete().in('id', rows.map((r) => r.id)));
    return rows.length;
  },
  async pruneRateLimits() { return Number(must(await sb().rpc('prune_rate_limits', { p_older_than_seconds: 86_400 }))); },
  async startCronRun(trigger, actor) {
    return (must(await sb().from('cron_runs').insert({ trigger, actor: actor && isUuid(actor) ? actor : null }).select('id').single()) as { id: string }).id;
  },
  async finishCronRun(id, r) { must(await sb().from('cron_runs').update({ finished_at: new Date().toISOString(), ok: r.ok, summary: r.summary, error: r.error ?? null }).eq('id', id)); },
  async listCronRuns(limit = 20) { return must(await sb().from('cron_runs').select('*').order('started_at', { ascending: false }).limit(limit)) as CronRun[]; },
  async saveIndustrialDoc(f) {
    const c = sb();
    const p = `${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${f.ext}`;
    const up = await c.storage.from(PROJECT_DOCS_BUCKET).upload(p, f.bytes, { contentType: f.mime, upsert: false, cacheControl: '0' });
    if (up.error) throw new Error(`No se pudo guardar el documento: ${up.error.message}`);
    const r = await c.from('industrial_documents').insert({ filename: f.filename, mime: f.mime, size_bytes: f.bytes.length, storage_path: p }).select('id').single();
    if (r.error) { await c.storage.from(PROJECT_DOCS_BUCKET).remove([p]); throw new Error(r.error.message); }
    return (r.data as { id: string }).id;
  },
  async getIndustrialDocMeta(id) {
    if (!isUuid(id)) return null;
    return must(await sb().from('industrial_documents').select(DOC_COLS).eq('id', id).maybeSingle()) as IndustrialDocument | null;
  },
  async createIndustrialRequest(r, docs) {
    const c = sb();
    const ins = must(await c.from('industrial_requests').insert(r).select('id').single()) as { id: string };
    // Solo documentos aún sin solicitud: un id no se puede «robar» para otra solicitud.
    for (const d of docs) must(await c.from('industrial_documents').update({ request_id: ins.id, kind: d.kind }).eq('id', d.id).is('request_id', null));
    return ins.id;
  },
  async listIndustrialRequests() { return mapIndustrial(must(await sb().from('industrial_requests').select(INDUSTRIAL_SELECT).order('created_at', { ascending: false }).limit(500)) as any[]); },
  async getIndustrialRequest(id) {
    if (!isUuid(id)) return null;
    const r = must(await sb().from('industrial_requests').select(INDUSTRIAL_SELECT).eq('id', id).maybeSingle());
    return r ? mapIndustrial([r])[0] : null;
  },
  async listIndustrialRequestsForLead(leadId) { return mapIndustrial(must(await sb().from('industrial_requests').select(INDUSTRIAL_SELECT).eq('lead_id', leadId)) as any[]); },
  async evaluateIndustrialRequest(id, e, actor) {
    const closed = e.status === 'evaluada' || e.status === 'descartada';
    const patch: Record<string, unknown> = { eval_status: e.status, eval_kwp: e.kwp, eval_notes: e.notes || null, updated_at: new Date().toISOString() };
    if (closed) Object.assign(patch, { evaluated_by: isUuid(actor) ? actor : null, evaluated_at: new Date().toISOString() });
    must(await sb().from('industrial_requests').update(patch).eq('id', id));
  },
  async getIndustrialDocFile(id) {
    if (!isUuid(id)) return null;
    const d = must(await sb().from('industrial_documents').select('storage_path, mime, filename').eq('id', id).maybeSingle()) as { storage_path: string; mime: string; filename: string } | null;
    if (!d) return null;
    const r = await sb().storage.from(PROJECT_DOCS_BUCKET).createSignedUrl(d.storage_path, 60, { download: d.filename });
    return r.error || !r.data ? null : { signedUrl: r.data.signedUrl, mime: d.mime, filename: d.filename };
  },
  async purgeOrphanIndustrialDocs(before) {
    const c = sb();
    const rows = must(await c.from('industrial_documents').select('id, storage_path').is('request_id', null).lt('created_at', before).limit(500)) as { id: string; storage_path: string }[];
    if (!rows.length) return 0;
    const rm = await c.storage.from(PROJECT_DOCS_BUCKET).remove(rows.map((r) => r.storage_path));
    if (rm.error) throw new Error(`No se pudieron borrar los documentos: ${rm.error.message}`);
    must(await c.from('industrial_documents').delete().in('id', rows.map((r) => r.id)));
    return rows.length;
  },
  async getSolarCache(cell, source) {
    const r = must(await sb().from('solar_resource_cache').select('monthly_kwh_per_kwp, monthly_poa_kwh_m2, period, fetched_at').eq('cell', cell).eq('source', source).maybeSingle()) as
      { monthly_kwh_per_kwp: (number | string)[]; monthly_poa_kwh_m2: (number | string)[] | null; period: string | null; fetched_at: string } | null;
    return r ? { monthlyYieldPreLoss: r.monthly_kwh_per_kwp.map(Number), monthlyPoaKwhM2: r.monthly_poa_kwh_m2?.map(Number), period: r.period ?? undefined, fetchedAt: r.fetched_at } : null;
  },
  async putSolarCache(cell, source, r, at) {
    must(await sb().from('solar_resource_cache').upsert({
      cell, source, monthly_kwh_per_kwp: r.monthlyYieldPreLoss, monthly_poa_kwh_m2: r.monthlyPoaKwhM2 ?? null, period: r.period ?? null,
      fetched_at: r.fetchedAt, lat: at.lat, lng: at.lng, tilt: at.tilt, annual_kwh_per_kwp: Math.round(sum(r.monthlyYieldPreLoss) * 10) / 10,
    }, { onConflict: 'cell,source' }));
  },
  async solarCacheStats() { return solarStats(must(await sb().from('solar_resource_cache').select('cell, source, fetched_at').limit(20000)) as { cell: string; source: string; fetched_at: string }[]); },
  async clearSolarCache(before) {
    let q = sb().from('solar_resource_cache').delete().neq('cell', '');
    if (before) q = q.lt('fetched_at', before);
    return (must(await q.select('cell')) as unknown[]).length;
  },
  async track(name, props) { await sb().from('events').insert({ name, props, path: (props?.path as string) ?? null }); },
  async countEvents(name, days) { const { count } = await sb().from('events').select('id', { count: 'exact', head: true }).eq('name', name).gte('at', new Date(Date.now() - days * 864e5).toISOString()); return count ?? 0; },
  async rateLimit(bucket, max, win) {
    const r = await sb().rpc('hit_rate_limit', { p_bucket: bucket, p_max: max, p_window_seconds: win });
    // Ante un error de la base se deja pasar (no bloquear clientes reales), pero queda en el registro.
    if (r.error) console.error(`[límite de solicitudes] hit_rate_limit falló: ${r.error.code} ${r.error.message}`);
    return r.error ? true : !!r.data; },
};
}
const supabaseStore = supabaseStoreFor(null);

export function getStore(): Store {
  const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (hasSupabase) return supabaseStore;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_STORE !== 'true')
    throw new Error('Supabase no está configurado. Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  return devStore;
}

/**
 * Almacén para las acciones del panel: con Supabase, cada escritura queda atribuida a `actorId` (auditoría, historial
 * de pedidos y leads, verificación de pagos). En desarrollo es el mismo almacén local.
 */
export function getStoreAs(actorId: string): Store {
  const st = getStore();
  return st.kind === 'supabase' && isUuid(actorId) ? supabaseStoreFor(actorId) : st;
}
