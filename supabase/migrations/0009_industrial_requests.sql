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
