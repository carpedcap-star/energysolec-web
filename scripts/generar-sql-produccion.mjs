// Genera los archivos SQL de supabase/produccion/ para aplicar en el SQL Editor de Supabase (sin terminal).
//
//   node scripts/generar-sql-produccion.mjs
//
//   node scripts/generar-sql-produccion.mjs --huella   # además recalcula la huella del esquema
//
// 01 y 02 salen de supabase/migrations/ y supabase/seed.production.sql. La huella que compara 04
// (supabase/produccion/huella-esquema.json) se calcula con --huella contra una base de Supabase recién migrada
// con la CLI: la pila local (contenedor supabase_db_energysolec-web) o la URL de DATABASE_URL. CI la recalcula y
// falla si algo difiere de lo versionado: si cambias una migración, ejecuta `supabase db reset --no-seed`, este
// script con --huella, y versiona el resultado.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'supabase/produccion';
mkdirSync(OUT, { recursive: true });
const migrations = readdirSync('supabase/migrations').filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

// ─────────────────────────── 01: migraciones consolidadas ───────────────────────────
const versions = migrations.map((f) => { const [, v, name] = f.match(/^(\d{4})_(.+)\.sql$/); return { f, v, name }; });
const last = versions.at(-1).v;
const m01 = `-- =====================================================================================================
-- 01_MIGRACIONES_PRODUCCION.sql — Energy Solutions Ecuador · energysolec-web
-- Migraciones ${versions[0].v} a ${last} consolidadas en su orden, para el SQL Editor de Supabase.
-- ARCHIVO GENERADO por scripts/generar-sql-produccion.mjs desde supabase/migrations/: no lo edites a mano.
--
-- · Se ejecuta UNA sola vez, sobre un proyecto recién creado. Si la base ya tiene el esquema, se detiene sin
--   cambiar nada.
-- · Todo va en una sola transacción: si algo falla, no queda nada a medias.
-- · Al final registra las migraciones en supabase_migrations.schema_migrations, igual que \`supabase db push\`,
--   para que la CLI sepa más adelante que ya están aplicadas y solo envíe las nuevas (0011 en adelante).
-- · No contiene claves, contraseñas, usuarios ni datos: solo estructura, seguridad (RLS) y buckets.
-- =====================================================================================================

begin;

do $guard$
begin
  if to_regclass('public.profiles') is not null then
    raise exception 'La base ya tiene el esquema de la plataforma (existe public.profiles): este archivo no se vuelve a ejecutar.';
  end if;
  -- IF anidado (no AND): PL/pgSQL analiza la consulta interior solo si la tabla existe.
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if exists (select 1 from supabase_migrations.schema_migrations) then
      raise exception 'El proyecto ya tiene migraciones registradas: aplica las nuevas con la CLI, no con este archivo.';
    end if;
  end if;
end
$guard$;

${versions.map(({ f }) => `-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- ${f}
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
${readFileSync(`supabase/migrations/${f}`, 'utf8').trimEnd()}
`).join('\n')}
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Registro de migraciones (mismo formato que usa la CLI de Supabase)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
${versions.map(({ v, name }) => `  ('${v}', '${name}')`).join(',\n')}
on conflict (version) do nothing;

commit;
`;
writeFileSync(`${OUT}/01_MIGRACIONES_PRODUCCION.sql`, m01);

// ─────────────────────────── 02: datos iniciales ───────────────────────────
const seed = readFileSync('supabase/seed.production.sql', 'utf8');
writeFileSync(`${OUT}/02_DATOS_INICIALES_PRODUCCION.sql`, `-- =====================================================================================================
-- 02_DATOS_INICIALES_PRODUCCION.sql — copia exacta de supabase/seed.production.sql
-- ARCHIVO GENERADO por scripts/generar-sql-produccion.mjs: no lo edites a mano.
-- Ejecútalo UNA sola vez, después de 01. Si la base ya tiene datos iniciales, se detiene sin cambiar nada.
-- =====================================================================================================

${seed.trimEnd()}
`);

