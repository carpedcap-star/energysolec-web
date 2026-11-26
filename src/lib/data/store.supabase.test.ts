import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Store } from './store';

/**
 * Integración del almacén con un Supabase REAL (Postgres + PostgREST + Auth + Storage + RLS + disparadores).
 * No corre con `npm test`. Con la pila local (`supabase start`, ver docs/SUPABASE.md):
 *   npm run test:supabase
 * Usa datos únicos por corrida: se puede repetir sin reiniciar la base.
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const run = !!(process.env.SUPABASE_IT && URL_ && ANON && SERVICE);
const U = Date.now().toString(36);
const pdf = new TextEncoder().encode('%PDF-1.4\n% prueba\n');

describe.skipIf(!run)('almacén Supabase (integración)', () => {
  let store: Store;
  let as: (id: string) => Store;
  let admin: SupabaseClient, anon: SupabaseClient;
  let gerencia = '', ventas = '';

  beforeAll(async () => {
    const mod = await import('./store');
    store = mod.getStore(); as = mod.getStoreAs;
    expect(store.kind).toBe('supabase');
    admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } });
    anon = createClient(URL_!, ANON!, { auth: { persistSession: false } });
    // Personal real (Auth + profiles) para los disparadores que exigen un responsable con rol.
    for (const [role, set] of [['gerencia', (id: string) => { gerencia = id; }], ['ventas', (id: string) => { ventas = id; }]] as const) {
      const u = await admin.auth.admin.createUser({ email: `${role}-${U}@it.test`, password: `Clave-${U}-2026`, email_confirm: true });
      expect(u.error).toBeNull();
      const p = await admin.from('profiles').insert({ id: u.data.user!.id, email: `${role}-${U}@it.test`, full_name: `IT ${role}`, role, active: true, is_advisor: role === 'ventas' });
      expect(p.error).toBeNull();
      set(u.data.user!.id);
    }
  });

  it('parámetros y tarifas', async () => {
    const p = await store.getActiveParams();
    expect(p.version).toBeGreaterThanOrEqual(1);
    const saved = await store.saveParams({ ...p, isPlaceholder: true }, gerencia);
    expect(saved.version).toBe(p.version + 1);
    expect((await store.getActiveParams()).version).toBe(saved.version);
    const tariffs = await store.listTariffs();
    expect(tariffs.length).toBeGreaterThan(0);
    const id = await store.saveTariff({ ...tariffs[0], id: undefined, code: `IT-${U}`, name: `Tarifa IT ${U}` } as never);
    expect((await store.listTariffs()).some((t) => t.id === id)).toBe(true);
    await store.deactivateTariff(id);
    expect((await store.listTariffs()).some((t) => t.id === id)).toBe(false);
  });

  let leadId = '', studyCode = '', studyId = '';
  it('estudio, lead con consentimientos y desbloqueo', async () => {
    const st = await store.createStudy({ mode: 'rapida', inputs: { province: 'Guayas' }, results: { sizing: { kwp: 3 } } as never, params_version: 1, solar_source: 'IT' });
    expect(st.code).toMatch(/^ESE-\d{4}-\d{6}$/);
    studyCode = st.code; studyId = st.id;
    const lead = await store.createLead({ full_name: `Lead IT ${U}`, email: `lead-${U}@it.test`, source: 'calculadora', utm: {}, segment: 'residencial' },
      [{ purpose: 'privacidad_servicio', granted: true }, { purpose: 'comercial_marketing', granted: false }], { ipHash: 'x', ua: 'it', policyVersion: 'it' });
    leadId = lead.id;
    expect(await store.hasMarketingConsent(`lead-${U}@it.test`)).toBe(false);
    await store.unlockStudy(studyCode, leadId);
    expect((await store.getStudyByCode(studyCode))?.lead_id).toBe(leadId);
    expect((await store.listStudiesForLead(leadId)).map((s) => s.code)).toContain(studyCode);
    await store.updateLead(leadId, { stage: 'contactado' }, gerencia);
    await store.addActivity(leadId, 'nota', 'Prueba de integración', gerencia);
    expect((await store.listActivities(leadId)).some((a) => a.body === 'Prueba de integración')).toBe(true);
  });

  it('RLS: la clave pública no lee leads, consentimientos ni ajustes privados', async () => {
    const leads = await anon.from('leads').select('id').eq('id', leadId);
    expect(leads.data ?? []).toHaveLength(0);
    expect((await anon.from('consents').select('id').limit(1)).data ?? []).toHaveLength(0);
    await store.saveSetting('notifications', { salesEmail: `avisos-${U}@it.test` }, gerencia);
    await store.saveSetting('contact', { whatsapp: '593991112222', email: 'info@it.test', city: 'Quito' }, gerencia);
    expect((await anon.from('site_settings').select('key').eq('key', 'notifications')).data ?? []).toHaveLength(0);
    expect((await anon.from('site_settings').select('key').eq('key', 'contact')).data).toHaveLength(1);
    expect(await store.getSetting<{ salesEmail: string }>('notifications', null as never)).toMatchObject({ salesEmail: `avisos-${U}@it.test` });
  });

  let productId = '';
  it('productos con precios por nivel; la clave pública no ve precios de nivel', async () => {
    productId = await store.saveProduct({
      sku: `IT-${U}`, slug: `it-${U}`, name: `Panel IT ${U}`, brand_id: null, model: 'M', category: 'paneles-solares', summary: null, specs: {}, warranty: null, certifications: [],
      vat_rate: 0.15, stock: 5, availability: 'disponible', installable: false, is_placeholder: false, published: true, image_ids: [], datasheet_id: null,
      prices: [{ tier: 'final', price: 200, promo_price: null, promo_until: null }, { tier: 'instalador', price: 160, promo_price: null, promo_until: null }],
    });
    const [fin] = await store.getProductsByIds([productId]);
    expect(fin).toMatchObject({ price: 200 });
    const [ins] = await store.getProductsByIds([productId], 'instalador');
    expect(ins).toMatchObject({ price: 160, tier_applied: 'instalador', final_unit: 200 });
    const pub = await anon.from('product_prices').select('tier, price').eq('product_id', productId);
    expect(pub.data?.map((r) => r.tier)).toEqual(['final']);
  });

  it('pedido: precio de nivel sin cuenta lo rechaza la base; pagado exige verificación', async () => {
    const base = { lead_id: leadId, customer_name: 'IT', email: `lead-${U}@it.test`, phone: '0991234567', city: 'Quito', address: 'Calle 1', customer_type: 'final' as const,
      notes: null, needs_installation: false, subtotal: 200, tax: 30, total: 230, items: [{ product_id: productId, sku: `IT-${U}`, name: 'Panel', qty: 1, unit_price: 200, vat_rate: 0.15, line_subtotal: 200 }] };
    await expect(store.createOrder({ ...base, price_tier: 'instalador', trade_account_id: null })).rejects.toThrow();
    const o = await store.createOrder(base);
    expect(o.number).toMatch(/^ESE-P-/);
    // Ventas no puede verificar un pago, ni siquiera diciendo que lo verifica Gerencia (el actor debe coincidir).
    await expect(as(ventas).updateOrderStatus(o.id, 'pagado', ventas, { reference: `TRX-${U}` })).rejects.toThrow(/Solo Gerencia/);
    await expect(as(ventas).updateOrderStatus(o.id, 'pagado', gerencia, { reference: `TRX-${U}` })).rejects.toThrow(/Solo Gerencia/);
    await expect(store.updateOrderStatus(o.id, 'pagado', gerencia, { reference: `TRX-${U}` })).rejects.toThrow(/Solo Gerencia/);
    await as(gerencia).updateOrderStatus(o.id, 'pagado', gerencia, { reference: `TRX-${U}` });
    expect((await store.getOrder(o.id))?.status).toBe('pagado');
    const hist = await admin.from('order_status_history').select('to_status, actor').eq('order_id', o.id).order('at');
    expect(hist.data?.at(-1)).toMatchObject({ to_status: 'pagado', actor: gerencia });
  });

  it('cuenta comercial: solicitud, aprobación por Gerencia (Ventas no puede) y pedido con nivel', async () => {
    const id = await store.createTradeApplication({ company: `Solar IT ${U}`, ruc: `17${String(Date.now()).slice(-8)}001`, tier: 'instalador', contact_name: 'Ana IT', email: `trade-${U}@it.test`, phone: '0991234567', city: 'Quito', notes: null }, leadId);
    await expect(store.createTradeApplication({ company: 'Dup', ruc: '0912345678001', tier: 'instalador', contact_name: 'X', email: `trade-${U}@it.test`, phone: null, city: null, notes: null }, null)).rejects.toThrow(/correo/);
    await expect(store.reviewTradeAccount(id, { status: 'aprobada', tier: 'instalador', review_note: '' }, ventas)).rejects.toThrow(/Gerencia/);
    const link = await store.reviewTradeAccount(id, { status: 'aprobada', tier: 'instalador', review_note: 'RUC verificado' }, gerencia);
    expect(link?.token_hash).toBeTruthy();
    const t = await store.getTradeAccount(id);
    expect(t?.status).toBe('aprobada');
    const users = await admin.auth.admin.listUsers();
    const uid = users.data.users.find((u) => u.email === `trade-${U}@it.test`)!.id;
    expect((await store.getApprovedTradeAccountForUser(uid))?.id).toBe(id);
    const o = await store.createOrder({ lead_id: leadId, customer_name: 'Ana IT', email: `trade-${U}@it.test`, phone: '0991234567', city: 'Quito', address: 'Calle 2', customer_type: 'instalador',
      notes: null, needs_installation: false, subtotal: 160, tax: 24, total: 184, price_tier: 'instalador', trade_account_id: id,
      items: [{ product_id: productId, sku: `IT-${U}`, name: 'Panel', qty: 1, unit_price: 160, vat_rate: 0.15, line_subtotal: 160 }] });
    expect((await store.listOrdersForTradeAccount(id)).map((x) => x.id)).toContain(o.id);
    expect((await store.createTradeAccessToken(id)).token_hash).toBeTruthy();
    await store.reviewTradeAccount(id, { status: 'suspendida', tier: 'instalador', review_note: 'prueba' }, gerencia);
    expect(await store.getApprovedTradeAccountForUser(uid)).toBeNull();
  });

  it('planilla en el bucket privado: guardar, vincular una vez, archivo firmado', async () => {
    const id = await store.saveBillUpload({ bytes: pdf, mime: 'application/pdf', ext: 'pdf', extracted: { read: { energyKwh: 320 } } });
    expect(await store.confirmBillUpload(id, studyId, { monthlyKwh: 320 })).toBe(true);
    expect(await store.confirmBillUpload(id, studyId, { monthlyKwh: 999 })).toBe(false);
    await store.unlockStudy(studyCode, leadId);
    expect((await store.listBillUploadsForLead(leadId)).map((b) => b.id)).toContain(id);
    const f = await store.getBillFile(id);
    expect(f && 'signedUrl' in f).toBe(true);
    const r = await fetch((f as { signedUrl: string }).signedUrl);
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(pdf);
    expect((await anon.storage.from('bills').list()).data ?? []).toHaveLength(0);
  });

  it('cola de correos: reserva sin duplicados, error, reintento manual', async () => {
    const to = `cola-${U}@it.test`;
    await store.queueMessage({ channel: 'email', to, template: 'estudio_solar', payload: { subject: 'S', html: '<p>x</p>' }, status: 'pendiente', next_attempt_at: new Date(Date.now() - 1000).toISOString() });
    const first = (await store.claimDueMessages(50)).filter((m) => m.to_address === to);
    expect(first).toHaveLength(1);
    expect(first[0].attempts).toBe(1);
    expect((await store.claimDueMessages(50)).filter((m) => m.to_address === to)).toHaveLength(0);
    await store.finishMessage(first[0].id, { status: 'error', error: 'falla' });
    expect(await store.requeueMessage(first[0].id)).toBe(true);
    await store.finishMessage(first[0].id, { status: 'enviado', clearBody: true });
    const m = (await store.listMessages({ status: 'enviado' })).find((x) => x.id === first[0].id);
    expect(m?.payload).toEqual({ subject: 'S', has_body: false });
    expect((await store.messageStats()).enviado).toBeGreaterThanOrEqual(1);
  });

  it('recordatorios y tareas', async () => {
    const at = new Date(Date.now() - 3600e3).toISOString();
    await store.updateLead(leadId, { next_activity_at: at, advisor_id: ventas }, gerencia);
    expect((await store.listLeadsForReminders()).find((l) => l.id === leadId)?.next_activity_at).toBeTruthy();
    await store.markLeadReminders([{ id: leadId, reminded_for: at }]);
    const l = (await store.listLeadsForReminders()).find((x) => x.id === leadId);
    expect(Date.parse(l!.next_activity_reminded_for!)).toBe(Date.parse(at));
    const run = await store.startCronRun('panel', gerencia);
    await store.finishCronRun(run, { ok: true, summary: { it: 1 } });
    expect((await store.listCronRuns(5)).find((r) => r.id === run)).toMatchObject({ ok: true, summary: { it: 1 } });
    expect(await store.rateLimit(`it-${U}`, 1, 60)).toBe(true);
    expect(await store.rateLimit(`it-${U}`, 1, 60)).toBe(false);
    expect(await store.pruneRateLimits()).toBeGreaterThanOrEqual(0);
  });

  it('caché del recurso solar', async () => {
    const cell = `lat:-9.99|lng:-${U}|tilt:10`;
    const r = { monthlyYieldPreLoss: Array(12).fill(100), monthlyPoaKwhM2: Array(12).fill(120), period: '2005–2015', fetchedAt: new Date().toISOString() };
    await store.putSolarCache(cell, 'PVGIS-ERA5', r, { lat: -1, lng: -79, tilt: 10 });
    await store.putSolarCache(cell, 'PVGIS-ERA5', { ...r, period: '2005–2023' }, { lat: -1, lng: -79, tilt: 10 });
    expect(await store.getSolarCache(cell, 'PVGIS-ERA5')).toMatchObject({ monthlyYieldPreLoss: Array(12).fill(100), period: '2005–2023' });
    expect((await store.solarCacheStats()).rows).toBeGreaterThanOrEqual(1);
  });

  it('cotización industrial: documento privado, vínculo único, evaluación con criterio', async () => {
    const docId = await store.saveIndustrialDoc({ bytes: pdf, mime: 'application/pdf', ext: 'pdf', filename: 'planilla.pdf' });
    const reqId = await store.createIndustrialRequest({ lead_id: leadId, solutions: ['cubierta'], company: `Ind IT ${U}`, ruc: null, sector: 'Otro',
      details: { monthlyKwh: 1000, monthlyBillUsd: null, demandKw: null, voltage: 'mt', hours: null, areaM2: null, site: '', message: '', province: 'Guayas', city: '', position: '' } }, [{ id: docId, kind: 'planilla' }]);
    const r = await store.getIndustrialRequest(reqId);
    expect(r?.documents.map((d) => d.kind)).toEqual(['planilla']);
    expect(r?.lead_name).toBe(`Lead IT ${U}`);
    // El mismo documento no se puede vincular a otra solicitud.
    const other = await store.createIndustrialRequest({ lead_id: r!.lead_id, solutions: ['om'], company: r!.company, ruc: null, sector: r!.sector, details: r!.details }, [{ id: docId, kind: 'plano' }]);
    expect((await store.getIndustrialRequest(other))?.documents).toHaveLength(0);
    await expect(store.evaluateIndustrialRequest(reqId, { status: 'evaluada', kwp: 50, notes: 'corto' }, gerencia)).rejects.toThrow();
    await store.evaluateIndustrialRequest(reqId, { status: 'evaluada', kwp: 50, notes: 'Cubierta apta para 50 kWp.' }, gerencia);
    expect((await store.getIndustrialRequest(reqId))).toMatchObject({ eval_status: 'evaluada', eval_kwp: 50, evaluated_by: gerencia });
    const f = await store.getIndustrialDocFile(docId);
    expect(f && 'signedUrl' in f).toBe(true);
    expect((await anon.from('industrial_requests').select('id')).data ?? []).toHaveLength(0);
  });

  it('auditoría e historial con el autor real; la cabecera no se puede suplantar sin la clave de servicio', async () => {
    await as(ventas).updateLead(leadId, { stage: 'calificado' }, ventas);
    const act = await admin.from('lead_activities').select('kind, actor, body').eq('lead_id', leadId).eq('kind', 'cambio_etapa').order('at', { ascending: false }).limit(1);
    expect(act.data?.[0]).toMatchObject({ actor: ventas, body: 'contactado → calificado' });
    await as(gerencia).saveSetting('contact', { whatsapp: '593991112222', email: 'info@it.test', city: 'Guayaquil' }, gerencia);
    const aud = await admin.from('audit_log').select('actor, table_name, record_id').eq('table_name', 'site_settings').order('at', { ascending: false }).limit(1);
    expect(aud.data?.[0]).toMatchObject({ actor: gerencia, record_id: null });
    // Sin actor (tareas del sistema): null, como corresponde.
    await store.saveSetting('contact', { whatsapp: '593991112222', email: 'info@it.test', city: 'Quito' }, gerencia);
    const sys = await admin.from('audit_log').select('actor').eq('table_name', 'site_settings').order('at', { ascending: false }).limit(1);
    expect(sys.data?.[0].actor).toBeNull();
    // Con la clave pública, la cabecera no sirve: las funciones no se pueden llamar y no hay escrituras.
    const spoof = createClient(URL_!, ANON!, { auth: { persistSession: false }, global: { headers: { 'x-ese-actor': gerencia } } });
    expect((await spoof.rpc('app_actor')).error).toBeTruthy();
    const w = await spoof.from('orders').update({ status: 'cancelado' }).eq('lead_id', leadId).select('id');
    expect(w.data ?? []).toHaveLength(0);
  });

  it('Auth: nadie se registra solo con la clave pública (los usuarios los crea el servidor)', async () => {
    const r = await anon.auth.signUp({ email: `intruso-${U}@it.test`, password: 'Intruso-2026-xx' });
    expect(r.error?.message ?? '').toMatch(/sign.?ups? (are )?(not allowed|disabled)/i);
  });

  it('funciones del servidor: solo la clave de servicio las invoca; límite de solicitudes y asesor siguen funcionando', async () => {
    // Usuario del panel con sesión real (rol authenticated en la API).
    const user = createClient(URL_!, ANON!, { auth: { persistSession: false } });
    expect((await user.auth.signInWithPassword({ email: `ventas-${U}@it.test`, password: `Clave-${U}-2026` })).error).toBeNull();
    const calls: [string, Record<string, unknown>][] = [
      ['hit_rate_limit', { p_bucket: `it-${U}`, p_max: 1, p_window_seconds: 60 }], ['next_advisor', {}],
      ['claim_outbound', { p_limit: 1, p_lease_seconds: 1 }], ['prune_rate_limits', { p_older_than_seconds: 2_000_000_000 }],
      ['app_actor', {}], ['actor_role_is', { roles: ['superadmin'] }],
    ];
    for (const [fn, args] of calls) for (const [who, c] of [['anon', anon], ['authenticated', user]] as const) {
      const r = await c.rpc(fn, args);
      expect(r.error, `${who} no debe poder invocar ${fn}`).not.toBeNull();
      expect(r.error?.code, `${who} → ${fn}`).toBe('42501');
    }
    expect((await admin.rpc('next_advisor')).error).toBeNull();
    // current_role_is sigue disponible para las políticas RLS: el usuario lee su propio perfil.
    expect((await user.rpc('current_role_is', { roles: ['ventas'] })).data).toBe(true);
    expect((await user.from('profiles').select('id').eq('id', ventas)).data).toHaveLength(1);
    // El límite de solicitudes del servidor sigue bloqueando (falla abierto ante error: aquí debe bloquear de verdad).
    const bucket = `it-limite-${U}`;
    expect([await store.rateLimit(bucket, 2, 60), await store.rateLimit(bucket, 2, 60), await store.rateLimit(bucket, 2, 60)]).toEqual([true, true, false]);
    // Asignación automática de asesor al crear un lead.
    const lead = await store.createLead({ full_name: `Lead asesor ${U}`, email: `asesor-${U}@it.test`, source: 'contacto', utm: {} },
      [{ purpose: 'privacidad_servicio', granted: true }], { ipHash: 'x', ua: 'it', policyVersion: 'it' });
    expect(lead.advisor_id).toBeTruthy();
    await user.auth.signOut();
  });

  it('usuarios del panel', async () => {
    const u = await store.createUser({ full_name: 'Nuevo IT', email: `nuevo-${U}@it.test`, phone: null, role: 'marketing', is_advisor: false });
    expect(u.token_hash).toBeTruthy();
    await store.updateUser(u.id, { full_name: 'Nuevo IT', phone: null, role: 'compras', is_advisor: false, active: false });
    expect((await store.listUsers()).find((x) => x.id === u.id)).toMatchObject({ role: 'compras', active: false });
    await expect(store.createUser({ full_name: 'Dup', email: `nuevo-${U}@it.test`, phone: null, role: 'marketing', is_advisor: false })).rejects.toThrow(/Ya existe/);
  });
});
