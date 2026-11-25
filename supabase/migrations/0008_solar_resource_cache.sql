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
