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
