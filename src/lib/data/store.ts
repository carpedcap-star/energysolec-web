import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CalcParams, DEFAULT_PARAMS } from '../engine/params';
import { DEFAULT_TARIFFS } from '../engine/default-tariffs';
import type { Tariff } from '../engine/tariff';
import type { Activity, Brand, Consent, Lead, LeadStage, Order, OrderStatus, Product, Project, Stat, Study } from './types';
import { PAID_STATES } from './types';
import { SEED_BRANDS, SEED_PRODUCTS, SEED_PROJECTS, SEED_STATS } from './seed';

/**
 * Capa de acceso a datos del servidor. Dos implementaciones con la misma interfaz:
 *  - Supabase (producción): service role SOLO en el servidor; la RLS protege accesos desde el navegador.
 *  - Archivo local .data/dev-db.json (desarrollo sin credenciales). Nunca se usa en producción.
 */
export interface Store {
  kind: 'supabase' | 'dev';
  getActiveParams(): Promise<CalcParams>;
  saveParams(p: Omit<CalcParams, 'version'>, actor: string): Promise<CalcParams>;
  listTariffs(): Promise<Tariff[]>;
  saveTariff(t: Tariff): Promise<void>;
  createStudy(s: Omit<Study, 'id' | 'code' | 'created_at' | 'unlocked' | 'visit_requested' | 'lead_id'>): Promise<Study>;
  getStudyByCode(code: string): Promise<Study | null>;
  unlockStudy(code: string, leadId: string): Promise<void>;
  requestVisit(code: string): Promise<void>;
  createLead(l: Omit<Lead, 'id' | 'created_at' | 'stage' | 'advisor_id'>, consents: Consent[], meta: { ipHash: string; ua: string; policyVersion: string }): Promise<Lead>;
  listLeads(f?: { stage?: LeadStage; advisor?: string }): Promise<Lead[]>;
  getLead(id: string): Promise<Lead | null>;
  updateLead(id: string, patch: Partial<Lead>, actor: string): Promise<void>;
  addActivity(leadId: string, kind: string, body: string, actor: string | null): Promise<void>;
  listActivities(leadId: string): Promise<Activity[]>;
  hasMarketingConsent(email: string): Promise<boolean>;
  listProducts(opts?: { includeUnpublished?: boolean }): Promise<Product[]>;
  getProductsByIds(ids: string[]): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  createOrder(o: Omit<Order, 'id' | 'number' | 'created_at' | 'status' | 'payment_reference' | 'payment_verified_by' | 'payment_verified_at' | 'whatsapp_message'>): Promise<Order>;
  setOrderWhatsapp(id: string, msg: string, channel: 'cloud_api' | 'wa_link'): Promise<void>;
  listOrders(): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  updateOrderStatus(id: string, status: OrderStatus, actor: string, payment?: { reference: string }): Promise<void>;
  listStats(): Promise<Stat[]>;
  saveStat(s: Stat): Promise<void>;
  listProjects(opts?: { includeUnpublished?: boolean }): Promise<Project[]>;
  listBrands(): Promise<Brand[]>;
  getSetting<T>(key: string, fallback: T): Promise<T>;
  queueMessage(m: { channel: 'email' | 'whatsapp'; to: string; template: string; payload: unknown; status: string; error?: string }): Promise<void>;
  track(name: string, props?: Record<string, unknown>): Promise<void>;
  countEvents(name: string, sinceDays: number): Promise<number>;
  rateLimit(bucket: string, max: number, windowSec: number): Promise<boolean>;
}

const year = () => new Date().getFullYear();
const pad = (n: number) => String(n).padStart(6, '0');

// ======================= Implementación de desarrollo =======================
type DevDb = {
  params: CalcParams[]; tariffs: Tariff[]; studies: Study[]; leads: Lead[]; activities: Activity[];
  consents: (Consent & { email: string; at: string })[]; products: Product[]; orders: Order[]; stats: Stat[];
  projects: Project[]; brands: Brand[]; messages: unknown[]; events: { name: string; at: string; props?: unknown }[];
  seq: { study: number; order: number }; rl: Record<string, { c: number; t: number }>;
};
const DEV_FILE = path.join(process.cwd(), '.data', 'dev-db.json');
let devCache: DevDb | null = null;
let devLock: Promise<unknown> = Promise.resolve();

