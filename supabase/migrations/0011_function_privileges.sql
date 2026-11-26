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
