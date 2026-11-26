-- =====================================================================================================
-- 01_MIGRACIONES_PRODUCCION.sql — Energy Solutions Ecuador · energysolec-web
-- Migraciones 0001 a 0010 consolidadas en su orden, para el SQL Editor de Supabase.
-- ARCHIVO GENERADO por scripts/generar-sql-produccion.mjs desde supabase/migrations/: no lo edites a mano.
--
-- · Se ejecuta UNA sola vez, sobre un proyecto recién creado. Si la base ya tiene el esquema, se detiene sin
--   cambiar nada.
-- · Todo va en una sola transacción: si algo falla, no queda nada a medias.
-- · Al final registra las migraciones en supabase_migrations.schema_migrations, igual que `supabase db push`,
--   para que la CLI sepa más adelante que ya están aplicadas y solo envíe las nuevas (0011 en adelante).
-- · No contiene claves, contraseñas, usuarios ni datos: solo estructura, seguridad (RLS) y buckets.
-- =====================================================================================================

begin;

do $guard$
begin
  if to_regclass('public.profiles') is not null then
    raise exception 'La base ya tiene el esquema de la plataforma (existe public.profiles): este archivo no se vuelve a ejecutar.';
  end if;
  -- IF anidado (no AND): PL/pgSQL analiza la consulta interior solo si la tabla existe.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if exists (select 1 from supabase_migrations.schema_migrations) then
      raise exception 'El proyecto ya tiene migraciones registradas: aplica las nuevas con la CLI, no con este archivo.';
    end if;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0001_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- =====================================================================
-- Energy Solutions Ecuador — esquema principal
-- PostgreSQL / Supabase. Moneda USD, idioma es (columnas *_en preparadas).
-- Principio de seguridad: el público (anon) SOLO lee contenido publicado.
-- Todas las escrituras públicas (leads, estudios, pedidos) pasan por
-- rutas de servidor que validan, limitan tasa y usan la service role.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- Roles y perfiles ----------
create type app_role as enum ('superadmin','gerencia','marketing','ventas','ingenieria','compras');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email citext not null unique,
  phone text,
  role app_role not null default 'ventas',
  is_advisor boolean not null default false,       -- puede recibir leads
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.current_role_is(roles app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.active and p.role = any(roles));
$$;

-- ---------- Auditoría ----------
create table audit_log (
  id bigint generated always as identity primary key,
  actor uuid references profiles(id),
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(actor, table_name, record_id, action, before, after)
  values (auth.uid(), tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Configuración y contenido administrable ----------
-- Claves: brand (colores, logo, tipografías), contact (whatsapp, email, dirección),
-- integrations (ga4, gtm, meta_pixel), email, seo_defaults
create table site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);

create table content_blocks (
  id uuid primary key default gen_random_uuid(),
  page text not null,               -- 'home', 'residencial', 'nosotros'...
  slot text not null,               -- 'hero', 'cta', ...
  data jsonb not null,              -- textos, imágenes, botones
  data_en jsonb,
  is_placeholder boolean not null default true,  -- contenido provisional visible como tal en admin
  published boolean not null default false,
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  unique (page, slot)
);

create table media (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'public-media',
  path text not null,
  kind text not null check (kind in ('image','video','document')),
  alt text,
  credits text,
  created_at timestamptz not null default now()
);

-- Indicadores del contador de inicio. Nunca se muestran si verified=false.
create table company_stats (
  id uuid primary key default gen_random_uuid(),
  label text not null,              -- 'MWp instalados'
  value numeric not null,
  unit text,
  source_note text not null,        -- de dónde sale el dato (obligatorio)
  verified boolean not null default false,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

create table seo_meta (
  path text primary key,
  title text, description text, og_image uuid references media(id),
  noindex boolean not null default false
);

-- ---------- Marcas, servicios ----------
create table brands (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  logo uuid references media(id),
  description text,
  relationship text,                -- 'Distribuidor autorizado', etc.
  relationship_doc uuid references media(id),   -- respaldo documental
  relationship_verified boolean not null default false,  -- sin respaldo no se publica la relación
  relationship_valid_until date,
  published boolean not null default false,
  sort int not null default 0
);

create table brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null check (kind in ('datasheet','certificate','warranty','catalog','video')),
  title text not null,
  media_id uuid references media(id),
  url text
);

create table services (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  summary text,
  body jsonb,                       -- descripción, beneficios, alcance
  segments text[] not null default '{}',
  cover uuid references media(id),
  published boolean not null default false,
  sort int not null default 0
);

-- ---------- Proyectos ----------
create type segment as enum ('residencial','comercial','industrial');
create type project_status as enum ('en_desarrollo','en_construccion','operativo','finalizado');

create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  client_name text,
  client_name_authorized boolean not null default false,
  segment segment not null,
  industry text,
  province text,
  city text,
  lat numeric(9,6), lng numeric(9,6),
  location_authorized boolean not null default false,   -- solo así aparece en el mapa
  capacity_kwp numeric,
  inverter_kw numeric,
  panel_count int,
  installation_type text,           -- cubierta, ground mount, flotante, carport
  technology text[],
  annual_generation_kwh numeric,
  generation_is_measured boolean not null default false,
  annual_savings_usd numeric,
  financials_authorized boolean not null default false, -- ahorro económico solo con autorización
  co2_avoided_t numeric,
  executed_on date,
  status project_status not null default 'finalizado',
  description text,
  testimonial text,
  testimonial_author text,
  testimonial_verified boolean not null default false,
  published boolean not null default false,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_media (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  media_id uuid not null references media(id),
  role text not null default 'gallery' check (role in ('cover','gallery','before','after','video','drone')),
  sort int not null default 0
);

-- ---------- Catálogo ----------
create table product_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  parent_id uuid references product_categories(id),
  sort int not null default 0
);

