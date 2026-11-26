# Supabase: pruebas locales y puesta en producción

La plataforma usa Supabase para la base de datos (Postgres con RLS), la autenticación del panel y de los clientes comerciales, y el almacenamiento de archivos. Sin Supabase, `npm run dev` funciona con el archivo local `.data/dev-db.json`, pero ese modo no prueba lo que corre en producción.

## 1. Probar contra un Supabase real en tu computadora

Requisitos: Docker y la [CLI de Supabase](https://supabase.com/docs/guides/local-development) (`npx supabase@2` sirve).

```bash
supabase start -x realtime,studio,edge-runtime,imgproxy,logflare,vector,supavisor,postgres-meta,mailpit
```

Esto levanta Postgres, PostgREST, Auth y Storage con la configuración de `supabase/config.toml`, aplica todas las migraciones de `supabase/migrations/` y carga `supabase/seed.sql`. Si la descarga de imágenes falla con «Data limit exceeded», usa Docker Hub: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start …`.

Las claves de la pila local (valores fijos de desarrollo, no secretos) se obtienen con `supabase status -o env`. Para cargarlas:

```bash
supabase status -o env | sed -n -e 's/^API_URL=/NEXT_PUBLIC_SUPABASE_URL=/p' -e 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_ANON_KEY=/p' -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/p' > .env.supabase-local
set -a; . ./.env.supabase-local; set +a
```

Con esas variables:

```bash
npm run test:supabase   # integración del almacén: RLS, disparadores, Storage, Auth (14 pruebas)
npm run e2e:supabase    # recorrido en el navegador: panel, producto con imágenes, pedido y pago, calculadora,
                        # cuenta comercial con activación, configuración, cotización industrial, invitación, tareas
```

`e2e:supabase` crea un usuario por rol (`superadmin@sb.test`, `gerencia@sb.test`…; contraseña `Panel-Prueba-2026`) y se niega a correr contra una URL que no sea la pila local. Para usar la aplicación a mano contra la pila: `npm run dev` con esas variables cargadas.

CI corre lo mismo en cada push y cada pull request (trabajo «Integración con Supabase real»).

## 2. Proyecto de producción

1. **Crear el proyecto** en supabase.com (región `us-east-1` o la más cercana a Ecuador) y vincularlo:
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # aplica supabase/migrations/* en orden
   ```
   Nunca edites una migración ya aplicada: crea la siguiente.
2. **Datos iniciales**: `supabase/seed.sql` trae tarifas, parámetros y contenido PROVISIONALES (marcados como tales). Cárgalo una sola vez: `psql "$DATABASE_URL" -f supabase/seed.sql`.
3. **Auth** (*Authentication → Sign In / Providers*):
   - **Desactiva «Allow new users to sign up».** Todos los usuarios los crea el servidor: invitaciones del panel y aprobación de cuentas comerciales. Deja **activo** el proveedor *Email*: es el inicio de sesión con correo y contraseña.
   - Contraseña mínima: 10 caracteres (la aplicación también lo exige).
   - Los correos de invitación y recuperación los envía la aplicación (Resend) con su propio enlace; no hace falta configurar las plantillas de correo de Supabase.
4. **Primer superadministrador**: crea el usuario en *Authentication → Users* (con contraseña) y luego:
   ```sql
   insert into profiles (id, full_name, email, role) values ('<uuid-del-usuario>', 'Nombre', 'correo@energysolec.com', 'superadmin');
   ```
   El resto del equipo se invita desde el panel (**Usuarios**).
5. **Storage**: las migraciones crean los buckets (`public-media` público; `private-docs`, `bills` y `project-docs` privados) con sus límites y políticas. No los cambies a públicos.
6. **Variables en Vercel**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (esta última **solo** servidor, nunca con prefijo `NEXT_PUBLIC_`).
7. **Copias de seguridad**: activa *Point-in-Time Recovery* (plan Pro) o programa un `pg_dump` diario.

## 3. Cómo atribuye la base los cambios del panel

El servidor escribe con la clave de servicio, que no tiene usuario. Las acciones del panel usan `getStoreAs(staff.id)`, que envía la cabecera `x-ese-actor`. La función `app_actor()` (migración 0010) solo la acepta si la petición viene firmada con la clave de servicio; desde el navegador no se puede suplantar a nadie. Con ella:

- **Auditoría:** `audit_log`, `order_status_history` y las actividades automáticas de los leads registran quién hizo el cambio.
- **Pagos:** marcar un pedido como «pagado» exige que quien verifica sea el actor y tenga rol de Gerencia o superadministrador.

Las escrituras públicas (formularios, pedidos) y las tareas programadas no tienen actor: quedan como «sin usuario», que es lo correcto.
