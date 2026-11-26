// Verificación de SOLO LECTURA de un proyecto Supabase antes del primer despliegue.
// No escribe nada y no imprime claves. Úsalo en tu computadora:
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_... \
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
//   node scripts/verificar-produccion.mjs
//
// Sale con código 1 si algún punto obligatorio falla.
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SECRET) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.'); process.exit(2); }
if (/^sb_secret_|service_role/.test(ANON)) { console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY parece una clave SECRETA: nunca debe ir en una variable NEXT_PUBLIC_.'); process.exit(2); }

// Si el proyecto no responde, mejor un error claro que un script colgado.
setTimeout(() => { console.error('\n✗ Sin respuesta del proyecto en 90 s: revisa la URL y tu conexión.'); process.exit(2); }, 90_000).unref();
const opts = { auth: { persistSession: false } };
const admin = createClient(URL_, SECRET, opts), anon = createClient(URL_, ANON, opts);
let fails = 0, warns = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { fails++; console.log(`  ✗ ${m}`); };
const warn = (m) => { warns++; console.log(`  ! ${m}`); };
const check = (cond, m, detail = '') => (cond ? ok(m) : bad(detail ? `${m} — ${detail}` : m));

console.log(`\nProyecto: ${new URL(URL_).host}\n`);

// 1. Esquema: todas las tablas de las migraciones 0001–0010
console.log('1. Migraciones');
const TABLES = ['profiles', 'audit_log', 'site_settings', 'content_blocks', 'media', 'company_stats', 'seo_meta', 'brands', 'brand_assets', 'services', 'projects', 'project_media',
  'product_categories', 'products', 'product_prices', 'product_relations', 'trade_accounts', 'leads', 'lead_activities', 'consents', 'tariffs', 'calc_params', 'solar_resource_cache',
  'solar_studies', 'bill_uploads', 'orders', 'order_items', 'order_status_history', 'blog_posts', 'outbound_messages', 'events', 'rate_limits', 'cron_runs',
  'industrial_requests', 'industrial_documents', 'projects_public', 'brands_public'];
const missing = [];
for (const t of TABLES) { const r = await admin.from(t).select('*', { count: 'exact', head: true }); if (r.error) missing.push(`${t} (${r.error.message})`); }
check(!missing.length, `${TABLES.length} tablas y vistas presentes`, missing.join('; '));
const cols = [['trade_accounts', 'status'], ['outbound_messages', 'next_attempt_at'], ['solar_resource_cache', 'period'], ['industrial_requests', 'eval_status'], ['leads', 'next_activity_reminded_for']];
for (const [t, c] of cols) { const r = await admin.from(t).select(c).limit(1); check(!r.error, `columna ${t}.${c}`, r.error?.message); }
const actor = await admin.rpc('app_actor');
check(!actor.error && actor.data === null, 'migración 0010: app_actor() existe (sin actor con la clave de servicio)', actor.error?.message);

// 2. RLS: la clave pública no ve nada privado
console.log('\n2. Seguridad de datos (clave pública)');
const PRIVATE = ['profiles', 'audit_log', 'trade_accounts', 'leads', 'lead_activities', 'consents', 'solar_resource_cache', 'solar_studies', 'bill_uploads', 'orders',
  'order_items', 'order_status_history', 'outbound_messages', 'events', 'rate_limits', 'cron_runs', 'industrial_requests', 'industrial_documents'];
const leaks = [];
for (const t of PRIVATE) { const r = await anon.from(t).select('*').limit(1); if (!r.error && r.data?.length) leaks.push(t); }
check(!leaks.length, `${PRIVATE.length} tablas privadas sin filas visibles`, `VISIBLES: ${leaks.join(', ')}`);
const notif = await anon.from('site_settings').select('key').eq('key', 'notifications');
check(!notif.data?.length, 'el correo de avisos internos no es público');
const rpc = await anon.rpc('app_actor');
check(!!rpc.error, 'app_actor() no se puede llamar con la clave pública');
const tierPrices = await anon.from('product_prices').select('tier').neq('tier', 'final').limit(1);
check(!tierPrices.data?.length, 'precios de instalador y distribuidor ocultos al público');

// 3. Storage
console.log('\n3. Almacenamiento');
const { data: buckets, error: be } = await admin.storage.listBuckets();
if (be) bad(`no se pudieron listar los buckets: ${be.message}`);
else {
  const by = Object.fromEntries(buckets.map((b) => [b.id, b]));
  check(by['public-media']?.public === true, 'public-media existe y es público');
  for (const id of ['private-docs', 'bills', 'project-docs', 'reports']) check(by[id] && by[id].public === false, `${id} existe y es PRIVADO`);
}

// 4. Auth
console.log('\n4. Autenticación');
const st = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } }).then((r) => r.json()).catch(() => null);
if (!st) bad('no se pudo leer la configuración de Auth');
else {
  check(st.disable_signup === true, 'registros públicos DESACTIVADOS', 'activa «Allow new users to sign up» = OFF en Authentication → Sign In / Providers');
  check(st.external?.email === true, 'proveedor Email activo (inicio de sesión con correo y contraseña)');
}
const { data: supers } = await admin.from('profiles').select('id, email, active').eq('role', 'superadmin').eq('active', true);
if (!supers?.length) bad('no hay ningún superadministrador activo');
else for (const s of supers) {
  const u = await admin.auth.admin.getUserById(s.id);
  check(!!u.data.user?.email_confirmed_at, `superadministrador ${s.email} con usuario de Auth confirmado`);
}

// 5. Datos iniciales
console.log('\n5. Datos iniciales');
const { data: params } = await admin.from('calc_params').select('version, is_placeholder').eq('active', true);
check(params?.length === 1, 'un juego de parámetros de cálculo activo');
if (params?.[0]?.is_placeholder) warn('los parámetros siguen PROVISIONALES: Gerencia debe validarlos en /admin/parametros');
const { data: tariffs } = await admin.from('tariffs').select('segment, is_placeholder').eq('active', true);
for (const seg of ['residencial', 'comercial', 'industrial']) check(tariffs?.some((t) => t.segment === seg), `tarifa activa para el segmento ${seg}`);
if (tariffs?.some((t) => t.is_placeholder)) warn('hay tarifas PROVISIONALES: Ingeniería debe cargar el pliego ARCONEL en /admin/tarifas');
const cats = await admin.from('product_categories').select('*', { count: 'exact', head: true });
check((cats.count ?? 0) >= 16, `categorías de la tienda (${cats.count ?? 0})`);
const pubBrands = await anon.from('brands').select('slug');
if (pubBrands.data?.length) warn(`${pubBrands.data.length} marca(s) publicada(s): confirma que Marketing las revisó`); else ok('ninguna marca publicada todavía');
const leadsN = await admin.from('leads').select('*', { count: 'exact', head: true });
const ordersN = await admin.from('orders').select('*', { count: 'exact', head: true });
if ((leadsN.count ?? 0) + (ordersN.count ?? 0) > 0) warn(`la base ya tiene ${leadsN.count} lead(s) y ${ordersN.count} pedido(s): ¿son de prueba?`); else ok('sin leads ni pedidos de prueba');

console.log(`\n${fails ? `✗ ${fails} problema(s)` : '✓ Lista para el primer despliegue'}${warns ? ` · ${warns} aviso(s) para resolver desde el panel` : ''}\n`);
process.exit(fails ? 1 : 0);