create type price_tier as enum ('final','instalador','distribuidor');

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  slug text unique not null,
  name text not null,
  brand_id uuid references brands(id),
  model text,
  category_id uuid references product_categories(id),
  summary text,
  specs jsonb not null default '{}',        -- {"potencia_w":550,"eficiencia_pct":21.3,...}
  warranty text,
  certifications text[] not null default '{}',
  datasheet uuid references media(id),
  images uuid[] not null default '{}',
  vat_rate numeric(5,4) not null default 0.15,  -- IVA Ecuador vigente; editable
  stock int not null default 0,
  availability text not null default 'consultar' check (availability in ('disponible','bajo_pedido','agotado','consultar')),
  installable boolean not null default false,
  is_placeholder boolean not null default true,   -- productos de ejemplo NUNCA publicados
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint no_placeholder_published check (not (is_placeholder and published))
);

create table product_prices (
  product_id uuid references products(id) on delete cascade,
  tier price_tier not null,
  price numeric(12,2) not null check (price >= 0),
  promo_price numeric(12,2) check (promo_price >= 0),
  promo_until timestamptz,
  primary key (product_id, tier)
);

create table product_relations (
  product_id uuid references products(id) on delete cascade,
  related_id uuid references products(id) on delete cascade,
  kind text not null check (kind in ('related','compatible','accessory')),
  primary key (product_id, related_id, kind)
);

-- Clientes con precios diferenciados (instaladores/distribuidores aprobados)
create table trade_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  company text not null,
  ruc text,
  tier price_tier not null check (tier <> 'final'),
  approved boolean not null default false,
  approved_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- CRM ----------
create type lead_stage as enum ('nuevo','contactado','calificado','visita_tecnica','cotizacion_enviada','negociacion','ganado','perdido');
create type lead_source as enum ('calculadora','tienda','contacto','cotizacion','catalogo','financiamiento','capacitacion','campana','servicio');

create table leads (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email citext not null,
  phone text,
  company text,
  segment segment,
  province text, city text,
  monthly_kwh numeric,
  monthly_bill_usd numeric,
  recommended_kwp numeric,
  estimated_investment_usd numeric,
  source lead_source not null,
  utm jsonb not null default '{}',        -- utm_source, utm_medium, utm_campaign, gclid, fbclid
  stage lead_stage not null default 'nuevo',
  advisor_id uuid references profiles(id),
  next_activity_at timestamptz,
  next_activity_note text,
  notes text,
  lost_reason text,
  first_contact_at timestamptz,           -- para tiempo de respuesta comercial
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on leads (stage);
create index on leads (advisor_id);
create index on leads (created_at desc);
create index on leads (email);

create table lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  actor uuid references profiles(id),
  kind text not null check (kind in ('nota','llamada','whatsapp','correo','visita','cotizacion','cambio_etapa','asignacion','sistema')),
  body text,
  meta jsonb,
  at timestamptz not null default now()
);

-- Consentimientos LOPDP: separados y con evidencia
create table consents (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  lead_id uuid references leads(id) on delete set null,
  purpose text not null check (purpose in ('privacidad_servicio','comercial_marketing','cookies_analitica','cookies_publicidad')),
  granted boolean not null,
  policy_version text not null,
  ip_hash text,                     -- hash, no IP en claro
  user_agent text,
  at timestamptz not null default now()
);
create index on consents (email, purpose, at desc);

-- ---------- Calculadora ----------
create table tariffs (
  id uuid primary key default gen_random_uuid(),
  code text not null,                       -- 'RES-BT', 'COM-BT-SD', 'IND-MT-CD'...
  name text not null,
  distributor text,                         -- CNEL EP Guayas-Los Ríos, EEQ, Centrosur... null = todas
  segment segment not null,
  voltage_level text not null check (voltage_level in ('BT','MT','AT')),
  has_demand_charge boolean not null default false,
  -- Bloques de energía: [{"from_kwh":0,"to_kwh":50,"usd_per_kwh":0.091}, ...]
  energy_blocks jsonb not null,
  demand_usd_per_kw numeric,               -- cargo por demanda facturable
  commercialization_usd numeric not null default 0,  -- cargo fijo mensual
  other_charges_pct numeric not null default 0,      -- alumbrado, bomberos, etc. como % aproximado
  source_note text not null,               -- pliego tarifario ARCONEL, resolución y fecha
  valid_from date not null,
  is_placeholder boolean not null default true,
  active boolean not null default true
);