async function devLoad(): Promise<DevDb> {
  if (devCache) return devCache;
  try { devCache = JSON.parse(await fs.readFile(DEV_FILE, 'utf8')); }
  catch {
    devCache = { params: [{ ...DEFAULT_PARAMS, version: 1 }], tariffs: DEFAULT_TARIFFS.map((t) => ({ ...t, id: randomUUID() })), studies: [], leads: [], activities: [], consents: [],
      products: SEED_PRODUCTS, orders: [], stats: SEED_STATS, projects: SEED_PROJECTS, brands: SEED_BRANDS, messages: [], events: [], seq: { study: 0, order: 999 }, rl: {} };
    await devSave();
  }
  return devCache!;
}
async function devSave() { await fs.mkdir(path.dirname(DEV_FILE), { recursive: true }); await fs.writeFile(DEV_FILE, JSON.stringify(devCache, null, 1)); }
function tx<T>(fn: (db: DevDb) => T | Promise<T>): Promise<T> {
  const run = devLock.then(async () => { const db = await devLoad(); const r = await fn(db); await devSave(); return r; });
  devLock = run.catch(() => undefined);
  return run;
}

const devStore: Store = {
  kind: 'dev',
  getActiveParams: () => tx((db) => db.params[db.params.length - 1]),
  saveParams: (p) => tx((db) => { const v = { ...p, version: db.params.length + 1 } as CalcParams; db.params.push(v); return v; }),
  listTariffs: () => tx((db) => db.tariffs),
  saveTariff: (t) => tx((db) => { const i = db.tariffs.findIndex((x) => x.id === t.id); if (i >= 0) db.tariffs[i] = t; else db.tariffs.push({ ...t, id: randomUUID() }); }),
  createStudy: (s) => tx((db) => {
    const st: Study = { ...s, id: randomUUID(), code: `ESE-${year()}-${pad(++db.seq.study)}`, lead_id: null, unlocked: false, visit_requested: false, created_at: new Date().toISOString() };
    db.studies.push(st); return st;
  }),
  getStudyByCode: (code) => tx((db) => db.studies.find((s) => s.code === code) ?? null),
  unlockStudy: (code, leadId) => tx((db) => { const s = db.studies.find((x) => x.code === code); if (s) { s.unlocked = true; s.lead_id = leadId; } }),
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
  listProducts: (o) => tx((db) => db.products.filter((p) => o?.includeUnpublished || p.published)),
  getProductsByIds: (ids) => tx((db) => db.products.filter((p) => ids.includes(p.id) && p.published)),
  getProductBySlug: (slug) => tx((db) => db.products.find((p) => p.slug === slug && p.published) ?? null),
  createOrder: (o) => tx((db) => {
    const ord: Order = { ...o, id: randomUUID(), number: `ESE-P-${year()}-${pad(++db.seq.order)}`, status: 'nuevo', payment_reference: null,
      payment_verified_by: null, payment_verified_at: null, whatsapp_message: '', created_at: new Date().toISOString() };
    db.orders.push(ord); return ord;
  }),
  setOrderWhatsapp: (id, msg) => tx((db) => { const o = db.orders.find((x) => x.id === id); if (o) o.whatsapp_message = msg; }),
  listOrders: () => tx((db) => [...db.orders].sort((a, b) => b.created_at.localeCompare(a.created_at))),
  getOrder: (id) => tx((db) => db.orders.find((o) => o.id === id) ?? null),
  updateOrderStatus: (id, status, actor, payment) => tx((db) => {
    const o = db.orders.find((x) => x.id === id); if (!o) throw new Error('Pedido no encontrado');
    if (payment) { o.payment_reference = payment.reference; o.payment_verified_by = actor; o.payment_verified_at = new Date().toISOString(); }
    if (PAID_STATES.includes(status) && !(o.payment_reference && o.payment_verified_by)) throw new Error('No se puede marcar como pagado sin una confirmación de pago verificada.');
    o.status = status;
  }),
  listStats: () => tx((db) => [...db.stats].sort((a, b) => a.sort - b.sort)),
  saveStat: (s) => tx((db) => { const i = db.stats.findIndex((x) => x.id === s.id); if (i >= 0) db.stats[i] = s; else db.stats.push(s); }),
  listProjects: (o) => tx((db) => db.projects.filter((p) => o?.includeUnpublished || p.published)),
  listBrands: () => tx((db) => db.brands.filter((b) => b.published)),
  getSetting: async (_k, fallback) => fallback,
  queueMessage: (m) => tx((db) => { db.messages.push({ ...m, at: new Date().toISOString() }); }),
  track: (name, props) => tx((db) => { db.events.push({ name, props, at: new Date().toISOString() }); if (db.events.length > 5000) db.events.splice(0, 1000); }),
  countEvents: (name, days) => tx((db) => { const since = Date.now() - days * 864e5; return db.events.filter((e) => e.name === name && Date.parse(e.at) >= since).length; }),
  rateLimit: (bucket, max, win) => tx((db) => {
    const now = Date.now(); const r = db.rl[bucket];
    if (!r || now - r.t > win * 1000) { db.rl[bucket] = { c: 1, t: now }; return true; }
    if (r.c >= max) return false; r.c++; return true;
  }),
};

