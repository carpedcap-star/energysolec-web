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