-- Parámetros técnicos y financieros versionados (los cálculos guardan la versión usada)
create table calc_params (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  technical jsonb not null,
  financial jsonb not null,
  pricing jsonb not null,               -- precio por kWp por tramo, BESS por kWh
  notes text,
  is_placeholder boolean not null default true,
  active boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create unique index one_active_params on calc_params (active) where active;

-- Caché de recurso solar por celda (~0.1°) para no consultar PVGIS en cada cálculo
create table solar_resource_cache (
  cell text primary key,                -- 'lat:-2.1|lng:-79.9|tilt:10|az:0'
  source text not null,                 -- 'PVGIS-SARAH3', 'NASA-POWER'
  monthly_kwh_per_kwp numeric[] not null,  -- 12 valores, ya con pérdidas de temperatura/espectro, SIN pérdidas de sistema
  monthly_poa_kwh_m2 numeric[],
  fetched_at timestamptz not null default now()
);

create table solar_studies (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,            -- ESE-2026-000123
  lead_id uuid references leads(id) on delete set null,
  mode text not null check (mode in ('rapida','profesional')),
  inputs jsonb not null,
  results jsonb not null,
  params_version int not null,
  tariff_id uuid references tariffs(id),
  solar_source text not null,
  pdf_path text,
  unlocked boolean not null default false,
  visit_requested boolean not null default false,
  created_at timestamptz not null default now()
);

create table bill_uploads (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references solar_studies(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  storage_path text not null,           -- bucket privado 'bills'
  extracted jsonb,
  confirmed_by_user boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Pedidos ----------
create type order_status as enum ('nuevo','pendiente_contacto','contactado','cotizado','confirmado','pagado','en_preparacion','despachado','entregado','cancelado');

create sequence order_number_seq start 1000;

create table orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null default ('ESE-P-' || to_char(now(),'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0')),
  lead_id uuid references leads(id),
  customer_name text not null,
  email citext not null,
  phone text not null,
  city text not null,
  address text not null,
  customer_type text not null check (customer_type in ('final','instalador','distribuidor','empresa')),
  notes text,
  needs_installation boolean not null default false,
  price_tier price_tier not null default 'final',
  subtotal numeric(12,2) not null,
  tax numeric(12,2) not null,
  total numeric(12,2) not null,
  status order_status not null default 'nuevo',
  payment_reference text,
  payment_verified_by uuid references profiles(id),
  payment_verified_at timestamptz,
  whatsapp_message text,
  whatsapp_channel text check (whatsapp_channel in ('cloud_api','wa_link')),
  advisor_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- No se puede marcar pagado sin confirmación verificable
  constraint paid_requires_verification check (
    status not in ('pagado','en_preparacion','despachado','entregado')
    or (payment_reference is not null and payment_verified_by is not null and payment_verified_at is not null)
  )
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  sku text not null,
  name text not null,
  qty int not null check (qty > 0),
  unit_price numeric(12,2) not null,
  vat_rate numeric(5,4) not null,
  line_subtotal numeric(12,2) not null
);

create table order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor uuid references profiles(id),
  note text,
  at timestamptz not null default now()
);

-- ---------- Blog ----------
create table blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  excerpt text,
  body_md text not null,
  category text not null,
  cover uuid references media(id),
  author_id uuid references profiles(id),
  published_at timestamptz,
  published boolean not null default false,
  seo_title text, seo_description text
);

-- ---------- Mensajería saliente (correo / WhatsApp) con cola y reintentos ----------
create table outbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email','whatsapp')),
  to_address text not null,
  template text not null,
  payload jsonb not null,
  is_marketing boolean not null default false,
  status text not null default 'pendiente' check (status in ('pendiente','enviado','error','bloqueado_sin_consentimiento')),
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Eventos de analítica de primera parte para el dashboard gerencial
create table events (
  id bigint generated always as identity primary key,
  name text not null,           -- page_view, calc_started, calc_completed, lead_created, product_view, order_created
  session_id text,
  path text,
  props jsonb,
  at timestamptz not null default now()
);
create index on events (name, at desc);

-- Rate limiting simple para rutas públicas
create table rate_limits (
  bucket text primary key,
  count int not null,
  window_start timestamptz not null
);

