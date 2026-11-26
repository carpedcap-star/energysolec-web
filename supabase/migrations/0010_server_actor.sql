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
