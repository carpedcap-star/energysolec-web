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