create or replace function public.hit_rate_limit(p_bucket text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare r rate_limits;
begin
  select * into r from rate_limits where bucket = p_bucket for update;
  if not found or r.window_start < now() - make_interval(secs => p_window_seconds) then
    insert into rate_limits(bucket, count, window_start) values (p_bucket, 1, now())
    on conflict (bucket) do update set count = 1, window_start = now();
    return true;
  end if;
  if r.count >= p_max then return false; end if;
  update rate_limits set count = count + 1 where bucket = p_bucket;
  return true;
end $$;

-- ---------- Triggers ----------
create trigger t_projects_upd before update on projects for each row execute function touch_updated_at();
create trigger t_products_upd before update on products for each row execute function touch_updated_at();
create trigger t_leads_upd before update on leads for each row execute function touch_updated_at();
create trigger t_orders_upd before update on orders for each row execute function touch_updated_at();

do $$ declare t text; begin
  foreach t in array array['site_settings','content_blocks','company_stats','brands','services','projects',
    'products','product_prices','tariffs','calc_params','orders','leads','profiles','blog_posts','trade_accounts']
  loop execute format('create trigger audit_%1$s after insert or update or delete on %1$s for each row execute function audit_trigger()', t);
  end loop; end $$;

create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_history(order_id, from_status, to_status, actor)
    values (new.id, case when tg_op='UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger t_order_status after insert or update of status on orders for each row execute function log_order_status();

create or replace function public.log_lead_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into lead_activities(lead_id, actor, kind, body, meta)
    values (new.id, auth.uid(), 'cambio_etapa', old.stage || ' → ' || new.stage, jsonb_build_object('from', old.stage, 'to', new.stage));
    if old.stage = 'nuevo' and new.first_contact_at is null then new.first_contact_at = now(); end if;
  end if;
  if new.advisor_id is distinct from old.advisor_id then
    insert into lead_activities(lead_id, actor, kind, meta) values (new.id, auth.uid(), 'asignacion', jsonb_build_object('advisor', new.advisor_id));
  end if;
  return new;
end $$;
create trigger t_lead_stage before update on leads for each row execute function log_lead_stage();

-- Asignación round-robin de asesores activos
create or replace function public.next_advisor() returns uuid
language sql security definer set search_path = public as $$
  select p.id from profiles p
  left join leads l on l.advisor_id = p.id and l.stage not in ('ganado','perdido')
  where p.active and p.is_advisor
  group by p.id order by count(l.id) asc, random() limit 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0002_rls.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- =====================================================================
-- Row Level Security. Matriz de permisos por rol:
--   superadmin : todo
--   gerencia   : lectura total, CRM, pedidos, parámetros
--   marketing  : contenido, blog, SEO, marcas, servicios, proyectos, lectura de leads
--   ventas     : leads asignados (o todos si gerencia), pedidos, lectura de catálogo
--   ingenieria : proyectos, tarifas, parámetros técnicos, estudios
--   compras    : productos, precios, inventario, pedidos (preparación/despacho)
-- =====================================================================

do $$ declare t text; begin
  foreach t in array array['profiles','audit_log','site_settings','content_blocks','media','company_stats','seo_meta',
    'brands','brand_assets','services','projects','project_media','product_categories','products','product_prices',
    'product_relations','trade_accounts','leads','lead_activities','consents','tariffs','calc_params',
    'solar_resource_cache','solar_studies','bill_uploads','orders','order_items','order_status_history',
    'blog_posts','outbound_messages','events','rate_limits']
  loop execute format('alter table %I enable row level security', t); end loop; end $$;

-- Lectura pública de contenido publicado
create policy pub_read on content_blocks for select using (published);
create policy pub_read on company_stats for select using (verified);
create policy pub_read on site_settings for select using (key in ('brand','contact','integrations_public','seo_defaults'));
create policy pub_read on seo_meta for select using (true);
create policy pub_read on media for select using (bucket = 'public-media');
create policy pub_read on brands for select using (published);
create policy pub_read on brand_assets for select using (exists (select 1 from brands b where b.id = brand_id and b.published));
create policy pub_read on services for select using (published);
create policy pub_read on projects for select using (published);
create policy pub_read on project_media for select using (exists (select 1 from projects p where p.id = project_id and p.published));
create policy pub_read on product_categories for select using (true);
create policy pub_read on products for select using (published);
create policy pub_read on product_relations for select using (true);
create policy pub_read_final on product_prices for select using (
  tier = 'final' and exists (select 1 from products p where p.id = product_id and p.published));
create policy trade_read on product_prices for select using (
  exists (select 1 from trade_accounts ta where ta.user_id = auth.uid() and ta.approved and ta.tier = product_prices.tier));
create policy pub_read on blog_posts for select using (published and published_at <= now());
create policy own_trade on trade_accounts for select using (user_id = auth.uid());

-- Perfiles
create policy self_read on profiles for select using (id = auth.uid() or current_role_is(array['superadmin','gerencia']::app_role[]));
create policy staff_read_advisors on profiles for select using (current_role_is(array['ventas','marketing','ingenieria','compras']::app_role[]) and is_advisor);
create policy admin_write on profiles for all using (current_role_is(array['superadmin']::app_role[])) with check (current_role_is(array['superadmin']::app_role[]));

-- Helper para políticas de staff
create or replace function public.staff_policy(p_table text, p_roles app_role[]) returns void language plpgsql as $$
begin
  execute format('create policy staff_all on %I for all using (current_role_is(%L::app_role[])) with check (current_role_is(%L::app_role[]))',
    p_table, p_roles, p_roles);
end $$;

select null from staff_policy('site_settings',      array['superadmin','marketing']::app_role[]);
select null from staff_policy('content_blocks',     array['superadmin','marketing']::app_role[]);
select null from staff_policy('media',              array['superadmin','marketing','ingenieria','compras']::app_role[]);
select null from staff_policy('company_stats',      array['superadmin','gerencia']::app_role[]);
select null from staff_policy('seo_meta',           array['superadmin','marketing']::app_role[]);
select null from staff_policy('brands',             array['superadmin','marketing','compras']::app_role[]);
select null from staff_policy('brand_assets',       array['superadmin','marketing','compras']::app_role[]);
select null from staff_policy('services',           array['superadmin','marketing']::app_role[]);
select null from staff_policy('projects',           array['superadmin','marketing','ingenieria']::app_role[]);
select null from staff_policy('project_media',      array['superadmin','marketing','ingenieria']::app_role[]);
select null from staff_policy('product_categories', array['superadmin','compras']::app_role[]);
select null from staff_policy('products',           array['superadmin','compras']::app_role[]);
select null from staff_policy('product_prices',     array['superadmin','compras','gerencia']::app_role[]);
select null from staff_policy('product_relations',  array['superadmin','compras']::app_role[]);
select null from staff_policy('trade_accounts',     array['superadmin','gerencia','ventas']::app_role[]);
select null from staff_policy('tariffs',            array['superadmin','ingenieria','gerencia']::app_role[]);
select null from staff_policy('calc_params',        array['superadmin','ingenieria','gerencia']::app_role[]);
select null from staff_policy('solar_studies',      array['superadmin','gerencia','ingenieria','ventas']::app_role[]);
select null from staff_policy('bill_uploads',       array['superadmin','gerencia','ingenieria','ventas']::app_role[]);
select null from staff_policy('orders',             array['superadmin','gerencia','ventas','compras']::app_role[]);
select null from staff_policy('order_items',        array['superadmin','gerencia','ventas','compras']::app_role[]);
select null from staff_policy('blog_posts',         array['superadmin','marketing']::app_role[]);
select null from staff_policy('outbound_messages',  array['superadmin','gerencia']::app_role[]);

-- Lecturas staff adicionales
create policy staff_read on order_status_history for select using (current_role_is(array['superadmin','gerencia','ventas','compras']::app_role[]));
create policy staff_read on consents for select using (current_role_is(array['superadmin','gerencia']::app_role[]));
create policy staff_read on audit_log for select using (current_role_is(array['superadmin','gerencia']::app_role[]));
create policy staff_read on events for select using (current_role_is(array['superadmin','gerencia','marketing']::app_role[]));
create policy staff_read on calc_params for select using (current_role_is(array['ventas','marketing']::app_role[]));
create policy staff_read on tariffs for select using (current_role_is(array['ventas','marketing']::app_role[]));

-- CRM: gerencia/superadmin todo; ventas sus leads y los no asignados; marketing lectura
create policy leads_mgmt on leads for all using (current_role_is(array['superadmin','gerencia']::app_role[])) with check (current_role_is(array['superadmin','gerencia']::app_role[]));
create policy leads_sales on leads for select using (current_role_is(array['ventas']::app_role[]) and (advisor_id = auth.uid() or advisor_id is null));
create policy leads_sales_upd on leads for update using (current_role_is(array['ventas']::app_role[]) and advisor_id = auth.uid()) with check (advisor_id = auth.uid());
create policy leads_mkt on leads for select using (current_role_is(array['marketing','ingenieria']::app_role[]));
create policy act_read on lead_activities for select using (exists (select 1 from leads l where l.id = lead_id));
create policy act_write on lead_activities for insert with check (actor = auth.uid() and exists (select 1 from leads l where l.id = lead_id));

-- Ventas no puede verificar pagos (solo gerencia/superadmin)
create or replace function public.guard_payment_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_verified_by is distinct from old.payment_verified_by
     and not current_role_is(array['superadmin','gerencia']::app_role[]) then
    raise exception 'Solo Gerencia puede verificar pagos';
  end if;
  return new;
end $$;
create trigger t_guard_payment before update on orders for each row execute function guard_payment_verification();

-- Storage: buckets
insert into storage.buckets (id, name, public) values ('public-media','public-media', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('bills','bills', false) on conflict do nothing;      -- planillas de clientes
insert into storage.buckets (id, name, public) values ('reports','reports', false) on conflict do nothing;  -- PDFs de estudios

create policy media_staff on storage.objects for all
  using (bucket_id = 'public-media' and current_role_is(array['superadmin','marketing','ingenieria','compras']::app_role[]))
  with check (bucket_id = 'public-media' and current_role_is(array['superadmin','marketing','ingenieria','compras']::app_role[]));
create policy private_staff_read on storage.objects for select
  using (bucket_id in ('bills','reports') and current_role_is(array['superadmin','gerencia','ingenieria','ventas']::app_role[]));

-- La función auxiliar ya no se necesita
drop function public.staff_policy(text, app_role[]);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0003_project_privacy.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- =====================================================================
-- 0003 · Privacidad de proyectos (regla de negocio 3)
--
-- Problema: la política pub_read de `projects` (0002) dejaba leer TODAS las
-- columnas de un proyecto publicado con la clave anon, que es pública. Así se
-- podían consultar el cliente, las coordenadas, el ahorro y el testimonio aunque
-- sus banderas de autorización estuvieran en false.
--
-- Solución:
--  1. anon/authenticated ya no pueden leer las columnas sensibles de la tabla.
--  2. La lectura pública se hace por la vista `projects_public`, que enmascara
--     cada dato según su bandera.
--  3. Restricciones CHECK: una bandera de autorización exige el dato que autoriza.
--
-- La aplicación lee con service_role en el servidor y no se ve afectada.
-- =====================================================================

-- 1) Privilegios por columna ------------------------------------------------
revoke select on table public.projects from anon, authenticated;
grant select (
  id, slug, title, client_name_authorized, segment, industry, province, city, location_authorized,
  capacity_kwp, inverter_kw, panel_count, installation_type, technology, annual_generation_kwh,
  generation_is_measured, financials_authorized, co2_avoided_t, executed_on, status, description,
  testimonial_verified, published, featured, created_at, updated_at
) on public.projects to anon, authenticated;
-- Sin SELECT: client_name, lat, lng, annual_savings_usd, testimonial, testimonial_author.

-- 2) Vista pública enmascarada ----------------------------------------------
create view public.projects_public with (security_barrier = true) as
select
  id, slug, title,
  case when client_name_authorized then client_name end            as client_name,
  segment, industry, province, city,
  case when location_authorized then lat end                        as lat,
  case when location_authorized then lng end                        as lng,
  location_authorized,
  capacity_kwp, inverter_kw, panel_count, installation_type, technology,
  annual_generation_kwh, generation_is_measured,
  case when financials_authorized then annual_savings_usd end       as annual_savings_usd,
  co2_avoided_t, executed_on, status, description,
  case when testimonial_verified then testimonial end               as testimonial,
  case when testimonial_verified then testimonial_author end        as testimonial_author,
  featured, updated_at
from public.projects
where published;
grant select on public.projects_public to anon, authenticated;

-- 3) Coherencia de banderas --------------------------------------------------
-- NOT VALID: no se revisan filas existentes (podrían bloquear el despliegue),
-- pero toda inserción o actualización nueva debe cumplirlas.
alter table public.projects
  add constraint client_authorized_needs_name
    check (not client_name_authorized or nullif(btrim(client_name), '') is not null) not valid,
  add constraint location_authorized_needs_coords
    check (not location_authorized or (lat is not null and lng is not null)) not valid,
  add constraint coords_in_ecuador   -- continente y Galápagos
    check ((lat is null and lng is null) or (lat between -5.1 and 1.7 and lng between -92.1 and -75.1)) not valid,
  add constraint testimonial_verified_needs_text
    check (not testimonial_verified or (nullif(btrim(testimonial), '') is not null and nullif(btrim(testimonial_author), '') is not null)) not valid,
  add constraint project_figures_non_negative
    check (coalesce(capacity_kwp, 0) >= 0 and coalesce(inverter_kw, 0) >= 0 and coalesce(panel_count, 0) >= 0
       and coalesce(annual_generation_kwh, 0) >= 0 and coalesce(annual_savings_usd, 0) >= 0 and coalesce(co2_avoided_t, 0) >= 0) not valid;

