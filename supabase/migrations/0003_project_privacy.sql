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
