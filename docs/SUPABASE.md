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

Probado de punta a punta sobre la pila local con estos mismos archivos. Ejecuta los comandos desde la carpeta del repositorio.

1. **Autenticar la CLI**: `npx supabase@2.122.1 login` (abre el navegador; el token queda en el llavero del sistema, no en el historial). No pegues tokens ni la contraseña de la base en comandos (`-p`, `--password`): deja que la CLI te los pida.
2. **Vincular y migrar**:
   ```bash
   npx supabase@2.122.1 link --project-ref <ref>      # pide la contraseña de la base
   npx supabase@2.122.1 db push --dry-run             # debe listar 0001 … 0010
   npx supabase@2.122.1 db push
   ```
   No uses `--include-seed` (cargaría `supabase/seed.sql`, que es de desarrollo) ni `supabase config push` (subiría la configuración LOCAL de `config.toml`, con URLs de localhost).
3. **Datos iniciales**: pega el contenido de `supabase/seed.production.sql` en *SQL Editor* y ejecútalo **una vez**. Carga parámetros y tarifas provisionales, categorías, marcas sin publicar, indicadores sin verificar y proyectos sin publicar; no carga contacto ni identidad (se configuran en el panel). Si se ejecuta de nuevo, se niega.
4. **Auth** (*Authentication → Sign In / Providers*): desactiva **«Allow new users to sign up»** y deja **activo** el proveedor *Email*. Opcional: contraseña mínima de 10 (la aplicación ya la exige).
5. **Primer superadministrador**: *Authentication → Users → Add user → Create new user*, con correo, contraseña y **Auto Confirm User** marcado. Luego, en *SQL Editor*:
   ```sql
   insert into public.profiles (id, email, full_name, role, active, is_advisor)
   select id, email, 'Nombre Apellido', 'superadmin', true, false from auth.users where email = 'correo@energysolec.com'
   returning email, role;
   ```
   El resto del equipo se invita desde el panel (**Usuarios**).
6. **Claves propias** para `APP_SECRET` e `IP_HASH_SALT`, generadas en tu computadora y pegadas directamente en Vercel (marcadas como *Sensitive*), nunca en un chat ni en el repositorio:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
   Una ejecución por variable. Cambiar `APP_SECRET` invalida los enlaces de estudios ya enviados: hazlo antes de publicar.
7. **Verificación** (solo lectura; no escribe nada ni muestra las claves):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_... SUPABASE_SERVICE_ROLE_KEY=sb_secret_... node scripts/verificar-produccion.mjs
   ```
   Revisa migraciones, que la clave pública no vea datos privados, buckets privados, registros desactivados, superadministrador y datos iniciales. Debe terminar en «✓ Lista para el primer despliegue»; los avisos (parámetros y tarifas provisionales) se resuelven luego desde el panel.
8. **Copias de seguridad**: activa *Point-in-Time Recovery* (plan Pro) o programa un `pg_dump` diario.

Variables en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave `sb_publishable_…`) y `SUPABASE_SERVICE_ROLE_KEY` (clave `sb_secret_…`, **solo servidor**). Las claves nuevas de Supabase funcionan con estos mismos nombres (probado).

## 3. Cómo atribuye la base los cambios del panel

El servidor escribe con la clave de servicio, que no tiene usuario. Las acciones del panel usan `getStoreAs(staff.id)`, que envía la cabecera `x-ese-actor`. La función `app_actor()` (migración 0010) solo la acepta si la petición viene firmada con la clave de servicio; desde el navegador no se puede suplantar a nadie. Con ella:

- **Auditoría:** `audit_log`, `order_status_history` y las actividades automáticas de los leads registran quién hizo el cambio.
- **Pagos:** marcar un pedido como «pagado» exige que quien verifica sea el actor y tenga rol de Gerencia o superadministrador.

Las escrituras públicas (formularios, pedidos) y las tareas programadas no tienen actor: quedan como «sin usuario», que es lo correcto.