-- Una sola portada por proyecto.
create unique index project_media_one_cover on public.project_media (project_id) where role = 'cover';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0004_brand_backing.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- =====================================================================
-- 0004 · Marcas: respaldo documental privado y relación comercial solo con respaldo vigente
--
-- Problemas:
--  · pub_read de `brands` (0002) dejaba leer TODAS las columnas con la clave anon, incluida una
--    relación comercial («Distribuidor autorizado») sin verificar ni respaldo.
--  · El documento de respaldo (contrato, carta de autorización) solo podía guardarse en
--    `public-media`, que es público: cualquiera podía descargarlo.
--
-- Solución:
--  1. Bucket privado `private-docs` para respaldos documentales.
--  2. anon/authenticated ya no leen relationship, relationship_doc ni relationship_valid_until;
--     la vista `brands_public` muestra la relación solo si está verificada, tiene documento y no venció.
--  3. CHECK: una relación verificada exige texto y documento; un recurso de marca exige archivo o enlace.
--
-- La aplicación lee con service_role en el servidor y no se ve afectada.
-- =====================================================================

-- 1) Bucket privado ----------------------------------------------------------
insert into storage.buckets (id, name, public) values ('private-docs', 'private-docs', false) on conflict do nothing;
create policy private_docs_staff_read on storage.objects for select
  using (bucket_id = 'private-docs' and current_role_is(array['superadmin','gerencia','marketing','compras']::app_role[]));