// ======================= Implementación Supabase =======================
function sb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}
const mapProduct = (p: any): Product => ({
  id: p.id, sku: p.sku, slug: p.slug, name: p.name, brand: p.brands?.name ?? null, model: p.model, category: p.product_categories?.slug ?? '',
  summary: p.summary, specs: p.specs ?? {}, warranty: p.warranty, certifications: p.certifications ?? [],
  images: (p.images_paths ?? []) as string[], datasheet_url: p.datasheet_url ?? null, vat_rate: Number(p.vat_rate), stock: p.stock,
  availability: p.availability, installable: p.installable,
  price: Number(p.product_prices?.find((x: any) => x.tier === 'final')?.price ?? 0),
  promo_price: (() => { const f = p.product_prices?.find((x: any) => x.tier === 'final'); return f?.promo_price && (!f.promo_until || Date.parse(f.promo_until) > Date.now()) ? Number(f.promo_price) : null; })(),
  is_placeholder: p.is_placeholder, published: p.published,
});
const PRODUCT_SELECT = '*, brands(name), product_categories(slug), product_prices(tier, price, promo_price, promo_until)';

const supabaseStore: Store = {
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
  async saveTariff(t) { must(await sb().from('tariffs').upsert({ ...t, valid_from: (t as any).valid_from ?? new Date().toISOString().slice(0, 10) })); },
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
  async unlockStudy(code, leadId) { must(await sb().from('solar_studies').update({ unlocked: true, lead_id: leadId }).eq('code', code)); },
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
    return (must(await q) as any[]).map(mapProduct);
  },
  async getProductsByIds(ids) { return (must(await sb().from('products').select(PRODUCT_SELECT).in('id', ids).eq('published', true)) as any[]).map(mapProduct); },
  async getProductBySlug(slug) { const r = must(await sb().from('products').select(PRODUCT_SELECT).eq('slug', slug).eq('published', true).maybeSingle()); return r ? mapProduct(r) : null; },
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
  async getOrder(id) { return must(await sb().from('orders').select('*, items:order_items(*)').eq('id', id).maybeSingle()) as Order | null; },
  async updateOrderStatus(id, status, actor, payment) {
    const patch: Record<string, unknown> = { status };
    if (payment) Object.assign(patch, { payment_reference: payment.reference, payment_verified_by: actor, payment_verified_at: new Date().toISOString() });
    must(await sb().from('orders').update(patch).eq('id', id));
  },
  async listStats() { return must(await sb().from('company_stats').select('*').order('sort')) as Stat[]; },
  async saveStat(s) { must(await sb().from('company_stats').upsert(s)); },
  async listProjects(o) {
    let q = sb().from('projects').select('*').order('executed_on', { ascending: false, nullsFirst: false });
    if (!o?.includeUnpublished) q = q.eq('published', true);
    return (must(await q) as any[]).map((p) => ({ ...p, client_name: p.client_name_authorized ? p.client_name : null, annual_savings_usd: p.financials_authorized ? p.annual_savings_usd : null, is_placeholder: false })) as Project[];
  },
  async listBrands() { return must(await sb().from('brands').select('*').eq('published', true).order('sort')) as Brand[]; },
  async getSetting(key, fallback) { const r = await sb().from('site_settings').select('value').eq('key', key).maybeSingle(); return (r.data?.value ?? fallback) as any; },
  async queueMessage(m) { await sb().from('outbound_messages').insert({ channel: m.channel, to_address: m.to, template: m.template, payload: m.payload, status: m.status, error: m.error }); },
  async track(name, props) { await sb().from('events').insert({ name, props, path: (props?.path as string) ?? null }); },
  async countEvents(name, days) { const { count } = await sb().from('events').select('id', { count: 'exact', head: true }).eq('name', name).gte('at', new Date(Date.now() - days * 864e5).toISOString()); return count ?? 0; },
  async rateLimit(bucket, max, win) { const r = await sb().rpc('hit_rate_limit', { p_bucket: bucket, p_max: max, p_window_seconds: win }); return r.error ? true : !!r.data; },
};

export function getStore(): Store {
  const hasSupabase = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (hasSupabase) return supabaseStore;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_STORE !== 'true')
    throw new Error('Supabase no está configurado. Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  return devStore;
}
