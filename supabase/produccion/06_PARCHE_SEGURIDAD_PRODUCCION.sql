-- =====================================================================================================
-- 06_PARCHE_SEGURIDAD_PRODUCCION.sql — Energy Solutions Ecuador · energysolec-web
-- Para el proyecto que ya se instaló con 01 (migraciones 0001–0010). Aplica: 0011_function_privileges.sql.
-- ARCHIVO GENERADO por scripts/generar-sql-produccion.mjs desde supabase/migrations/: no lo edites a mano.
--
-- · Una sola transacción: si algo falla, no cambia nada.
-- · Idempotente: solo REVOKE, GRANT y ALTER FUNCTION … SET; ejecutarlo de nuevo no duplica ni rompe nada.
-- · No toca tablas, datos, usuarios, políticas RLS ni funciones de Supabase (rls_auto_enable queda igual).
-- · Registra la migración en supabase_migrations.schema_migrations, como `supabase db push`.
-- · Al final muestra los permisos de cada función para que veas el resultado.
-- =====================================================================================================

begin;

do $guard$
declare n int;
begin
  if to_regclass('public.profiles') is null or to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'La base no tiene el esquema de la plataforma: ejecuta primero 01_MIGRACIONES_PRODUCCION.sql (que ya incluye este parche).';
  end if;
  select count(*) into n from supabase_migrations.schema_migrations where version in ('0001', '0002', '0003', '0004', '0005', '0006', '0007', '0008', '0009', '0010');
  if n < 10 then
    raise exception 'Faltan migraciones anteriores (% de 10 registradas): este parche es para una base instalada con 01.', n;
  end if;
end
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 0011_function_privileges.sql
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- =====================================================================================================
-- 0011: permisos mínimos de ejecución en las funciones de public y search_path endurecido.
--
-- Encontrado con el diagnóstico de producción: Postgres concede EXECUTE a PUBLIC en toda función nueva y
-- Supabase además a anon y authenticated, así que dos funciones SECURITY DEFINER pensadas solo para el servidor
-- se podían llamar desde la API pública (POST /rest/v1/rpc/...):
--   · hit_rate_limit(): cualquiera podía crear o inflar contadores de rate_limits;
--   · next_advisor(): revelaba el id de un asesor.
-- El servidor las llama con la clave de servicio (src/lib/data/store.ts), así que quedan solo para service_role.
--
-- Funciones de disparador: Postgres NO comprueba EXECUTE al disparar (verificado: auditoría, historial y etapas
-- siguen registrando con el actor correcto), así que se retira EXECUTE a todos los roles de la API. Nadie las
-- puede invocar directamente de todos modos; así no aparecen como ejecutables en ninguna revisión.
--
-- current_role_is() NO se toca: las políticas RLS la evalúan con el rol de quien consulta (anon, authenticated).
--
-- search_path de las SECURITY DEFINER: «public, pg_temp». Sin pg_temp explícito, Postgres busca primero en el
-- esquema temporal de la sesión, y una tabla temporal podría suplantar a profiles o rate_limits. Solo cambia la
-- configuración de la función, no su cuerpo.
--
-- Todo es idempotente: se puede ejecutar de nuevo sin efectos.
-- =====================================================================================================

-- RPC exclusivas del servidor
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
revoke execute on function public.next_advisor() from public, anon, authenticated;
grant execute on function public.next_advisor() to service_role;

-- Funciones de disparador: no se invocan por la API
revoke execute on function
  public.audit_trigger(),
  public.guard_payment_verification(),
  public.guard_trade_account(),
  public.log_lead_stage(),
  public.log_order_status(),
  public.touch_updated_at()
from public, anon, authenticated, service_role;

-- search_path endurecido en todas las SECURITY DEFINER de la aplicación
alter function public.current_role_is(app_role[]) set search_path = public, pg_temp;
alter function public.actor_role_is(app_role[]) set search_path = public, pg_temp;
alter function public.app_actor() set search_path = public, pg_temp;
alter function public.audit_trigger() set search_path = public, pg_temp;
alter function public.guard_payment_verification() set search_path = public, pg_temp;
alter function public.log_lead_stage() set search_path = public, pg_temp;
alter function public.log_order_status() set search_path = public, pg_temp;
alter function public.hit_rate_limit(text, integer, integer) set search_path = public, pg_temp;
alter function public.next_advisor() set search_path = public, pg_temp;
alter function public.claim_outbound(integer, integer) set search_path = public, pg_temp;
alter function public.prune_rate_limits(integer) set search_path = public, pg_temp;

insert into supabase_migrations.schema_migrations (version, name) values
  ('0011', 'function_privileges')
on conflict (version) do nothing;

commit;

-- Resultado: permisos y search_path de cada función de la aplicación.
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as funcion,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as seguridad,
  coalesce(array_to_string(p.proconfig, ', '), '') as configuracion,
  concat_ws(', ',
    case when exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then 'PUBLIC' end,
    case when has_function_privilege('anon', p.oid, 'execute') then 'anon' end,
    case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated' end,
    case when has_function_privilege('service_role', p.oid, 'execute') then 'service_role' end) as pueden_ejecutar
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f', 'p')
        and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
order by 1;