create policy private_docs_staff_write on storage.objects for insert
  with check (bucket_id = 'private-docs' and current_role_is(array['superadmin','marketing','compras']::app_role[]));
-- Las filas de `media` de este bucket no son públicas: pub_read de media solo cubre 'public-media'.

-- 2) Privilegios por columna y vista pública ----------------------------------
revoke select on table public.brands from anon, authenticated;
grant select (id, slug, name, logo, description, relationship_verified, published, sort) on public.brands to anon, authenticated;

create view public.brands_public with (security_barrier = true) as
select
  id, slug, name, logo, description,
  case when relationship_verified and relationship_doc is not null
        and (relationship_valid_until is null or relationship_valid_until >= current_date)
       then relationship end as relationship,
  sort
from public.brands
where published;
grant select on public.brands_public to anon, authenticated;

-- 3) Coherencia ---------------------------------------------------------------
alter table public.brands
  add constraint relationship_verified_needs_backup
    check (not relationship_verified or (nullif(btrim(relationship), '') is not null and relationship_doc is not null)) not valid;

alter table public.brand_assets add column sort int not null default 0;
alter table public.brand_assets
  add constraint brand_asset_has_source check (media_id is not null or nullif(btrim(url), '') is not null) not valid,
  add constraint brand_asset_url_https check (url is null or url ~ '^https://') not valid;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0005_bill_uploads.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Carga de planillas eléctricas (Fase 2, punto 6).
-- El servidor sube el archivo al bucket privado 'bills' y registra la propuesta de la IA en bill_uploads.
-- El cliente nunca escribe directo: todas las escrituras pasan por /api/bill y /api/study con la clave de servicio.

-- Límites del bucket, en espejo con BILL_LIMITS (src/lib/services/bill.ts): 4 MB y solo PDF o imagen.
update storage.buckets
   set file_size_limit = 4194304,
       allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']
 where id = 'bills';

-- Una carga confirmada siempre está vinculada a su estudio.
alter table bill_uploads
  add constraint bill_uploads_confirmed_has_study check (not confirmed_by_user or study_id is not null);

create index if not exists bill_uploads_study_idx on bill_uploads(study_id);
create index if not exists bill_uploads_lead_idx on bill_uploads(lead_id);
-- Para depurar las cargas no confirmadas (minimización de datos, LOPDP).
create index if not exists bill_uploads_pending_idx on bill_uploads(created_at) where not confirmed_by_user;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0006_trade_accounts.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Cuentas comerciales: instaladores y distribuidores autorizados (Fase 2, punto 7).
-- Flujo: la empresa solicita en /profesionales → Gerencia aprueba en el panel → la persona de contacto activa su
-- acceso con un enlace de un solo uso → la tienda y los pedidos usan los precios de su nivel.
-- Toda escritura pasa por el servidor con la clave de servicio; estas reglas protegen además ante errores de código.

alter type lead_source add value if not exists 'cuenta_comercial';

alter table trade_accounts
  add column contact_name text not null default '',
  add column email citext,
  add column phone text,
  add column city text,
  add column notes text,
  add column status text not null default 'pendiente',
  add column review_note text,
  add column reviewed_at timestamptz,
  add column lead_id uuid references leads(id) on delete set null,
  add column updated_at timestamptz not null default now();

alter table trade_accounts
  add constraint trade_status_valid check (status in ('pendiente','aprobada','rechazada','suspendida')),
  -- `approved` es lo que lee la RLS de precios (0002): siempre en espejo con el estado.
  add constraint trade_approved_mirror check (approved = (status = 'aprobada')),
  -- Aprobada = revisada por una persona del panel y con usuario de acceso creado.
  add constraint trade_approved_complete check (status <> 'aprobada' or (approved_by is not null and user_id is not null and reviewed_at is not null)),
  add constraint trade_ruc_format check (ruc is null or ruc ~ '^[0-9]{13}$'),
  add constraint trade_email_required check (email is not null or status = 'rechazada');

-- Una sola solicitud viva por correo y por RUC (las rechazadas no cuentan: la empresa puede volver a solicitar).
create unique index trade_accounts_email_live on trade_accounts(email) where status <> 'rechazada';
create unique index trade_accounts_ruc_live on trade_accounts(ruc) where status <> 'rechazada';
create index trade_accounts_status_idx on trade_accounts(status, created_at desc);

-- Aprobar o suspender da o quita acceso a precios: solo superadministración o Gerencia (espejo de PERMS.trade_approve).
-- Un usuario del panel no puede ser a la vez cliente comercial (sesiones y permisos separados).
create or replace function guard_trade_account() returns trigger language plpgsql as $$
begin
  if new.user_id is not null and exists (select 1 from profiles p where p.id = new.user_id) then
    raise exception 'Un usuario del panel no puede tener una cuenta comercial';
  end if;
  if new.status in ('aprobada','suspendida') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    if new.approved_by is null or not exists (
      select 1 from profiles p where p.id = new.approved_by and p.active and p.role in ('superadmin','gerencia')
    ) then
      raise exception 'Solo Gerencia o superadministración pueden aprobar o suspender cuentas comerciales';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger t_guard_trade before insert or update on trade_accounts for each row execute function guard_trade_account();

-- Pedidos con precios de nivel solo desde una cuenta comercial.
alter table orders add column trade_account_id uuid references trade_accounts(id) on delete restrict;
alter table orders add constraint order_tier_requires_account check (price_tier = 'final' or trade_account_id is not null);
create index orders_trade_account_idx on orders(trade_account_id) where trade_account_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0007_followups.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Recordatorios de seguimiento, reintento de correos y depuración (Fase 2, punto 8).
-- Las tareas corren en /api/cron (Vercel Cron u otro programador con CRON_SECRET) y desde el panel (/admin/mensajes).

