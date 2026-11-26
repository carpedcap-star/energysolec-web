#!/usr/bin/env bash
# Prueba los archivos de supabase/produccion/ tal como se usan en el SQL Editor, sobre la pila LOCAL de Supabase:
#   1. Base migrada con la CLI → recalcula la huella y exige que los archivos versionados estén al día.
#   2. Instalación nueva como en Supabase Cloud: base limpia con rls_auto_enable()/ensure_rls (réplica exacta de
#      la nube) y archivos pegados con CR+LF (como desde Windows): 01, 02, usuario de Auth, 03, 04, 06 (dos veces), 04, 07.
#   3. Actualización desde el estado ACTUAL de producción: 01 hasta 0010 con CR+LF, 02, 03 → 04 debe fallar por las
#      funciones expuestas → 06 (dos veces) → 04 y 07 correctos.
#   4. Detección: altera funciones, permisos, políticas y el disparador de Supabase, y exige que 04 lo marque.
#   5. La CLI reconoce las migraciones registradas por los archivos (nada pendiente en `db push`).
# BORRA la base local. Requiere `supabase start` (pila local) y Docker. Uso: scripts/probar-sql-produccion.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SB=${SUPABASE_BIN:-supabase}
DB=supabase_db_energysolec-web
DIR=supabase/produccion
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
sqlc() { docker exec -i "$DB" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -c "$1"; }
psql_file() { sqlc "$(cat "$1")"; }
fail() { echo "✗ $*" >&2; exit 1; }
# Ejecuta un archivo que DEBE fallar y exige que su mensaje contenga el texto dado.
refuses() { local out; out=$(psql_file "$1" 2>&1) && fail "$1 debía detenerse"; grep -q "$2" <<<"$out" || fail "$1: mensaje inesperado: $out"; }
# Copia con CR+LF, como queda un archivo pegado desde el portapapeles de Windows.
crlf() { sed 's/$/\r/' "$1" > "$W/$(basename "$1").crlf"; echo "$W/$(basename "$1").crlf"; }
v04() { psql_file "$DIR/04_VERIFICACION_PRODUCCION.sql"; }
expect_ready() { local out; out=$(v04); grep -q "Lista para el primer despliegue" <<<"$out" || { grep -E '^ +[0-9]+ \|' <<<"$out" | grep '✗' >&2; fail "04 no dio la base por lista ($1)"; }; }
# 04 debe marcar ✗ en la fila cuyo texto contiene $2 (motivo: $1).
expect_flag() { local out; out=$(v04); grep -E '^ +[0-9]+ \|.*✗' <<<"$out" | grep -q -- "$2" || { grep -E '^ +[0-9]+ \|' <<<"$out" >&2; fail "04 no detectó: $1"; }; echo "  ✓ 04 detecta: $1"; }

clean_cloud_db() {
  mkdir -p "$W/limpia/supabase/migrations" && cp supabase/config.toml "$W/limpia/supabase/"
  sed -i '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$W/limpia/supabase/config.toml"
  "$SB" db reset --workdir "$W/limpia" >/dev/null
  [ "$(docker exec -i "$DB" psql -U postgres -At -c "select count(*) from pg_tables where schemaname = 'public'")" = 0 ] || fail "la base no quedó limpia"
  psql_file "$DIR/pruebas/supabase_rls_auto_enable.sql" >/dev/null   # lo que Supabase Cloud trae de fábrica
}
superadmin() {
  eval "$("$SB" status -o env 2>/dev/null | tr -d '"' | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
  local email="superadmin.prueba@example.com" pw code
  pw=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'content-type: application/json' -d "{\"email\":\"$email\",\"password\":\"$pw\",\"email_confirm\":true}")
  [ "$code" = 200 ] || fail "no se pudo crear el usuario de Auth (HTTP $code)"
  refuses "$DIR/03_SUPERADMINISTRADOR.sql" "Escribe el correo"
  sed -e "s/'CORREO_DEL_USUARIO_CREADO_EN_AUTHENTICATION';/'$email';/" -e "s/'NOMBRE_Y_APELLIDO';  /'Superadmin Prueba';/" "$DIR/03_SUPERADMINISTRADOR.sql" > "$W/03.sql"
  grep -q "superadmin" <<<"$(psql_file "$(crlf "$W/03.sql")")" || fail "03 no asignó el rol"
}
patch_twice() {
  local out
  out=$(psql_file "$(crlf "$DIR/06_PARCHE_SEGURIDAD_PRODUCCION.sql")")
  grep -q "hit_rate_limit.*| service_role" <<<"$out" || fail "06 no dejó hit_rate_limit solo para service_role: $out"
  psql_file "$(crlf "$DIR/06_PARCHE_SEGURIDAD_PRODUCCION.sql")" >/dev/null || fail "06 falló al ejecutarse de nuevo"
}
diag07() {
  local out; out=$(psql_file "$DIR/07_DIAGNOSTICO_POST_PARCHE.sql")
  grep -q "todo coincide con lo probado" <<<"$out" || { echo "$out" >&2; fail "07 encontró diferencias ($1)"; }
  grep -c "→.*| denegado" <<<"$out" | grep -qx 12 || fail "07: no todas las invocaciones fueron denegadas"
}
cli_up_to_date() { grep -qi "up to date" <<<"$("$SB" db push --local --dry-run 2>&1)" || fail "la CLI quiere volver a aplicar migraciones ($1)"; }

