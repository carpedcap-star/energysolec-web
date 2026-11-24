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