-- ---------- Cola de correos reintentable
alter table outbound_messages
  add column next_attempt_at timestamptz,
  add column last_attempt_at timestamptz;
-- Los mensajes pendientes de antes de esta migración no guardaban el cuerpo: no se pueden reintentar.
update outbound_messages set status = 'error', error = coalesce(error, '') || ' · sin cuerpo guardado (anterior a 0007)'
 where status = 'pendiente';
create index outbound_due_idx on outbound_messages(next_attempt_at) where status = 'pendiente';
create index outbound_created_idx on outbound_messages(created_at desc);

/**
 * Reserva hasta p_limit mensajes vencidos para enviarlos. FOR UPDATE SKIP LOCKED + un plazo de reserva evitan que
 * dos ejecuciones simultáneas envíen el mismo correo dos veces. Cuenta el intento al reservar.
 */
create or replace function claim_outbound(p_limit int, p_lease_seconds int default 300)
returns setof outbound_messages language plpgsql security definer set search_path = public as $$
begin
  return query
  update outbound_messages m
     set attempts = m.attempts + 1, last_attempt_at = now(), next_attempt_at = now() + make_interval(secs => p_lease_seconds)
   where m.id in (
     select id from outbound_messages
      where status = 'pendiente' and next_attempt_at is not null and next_attempt_at <= now()
      order by next_attempt_at
      limit p_limit
      for update skip locked)
  returning m.*;
end $$;
revoke all on function claim_outbound(int, int) from public, anon, authenticated;

-- ---------- Recordatorios de leads
alter table leads
  add column next_activity_reminded_for timestamptz,   -- fecha de actividad ya recordada (si cambia, se recuerda de nuevo)
  add column uncontacted_alerted_at timestamptz;      -- alerta única de lead nuevo sin primer contacto
create index leads_next_activity_idx on leads(next_activity_at) where next_activity_at is not null;

-- ---------- Registro de ejecuciones de tareas programadas
create table cron_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null check (trigger in ('cron','panel')),
  actor uuid references profiles(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  summary jsonb,   -- solo conteos, nunca datos personales
  error text
);
create index cron_runs_started_idx on cron_runs(started_at desc);
alter table cron_runs enable row level security;
create policy cron_runs_staff_read on cron_runs for select using (current_role_is(array['superadmin','gerencia']::app_role[]));

-- ---------- Límites de solicitudes: limpiar ventanas viejas
create or replace function prune_rate_limits(p_older_than_seconds int default 86400)
returns int language sql security definer set search_path = public as $$
  with d as (delete from rate_limits where window_start < now() - make_interval(secs => p_older_than_seconds) returning 1)
  select count(*)::int from d;
$$;
revoke all on function prune_rate_limits(int) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0008_solar_resource_cache.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Caché del recurso solar (Fase 2, punto 9).
-- Una fila por celda (0,05° e inclinación entera) y por fuente: PVGIS-NSRDB, PVGIS-ERA5 y NASA-POWER.
-- La escribe solo el servidor (clave de servicio) al calcular estudios; vigencia de 180 días en el código
-- (CACHE_TTL_DAYS); una fila vencida se usa como respaldo si la fuente no responde.

-- La tabla de 0001 tenía una sola fila por celda (sin distinguir fuente) y nunca se usó: se vacía.
delete from solar_resource_cache;
alter table solar_resource_cache drop constraint solar_resource_cache_pkey;
alter table solar_resource_cache
  add column lat numeric(7,4),
  add column lng numeric(8,4),
  add column tilt smallint,
  add column annual_kwh_per_kwp numeric(7,1),
  add column period text;
alter table solar_resource_cache
  add primary key (cell, source),
  add constraint solar_cache_source check (source in ('PVGIS-NSRDB','PVGIS-ERA5','NASA-POWER')),
  add constraint solar_cache_months check (array_length(monthly_kwh_per_kwp, 1) = 12),
  add constraint solar_cache_poa_months check (monthly_poa_kwh_m2 is null or array_length(monthly_poa_kwh_m2, 1) = 12);
create index solar_cache_fetched_idx on solar_resource_cache(fetched_at);

-- Lectura para el panel (Ingeniería, Gerencia, superadmin), en espejo con PERMS.params.
create policy solar_cache_staff_read on solar_resource_cache for select
  using (current_role_is(array['superadmin','gerencia','ingenieria']::app_role[]));

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0009_industrial_requests.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Cotización industrial con documentos (Fase 2).
-- Flujo: el visitante sube sus documentos (uno por solicitud HTTP, ≤ 4 MB) → envía la solicitud → se crea el lead
-- y la solicitud industrial → Ventas da seguimiento → Ingeniería registra su evaluación.
-- Todas las escrituras pasan por el servidor con la clave de servicio.

alter type lead_source add value if not exists 'cotizacion_industrial';

-- Bucket privado para documentos técnicos de clientes (planillas, curvas de carga, planos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-docs', 'project-docs', false, 4194304, array[
  'application/pdf','image/jpeg','image/png','image/webp','text/csv','application/acad',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
create policy project_docs_staff_read on storage.objects for select
  using (bucket_id = 'project-docs' and current_role_is(array['superadmin','gerencia','ingenieria','ventas']::app_role[]));

create table industrial_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  solutions text[] not null check (cardinality(solutions) between 1 and 9),  -- array_length('{}') es null: no sirve aquí
  company text not null,
  ruc text check (ruc is null or ruc ~ '^[0-9]{13}$'),
  sector text not null,
  details jsonb not null default '{}',     -- consumo, factura, demanda, tensión, horario, superficie, sitio, mensaje
  eval_status text not null default 'pendiente' check (eval_status in ('pendiente','en_evaluacion','evaluada','descartada')),
  eval_kwp numeric(10,1) check (eval_kwp is null or eval_kwp > 0),
  eval_notes text,
  evaluated_by uuid references profiles(id),
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Una evaluación cerrada siempre tiene responsable, fecha y criterio.
  constraint industrial_eval_closed check (eval_status not in ('evaluada','descartada') or (evaluated_by is not null and evaluated_at is not null and length(coalesce(eval_notes, '')) >= 10))
);
create index industrial_requests_lead_idx on industrial_requests(lead_id);
create index industrial_requests_status_idx on industrial_requests(eval_status, created_at desc);

