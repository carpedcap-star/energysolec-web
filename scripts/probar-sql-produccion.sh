#!/usr/bin/env bash
# Prueba los archivos de supabase/produccion/ como se usan en el SQL Editor, sobre la pila LOCAL de Supabase:
#   1. Base migrada con la CLI → recalcula la huella del esquema y exige que los archivos versionados estén al día.
#   2. Base LIMPIA (sin migraciones) → 01, 02, usuario creado por la API de Auth (como en el panel), 03 y 04.
#      Exige que 04 termine en «Lista para el primer despliegue» y que 01 y 02 se nieguen a correr dos veces.
#   3. Comprueba que la CLI reconozca las migraciones registradas por 01 (nada pendiente en `db push`).
# BORRA la base local. Requiere `supabase start` (pila local) y Docker. Uso: scripts/probar-sql-produccion.sh
set -euo pipefail
cd "$(dirname "$0")/.."
SB=${SUPABASE_BIN:-supabase}
DB=supabase_db_energysolec-web
DIR=supabase/produccion
psql_file() { docker exec -i "$DB" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 -c "$(cat "$1")"; }
fail() { echo "✗ $*" >&2; exit 1; }
# Ejecuta un archivo que DEBE fallar y exige que su mensaje contenga el texto dado.
refuses() { local out; out=$(psql_file "$1" 2>&1) && fail "$1 debía detenerse"; grep -q "$2" <<<"$out" || fail "$1: mensaje inesperado: $out"; }

echo "== 1. Huella del esquema sobre una base migrada con la CLI"
"$SB" db reset --no-seed >/dev/null
node scripts/generar-sql-produccion.mjs --huella
git diff --exit-code -- "$DIR" \
  || fail "los archivos de $DIR no están al día: ejecuta node scripts/generar-sql-produccion.mjs --huella y versiona el resultado"

echo "== 2. Instancia limpia, archivo por archivo"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
mkdir -p "$W/supabase/migrations" && cp supabase/config.toml "$W/supabase/"
sed -i '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' "$W/supabase/config.toml"
"$SB" db reset --workdir "$W" >/dev/null
[ "$(docker exec -i "$DB" psql -U postgres -At -c "select count(*) from pg_tables where schemaname = 'public'")" = 0 ] || fail "la base no quedó limpia"

psql_file "$DIR/01_MIGRACIONES_PRODUCCION.sql" >/dev/null
refuses "$DIR/01_MIGRACIONES_PRODUCCION.sql" "no se vuelve a ejecutar"
psql_file "$DIR/02_DATOS_INICIALES_PRODUCCION.sql" >/dev/null
refuses "$DIR/02_DATOS_INICIALES_PRODUCCION.sql" "solo se ejecuta una vez"
refuses "$DIR/03_SUPERADMINISTRADOR.sql" "Escribe el correo"

eval "$("$SB" status -o env 2>/dev/null | tr -d '"' | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
EMAIL="superadmin.prueba@example.com"
PW=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'content-type: application/json' -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\",\"email_confirm\":true}")
[ "$code" = 200 ] || fail "no se pudo crear el usuario de Auth (HTTP $code)"
sed -e "s/'CORREO_DEL_USUARIO_CREADO_EN_AUTHENTICATION';/'$EMAIL';/" -e "s/'NOMBRE_Y_APELLIDO';  /'Superadmin Prueba';/" "$DIR/03_SUPERADMINISTRADOR.sql" > "$W/03.sql"
grep -q "superadmin" <<<"$(psql_file "$W/03.sql")" || fail "03 no asignó el rol"

out=$(psql_file "$DIR/04_VERIFICACION_PRODUCCION.sql")
echo "$out" | grep -E '^ +[0-9]+ \|' || true
grep -q "Lista para el primer despliegue" <<<"$out" || fail "04 no dio la base por lista"

echo "== 3. La CLI reconoce las migraciones aplicadas por SQL"
grep -qi "up to date" <<<"$("$SB" db push --local --dry-run 2>&1)" || fail "la CLI quiere volver a aplicar migraciones"
echo "✓ Archivos SQL de producción probados sobre una instancia limpia"