// ─────────────────────────── 04: verificación ───────────────────────────
/** Huella del esquema: la misma consulta corre aquí (base probada) y dentro de 04 (base de producción). */
const FINGERPRINT = `jsonb_build_object(
    'tablas', (select jsonb_object_agg(c.relname, concat_ws(' | ', c.relkind, 'rls=' || c.relrowsecurity,
        'anon=' || concat_ws('', case when has_table_privilege('anon', c.oid, 'select') then 's' end, case when has_table_privilege('anon', c.oid, 'insert') then 'i' end, case when has_table_privilege('anon', c.oid, 'update') then 'u' end, case when has_table_privilege('anon', c.oid, 'delete') then 'd' end),
        'columnas=' || md5(coalesce((select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' not null' else '' end, ', ' order by a.attnum)
          from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), ''))))
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v')),
    'politicas', (select jsonb_object_agg(schemaname || '.' || tablename || '.' || policyname, md5(concat_ws(' | ', permissive, cmd, roles::text, qual, with_check)))
      from pg_policies where schemaname in ('public', 'storage')),
    'funciones', (select jsonb_object_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
        md5(pg_get_functiondef(p.oid)) || ' | anon=' || has_function_privilege('anon', p.oid, 'execute') || ' | authenticated=' || has_function_privilege('authenticated', p.oid, 'execute'))
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind in ('f', 'p')
        and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
    'disparadores', (select jsonb_object_agg(c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid)))
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and not t.tgisinternal),
    'restricciones', (select jsonb_object_agg(c.relname || '.' || k.conname, md5(pg_get_constraintdef(k.oid)))
      from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'),
    'indices', (select jsonb_object_agg(i.relname, md5(pg_get_indexdef(i.oid)))
      from pg_index x join pg_class i on i.oid = x.indexrelid join pg_namespace n on n.oid = i.relnamespace where n.nspname = 'public'),
    'tipos', (select jsonb_object_agg(t.typname, (select string_agg(e.enumlabel, ', ' order by e.enumsortorder) from pg_enum e where e.enumtypid = t.oid))
      from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'),
    'buckets', (select jsonb_object_agg(id, concat_ws(' | ', 'publico=' || public, 'limite=' || coalesce(file_size_limit::text, 'sin límite'), 'tipos=' || coalesce(allowed_mime_types::text, 'todos')))
      from storage.buckets),
    'storage_rls', (select jsonb_build_object('objects', 'rls=' || relrowsecurity) from pg_class where oid = 'storage.objects'::regclass)
  )`;

function runSql(sql) {
  const args = ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql];
  if (process.env.DATABASE_URL) return execFileSync('psql', [process.env.DATABASE_URL, ...args], { encoding: 'utf8' });
  return execFileSync('docker', ['exec', '-i', 'supabase_db_energysolec-web', 'psql', '-U', 'postgres', '-d', 'postgres', ...args], { encoding: 'utf8' });
}
const HUELLA = 'supabase/produccion/huella-esquema.json';
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k] && typeof o[k] === 'object' ? sortObj(o[k]) : o[k]]));
if (process.argv.includes('--huella')) {
  const fresh = JSON.parse(runSql(`set search_path = public, extensions; select ${FINGERPRINT};`).trim());
  if (!fresh.tablas?.profiles) throw new Error('La base de referencia no tiene el esquema: genera la huella sobre una base recién migrada (supabase db reset --no-seed).');
  writeFileSync(HUELLA, JSON.stringify(sortObj(fresh), null, 1) + '\n');
}
const expected = JSON.parse(readFileSync(HUELLA, 'utf8'));
// Un objeto por línea: el archivo se lee y se compara (git diff) con facilidad.
const expectedSql = '{\n' + Object.entries(sortObj(expected)).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n') + '\n}';
if (expectedSql.includes("'")) throw new Error('la huella contiene comillas simples');