create table industrial_documents (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references industrial_requests(id) on delete cascade,
  kind text not null default 'otro' check (kind in ('planilla','curva_carga','plano','otro')),
  filename text not null,
  mime text not null,
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 4194304),
  storage_path text not null unique,       -- bucket privado 'project-docs'
  created_at timestamptz not null default now()
);
create index industrial_documents_request_idx on industrial_documents(request_id);
create index industrial_documents_orphan_idx on industrial_documents(created_at) where request_id is null;

-- RLS: solo personal (Ventas da seguimiento; Ingeniería evalúa). Nada público.
alter table industrial_requests enable row level security;
alter table industrial_documents enable row level security;
create policy industrial_requests_staff on industrial_requests for select
  using (current_role_is(array['superadmin','gerencia','ingenieria','ventas']::app_role[]));
create policy industrial_requests_eval on industrial_requests for update
  using (current_role_is(array['superadmin','gerencia','ingenieria']::app_role[]))
  with check (current_role_is(array['superadmin','gerencia','ingenieria']::app_role[]));
create policy industrial_documents_staff on industrial_documents for select
  using (current_role_is(array['superadmin','gerencia','ingenieria','ventas']::app_role[]));

create trigger audit_industrial_requests after insert or update or delete on industrial_requests for each row execute function audit_trigger();

-- Corrección de 0008: array_length('{}', 1) es null y un CHECK con null no falla, así que se aceptaba un arreglo
-- vacío. cardinality('{}') = 0 sí falla.
alter table solar_resource_cache
  drop constraint solar_cache_months,
  drop constraint solar_cache_poa_months,
  add constraint solar_cache_months check (cardinality(monthly_kwh_per_kwp) = 12),
  add constraint solar_cache_poa_months check (monthly_poa_kwh_m2 is null or cardinality(monthly_poa_kwh_m2) = 12);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0010_server_actor.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Actor de las escrituras del servidor.
-- El servidor escribe con la clave de servicio, que no tiene usuario: auth.uid() es null. Por eso, hasta aquí:
--   · marcar un pedido como pagado fallaba siempre («Solo Gerencia puede verificar pagos»), incluso para Gerencia;
--   · audit_log, order_status_history y lead_activities guardaban actor null.
-- Ahora el servidor envía el id del usuario del panel en la cabecera x-ese-actor. Solo se acepta si la petición
-- viene firmada con la clave de servicio (rol service_role): desde el navegador nadie puede suplantar a otro.

create or replace function public.app_actor() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  hdr text := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-ese-actor';
begin
  if auth.uid() is not null then return auth.uid(); end if;
  if coalesce(claims ->> 'role', '') = 'service_role'
     and hdr ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return hdr::uuid;
  end if;
  return null;
end $$;

/** Rol del actor (usuario autenticado o indicado por el servidor). Las políticas RLS siguen usando current_role_is. */
create or replace function public.actor_role_is(roles app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = public.app_actor() and p.active and p.role = any(roles));
$$;

-- Verificación de pagos: quien verifica debe ser el actor y tener rol de Gerencia o superadmin.
create or replace function public.guard_payment_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.payment_verified_by is distinct from old.payment_verified_by
     and not (public.actor_role_is(array['superadmin','gerencia']::app_role[]) and new.payment_verified_by = public.app_actor()) then
    raise exception 'Solo Gerencia puede verificar pagos';
  end if;
  return new;
end $$;

-- Auditoría con el autor real del cambio. Un id que no es de un perfil (p. ej. un cliente comercial) queda null.
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid := public.app_actor();
begin
  if a is not null and not exists (select 1 from profiles where id = a) then a := null; end if;
  insert into audit_log(actor, table_name, record_id, action, before, after)
  values (a, tg_table_name,
          coalesce((case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function public.log_order_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid := public.app_actor();
begin
  if a is not null and not exists (select 1 from profiles where id = a) then a := null; end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_history(order_id, from_status, to_status, actor)
    values (new.id, case when tg_op='UPDATE' then old.status end, new.status, a);
  end if;
  return new;
end $$;

create or replace function public.log_lead_stage() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid := public.app_actor();
begin
  if a is not null and not exists (select 1 from profiles where id = a) then a := null; end if;
  if new.stage is distinct from old.stage then
    insert into lead_activities(lead_id, actor, kind, body, meta)
    values (new.id, a, 'cambio_etapa', old.stage || ' → ' || new.stage, jsonb_build_object('from', old.stage, 'to', new.stage));
    if old.stage = 'nuevo' and new.first_contact_at is null then new.first_contact_at = now(); end if;
  end if;
  if new.advisor_id is distinct from old.advisor_id then
    insert into lead_activities(lead_id, actor, kind, meta) values (new.id, a, 'asignacion', jsonb_build_object('advisor', new.advisor_id));
  end if;
  return new;
end $$;

-- Solo los disparadores (security definer) las usan: nadie las llama por la API.
revoke all on function public.app_actor() from public, anon, authenticated;
revoke all on function public.actor_role_is(app_role[]) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Registro de migraciones (mismo formato que usa la CLI de Supabase)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('0001', 'schema'),
  ('0002', 'rls'),
  ('0003', 'project_privacy'),
  ('0004', 'brand_backing'),
  ('0005', 'bill_uploads'),
  ('0006', 'trade_accounts'),
  ('0007', 'followups'),
  ('0008', 'solar_resource_cache'),
  ('0009', 'industrial_requests'),
  ('0010', 'server_actor')
on conflict (version) do nothing;

commit;