echo "== 1. Huella del esquema sobre una base migrada con la CLI"
"$SB" db reset --no-seed >/dev/null
node scripts/generar-sql-produccion.mjs --huella
git diff --exit-code -- "$DIR" \
  || fail "los archivos de $DIR no están al día: ejecuta node scripts/generar-sql-produccion.mjs --huella y versiona el resultado"

echo "== 2. Instalación nueva, como en Supabase Cloud y pegando desde Windows (CR+LF)"
clean_cloud_db
psql_file "$(crlf "$DIR/01_MIGRACIONES_PRODUCCION.sql")" >/dev/null
refuses "$DIR/01_MIGRACIONES_PRODUCCION.sql" "no se vuelve a ejecutar"
psql_file "$(crlf "$DIR/02_DATOS_INICIALES_PRODUCCION.sql")" >/dev/null
refuses "$DIR/02_DATOS_INICIALES_PRODUCCION.sql" "solo se ejecuta una vez"
superadmin
expect_ready "instalación nueva"
patch_twice
expect_ready "instalación nueva + 06"
diag07 "instalación nueva"
# Comportamiento de la réplica de Supabase: una tabla nueva en public nace con RLS (se revierte).
docker exec -i "$DB" psql -U postgres -d postgres -X -q -At -c "begin; create table public.zz_rls_prueba(id int); select relrowsecurity from pg_class where oid = 'public.zz_rls_prueba'::regclass; rollback;" \
  | grep -qx t || fail "ensure_rls no activó RLS en una tabla nueva"
echo "  ✓ ensure_rls activa RLS en tablas nuevas"
cli_up_to_date "instalación nueva"
echo "  ✓ instalación nueva lista"

echo "== 3. Actualización desde el estado actual de producción (instalada con 01 hasta 0010)"
clean_cloud_db
node scripts/generar-sql-produccion.mjs --solo-01 --hasta=0010 --salida="$W/01_hasta_0010.sql"
refuses "$DIR/06_PARCHE_SEGURIDAD_PRODUCCION.sql" "ejecuta primero 01"
psql_file "$(crlf "$W/01_hasta_0010.sql")" >/dev/null
psql_file "$(crlf "$DIR/02_DATOS_INICIALES_PRODUCCION.sql")" >/dev/null
superadmin
expect_flag "antes del parche: hit_rate_limit y next_advisor expuestas" "invocables desde la API pública"
expect_flag "antes del parche: migración 0011 sin registrar" "Migraciones 0001"
patch_twice
expect_ready "producción + 06"
diag07 "producción + 06"
cli_up_to_date "producción + 06"
echo "  ✓ actualización lista"

echo "== 4. El verificador detecta alteraciones reales"
tamper() { sqlc "$1" >/dev/null; expect_flag "$2" "$3"; sqlc "$4" >/dev/null; }
save_def() { docker exec -i "$DB" psql -U postgres -At -c "select pg_get_functiondef('$1'::regprocedure)" > "$W/def.sql"; }
tamper "grant execute on function public.hit_rate_limit(text, integer, integer) to anon" \
  "EXECUTE de hit_rate_limit devuelto a anon" "invocables desde la API pública" \
  "revoke execute on function public.hit_rate_limit(text, integer, integer) from anon"
tamper "grant execute on function public.audit_trigger() to public" \
  "EXECUTE público en una función de disparador" "Funciones y permisos" \
  "revoke execute on function public.audit_trigger() from public"
save_def "public.next_advisor()"
tamper "$(sed 's/order by count(l.id) asc/order by count(l.id) desc/' "$W/def.sql")" \
  "cuerpo de next_advisor() modificado" "distintas de lo probado: next_advisor()" "$(cat "$W/def.sql")"
tamper "alter function public.current_role_is(app_role[]) set search_path = public" \
  "search_path de current_role_is() sin pg_temp" "distintas de lo probado: current_role_is" \
  "alter function public.current_role_is(app_role[]) set search_path = public, pg_temp"
tamper "alter function public.app_actor() security invoker" \
  "app_actor() pasó a SECURITY INVOKER" "distintas de lo probado: app_actor()" \
  "alter function public.app_actor() security definer"
save_def "public.rls_auto_enable()"
tamper "$(sed "s/cmd.schema_name IN ('public')/cmd.schema_name IN ('storage')/" "$W/def.sql")" \
  "rls_auto_enable() distinta de la versión revisada de Supabase" "distintas de lo probado: rls_auto_enable()" "$(cat "$W/def.sql")"
tamper "alter event trigger ensure_rls disable" "ensure_rls desactivado" "RLS automática" "alter event trigger ensure_rls enable"
tamper "create function public.fuga() returns int language sql security definer as 'select 1'" \
  "función SECURITY DEFINER nueva expuesta" "sobran: fuga()" "drop function public.fuga()"
tamper "create policy fuga on public.leads for select using (true)" "política de más" "sobran: public.leads.fuga" "drop policy fuga on public.leads"
tamper "grant create on schema public to anon" "CREATE en public para anon" "no pueden crear objetos" "revoke create on schema public from anon"
expect_ready "después de revertir las alteraciones"

echo "✓ Archivos SQL de producción probados: instalación nueva, actualización desde producción y detección"