const PRIVATE = ['profiles', 'audit_log', 'trade_accounts', 'leads', 'lead_activities', 'consents', 'solar_resource_cache', 'solar_studies', 'bill_uploads', 'orders',
  'order_items', 'order_status_history', 'outbound_messages', 'events', 'rate_limits', 'cron_runs', 'industrial_requests', 'industrial_documents'];
const TABLES_COUNT = Object.keys(expected.tablas).length;

const m04 = `-- =====================================================================================================
-- 04_VERIFICACION_PRODUCCION.sql — Energy Solutions Ecuador · energysolec-web
-- Verificación de SOLO LECTURA (la transacción se declara read only: Postgres rechazaría cualquier escritura).
-- ARCHIVO GENERADO por scripts/generar-sql-produccion.mjs: no lo edites a mano.
--
-- Devuelve una tabla con una fila por comprobación: ✓ correcto · ✗ hay que corregirlo · ! aviso (se resuelve
-- desde el panel). La fila 0 resume el resultado.
--
-- Qué compara:
--   · Huella del esquema: tablas, columnas, RLS, permisos de anon, políticas, funciones (y quién puede
--     ejecutarlas), disparadores, restricciones, índices, tipos y buckets, contra la base en la que se
--     probaron las migraciones ${versions[0].v}–${last} (pruebas de integración y de navegador).
--   · Simulación de visitantes: entra como anon (visitante) y como un usuario autenticado sin perfil, y
--     confirma que no ven ninguna fila privada.
--   · Superadministrador y datos iniciales.
--
-- NO se puede comprobar desde SQL (configuración del servicio de Auth, de la API o de Vercel):
--   1. Registros públicos desactivados («Allow new users to sign up» = OFF) y proveedor Email activo.
--   2. Site URL de Authentication (https://www.energysolec.com).
--   3. Que las claves en Vercel sean las correctas: sb_publishable_… en NEXT_PUBLIC_SUPABASE_ANON_KEY y
--      sb_secret_… SOLO en SUPABASE_SERVICE_ROLE_KEY.
--   4. Que la API REST exponga el esquema public (Settings → API → Exposed schemas; viene así por defecto).
--   Ver las instrucciones en supabase/produccion/LEEME.md.
-- =====================================================================================================

set transaction read only;
set search_path = public, extensions;
do $pre$ begin
  if to_regclass('public.profiles') is null then raise exception 'La base todavía no tiene el esquema: ejecuta primero 01_MIGRACIONES_PRODUCCION.sql.'; end if;
end $pre$;
select set_config('ese.verif_visitantes', 'no se ejecutó la simulación', false);

-- Simulación de visitantes: anon y un usuario autenticado cualquiera (sin perfil ni cuenta comercial).
do $sim$
declare
  t text; n bigint; fugas text[] := '{}'; who text;
  privadas text[] := array[${PRIVATE.map((t) => `'${t}'`).join(', ')}];
begin
  foreach who in array array['anon', 'authenticated'] loop
    perform set_config('request.jwt.claims', case when who = 'anon' then '{"role":"anon"}'
      else '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}' end, true);
    execute format('set local role %I', who);
    foreach t in array privadas loop
      begin
        execute format('select count(*) from public.%I', t) into n;
        if n > 0 then fugas := fugas || (who || ' ve ' || n || ' fila(s) de ' || t); end if;
      exception when insufficient_privilege then null;
      end;
    end loop;
    begin
      select count(*) into n from public.site_settings where key = 'notifications';
      if n > 0 then fugas := fugas || (who || ' ve el correo de avisos internos'); end if;
    exception when insufficient_privilege then null;
    end;
    begin
      select count(*) into n from public.product_prices where tier <> 'final';
      if n > 0 then fugas := fugas || (who || ' ve ' || n || ' precio(s) de instalador/distribuidor'); end if;
    exception when insufficient_privilege then null;
    end;
    begin
      select count(*) into n from storage.objects where bucket_id in ('private-docs', 'bills', 'project-docs', 'reports');
      if n > 0 then fugas := fugas || (who || ' ve ' || n || ' archivo(s) privados'); end if;
    exception when insufficient_privilege then null;
    end;
    begin
      perform public.app_actor();
      fugas := fugas || (who || ' puede ejecutar app_actor()');
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('ese.verif_visitantes', case when cardinality(fugas) = 0 then 'ok' else array_to_string(fugas, '; ') end, false);
end
$sim$;

with
esperado as (select '${expectedSql}'::jsonb as j),
actual as (select ${FINGERPRINT} as j),
categorias(orden, clave, nombre) as (values
  (10, 'tablas', 'Tablas y vistas (${TABLES_COUNT}): columnas, RLS activada y permisos de anon'),
  (11, 'politicas', 'Políticas RLS (public y storage)'),
  (12, 'funciones', 'Funciones y permisos de ejecución'),
  (13, 'disparadores', 'Disparadores (auditoría, pagos, historial)'),
  (14, 'restricciones', 'Restricciones (claves, únicos y CHECK)'),
  (15, 'indices', 'Índices'),
  (16, 'tipos', 'Tipos enumerados'),
  (20, 'buckets', 'Buckets: público/privado, límite de tamaño y tipos de archivo'),
  (21, 'storage_rls', 'RLS activada en storage.objects')),
diferencias as (
  select c.orden, c.nombre,
    (select string_agg(k, ', ' order by k) from jsonb_object_keys(e.j -> c.clave) k where not coalesce(a.j -> c.clave, '{}') ? k) as faltan,
    (select string_agg(k, ', ' order by k) from jsonb_object_keys(coalesce(a.j -> c.clave, '{}')) k where not (e.j -> c.clave) ? k) as sobran,
    (select string_agg(k, ', ' order by k) from jsonb_object_keys(e.j -> c.clave) k where a.j -> c.clave ? k and a.j -> c.clave ->> k <> e.j -> c.clave ->> k) as distintas
  from categorias c, esperado e, actual a),
migraciones as (
  select count(*) filter (where version in (${versions.map(({ v }) => `'${v}'`).join(', ')})) as n
  from supabase_migrations.schema_migrations),
supers as (
  select p.email::text as email, u.email_confirmed_at is not null as confirmado, u.banned_until is not null and u.banned_until > now() as bloqueado
  from public.profiles p left join auth.users u on u.id = p.id where p.role = 'superadmin' and p.active),
checks(orden, area, comprobacion, estado, detalle) as (
  select 1, 'Migraciones', 'Migraciones ${versions[0].v}–${last} registradas', case when n = ${versions.length} then '✓' else '✗' end,
    n || ' de ${versions.length} en supabase_migrations.schema_migrations' from migraciones
  union all
  select orden, case when orden < 20 then 'Esquema' else 'Almacenamiento' end, nombre,
    case when faltan is null and sobran is null and distintas is null then '✓' else '✗' end,
    coalesce(nullif(concat_ws(' · ', 'faltan: ' || faltan, 'sobran: ' || sobran, 'distintas de lo probado: ' || distintas), ''), 'idéntico a la base probada')
  from diferencias
  union all
  select 30, 'Seguridad', 'Visitantes (anon) y usuarios sin perfil no ven datos privados',
    case when current_setting('ese.verif_visitantes', true) = 'ok' then '✓' else '✗' end,
    case when current_setting('ese.verif_visitantes', true) = 'ok' then '${PRIVATE.length} tablas privadas, avisos internos, precios de nivel, archivos privados y app_actor()'
      else current_setting('ese.verif_visitantes', true) end
  union all
  select 40, 'Autenticación', 'Superadministrador activo con usuario confirmado',
    case when exists (select 1 from supers where confirmado and not bloqueado) then '✓' else '✗' end,
    coalesce((select string_agg(email || case when not confirmado then ' (sin confirmar)' when bloqueado then ' (bloqueado)' else '' end, ', ') from supers),
      'ninguno: crea el usuario en Authentication → Users y ejecuta 03_SUPERADMINISTRADOR.sql')
  union all
  select 41, 'Autenticación', 'Usuarios de Auth sin perfil en el panel',
    case when n = 0 then '✓' else '!' end,
    case when n = 0 then 'ninguno' else n || ' usuario(s) sin perfil: si no los creaste tú, revisa que los registros públicos estén desactivados' end
  from (select count(*) n from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id) and not exists (select 1 from public.trade_accounts t where t.user_id = u.id)) x
  union all
  select 50, 'Datos iniciales', 'Un juego de parámetros de cálculo activo',
    case when count(*) = 1 then case when bool_or(is_placeholder) then '!' else '✓' end else '✗' end,
    case when count(*) <> 1 then count(*) || ' activos: debe haber exactamente 1 (ejecuta 02)'
      when bool_or(is_placeholder) then 'PROVISIONALES: Gerencia debe validarlos en /admin/parametros' else 'validados' end
  from public.calc_params where active
  union all
  select 51, 'Datos iniciales', 'Tarifa activa para residencial, comercial e industrial',
    case when count(distinct segment) filter (where segment in ('residencial', 'comercial', 'industrial')) < 3 then '✗' when bool_or(is_placeholder) then '!' else '✓' end,
    case when count(distinct segment) filter (where segment in ('residencial', 'comercial', 'industrial')) < 3 then 'faltan segmentos (ejecuta 02)'
      when bool_or(is_placeholder) then count(*) || ' tarifas PROVISIONALES: Ingeniería debe cargar el pliego ARCONEL en /admin/tarifas' else count(*) || ' tarifas' end
  from public.tariffs where active
  union all
  select 52, 'Datos iniciales', 'Categorías de la tienda', case when count(*) >= 16 then '✓' else '✗' end, count(*) || ' categorías' from public.product_categories
  union all
  select 53, 'Datos iniciales', 'Marcas: ninguna publicada sin revisión', case when count(*) filter (where published) = 0 then '✓' else '!' end,
    count(*) || ' cargadas · ' || count(*) filter (where published) || ' publicada(s)' from public.brands
  union all
  select 54, 'Datos iniciales', 'Indicadores de portada sin verificar ocultos', case when count(*) filter (where verified and coalesce(source_note, '') = '') = 0 then '✓' else '✗' end,
    count(*) filter (where verified) || ' de ' || count(*) || ' verificados (solo esos se muestran)' from public.company_stats
  union all
  select 55, 'Datos iniciales', 'Proyectos: ninguno publicado sin autorización', case when count(*) filter (where published) = 0 then '✓' else '!' end,
    count(*) || ' fichas · ' || count(*) filter (where published) || ' publicada(s)' from public.projects
  union all
  select 56, 'Datos iniciales', 'Sin leads ni pedidos de prueba',
    case when (select count(*) from public.leads) + (select count(*) from public.orders) = 0 then '✓' else '!' end,
    (select count(*) from public.leads) || ' lead(s) · ' || (select count(*) from public.orders) || ' pedido(s)'
)
select 0 as "#", 'RESUMEN' as area,
  case when count(*) filter (where estado = '✗') = 0 then 'Lista para el primer despliegue' else 'Hay problemas: corrige las filas ✗' end as comprobacion,
  case when count(*) filter (where estado = '✗') = 0 then '✓' else '✗' end as estado,
  count(*) filter (where estado = '✓') || ' correctas · ' || count(*) filter (where estado = '✗') || ' con problema · ' || count(*) filter (where estado = '!') || ' aviso(s)' as detalle
from checks
union all
select orden, area, comprobacion, estado, detalle from checks
order by 1;
`;
writeFileSync(`${OUT}/04_VERIFICACION_PRODUCCION.sql`, m04);
console.log(`Generados en ${OUT}/: 01 (${migrations.length} migraciones), 02, 04 (huella de ${TABLES_COUNT} tablas y vistas).`);
