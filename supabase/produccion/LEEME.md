# Puesta en producción sin terminal (SQL Editor de Supabase y Vercel)

Para el proyecto `energy-web-production` (ref. `rlprgtelbujyggpahdni`), desde el navegador, también en iPhone.
Los archivos de esta carpeta se probaron sobre una instancia de Supabase **limpia**, igual que un proyecto recién creado
(`scripts/probar-sql-produccion.sh`, también en CI). Ninguno contiene claves, contraseñas ni usuarios.

| Archivo | Qué hace | Se ejecuta |
|---|---|---|
| `01_MIGRACIONES_PRODUCCION.sql` | Las 11 migraciones (0001–0011) en orden, en una sola transacción, y su registro para la CLI | una vez, solo en un proyecto nuevo |
| `02_DATOS_INICIALES_PRODUCCION.sql` | Parámetros y tarifas PROVISIONALES, 16 categorías, marcas sin publicar, indicadores sin verificar y fichas de proyectos sin publicar | una vez |
| `03_SUPERADMINISTRADOR.sql` | Da el rol de superadministrador al usuario que crees en Authentication | después de crear el usuario |
| `04_VERIFICACION_PRODUCCION.sql` | Verificación de solo lectura | las veces que quieras |
| `06_PARCHE_SEGURIDAD_PRODUCCION.sql` | Migración 0011 para un proyecto ya instalado con 01 hasta 0010: permisos mínimos de las funciones y `search_path` endurecido | una vez (repetirlo no cambia nada) |
| `07_DIAGNOSTICO_POST_PARCHE.sql` | Diagnóstico de solo lectura de las funciones: permisos efectivos e intentos de invocación como anon y authenticated | las veces que quieras |

`pruebas/` y `huella-esquema.json` los usan las pruebas automáticas y el generador: no se ejecutan en producción.

Ninguna migración necesita ejecutarse por separado: 01 corre completa en una transacción (si algo falla, no queda nada a
medias). 01 y 02 se niegan a correr una segunda vez.

## Proyecto ya instalado con el 01 anterior (0001–0010): aplicar el parche

Es el caso de `energy-web-production`. **No vuelvas a ejecutar 01, 02 ni 03.**

1. Ejecuta `06`. Resultado esperado: una tabla con las 14 funciones de `public`. En la columna `pueden_ejecutar`,
   `hit_rate_limit`, `next_advisor`, `app_actor`, `actor_role_is`, `claim_outbound` y `prune_rate_limits` dicen solo
   `service_role`; las seis funciones de disparador quedan vacías; `current_role_is` y `rls_auto_enable` (de Supabase)
   conservan `PUBLIC, anon, authenticated, service_role`. Si lo ejecutas otra vez, el resultado es el mismo.
2. Ejecuta `04`. Fila 0: **✓ Lista para el primer despliegue** (21 correctas, 0 con problema, 2 avisos). La fila 12
   indica que `rls_auto_enable()` es de Supabase e idéntica a la versión revisada, y la 22 que `ensure_rls` está activo.
3. Ejecuta `07`. Fila `0 resumen`: **✓ todo coincide con lo probado**, y las 12 filas `3 invocacion` dicen `denegado`.

## Cómo ejecutar un archivo en el SQL Editor

1. Abre el archivo y copia **todo** su contenido (en el iPhone: tócalo y mantén → *Seleccionar todo* → *Copiar*).
2. Supabase → proyecto → **SQL Editor** → **+** (*New query*). Toca el área de texto y pega.
3. Pulsa **Run**. Si aparece un aviso de operación potencialmente destructiva, confirma con *Run this query*.
4. Lee el resultado en el panel inferior. El editor muestra solo el resultado de la última consulta.

## Proyecto nuevo: pasos

1. **Migraciones.** Ejecuta `01`. Resultado esperado: *Success. No rows returned*.
2. **Datos iniciales.** Ejecuta `02`. Resultado esperado: *Success. No rows returned*.
3. **Cerrar los registros.** *Authentication → Sign In / Providers*: desactiva **Allow new users to sign up** y deja
   **activo** el proveedor **Email** (si lo apagas, nadie puede entrar al panel). En *Authentication → URL
   Configuration*, pon como **Site URL** `https://www.energysolec.com`.
4. **Crear el usuario.** *Authentication → Users → Add user → Create new user*: tu correo, una contraseña larga
   (la contraseña segura que sugiere el iPhone sirve) y marca **Auto Confirm User**.
5. **Superadministrador.** Pega `03` y, **antes de pulsar Run**, cambia solo las dos líneas marcadas con `<<<`: el
   correo del paso 4 y tu nombre, entre las comillas simples. Resultado esperado: una fila con tu correo y
   `superadmin`. Si te equivocas, el archivo explica el error y no cambia nada; corrígelo y ejecútalo de nuevo.
6. **Verificación.** Ejecuta `04`. La fila **0** debe decir **✓ Lista para el primer despliegue**. Los dos avisos
   **!** (parámetros y tarifas provisionales) son esperados: se resuelven desde el panel. Si alguna fila muestra
   **✗**, no sigas y envía una captura de esa tabla (no contiene secretos). En un proyecto nuevo `06` no hace falta
   (01 ya incluye 0011); ejecutarlo no cambia nada.

## Qué compara 04 y por qué

- **Funciones:** cuerpo, firma, valores por defecto, retorno, volatilidad, SECURITY DEFINER, `search_path`,
  propietario y quién puede ejecutarlas (PUBLIC, anon, authenticated, service_role). Al pegar desde Windows el
  portapapeles convierte los saltos de línea en CR+LF y Postgres guarda el cuerpo tal cual: era la causa de las 13
  «definiciones distintas» del primer intento. 04 normaliza solo los pares CR+LF; un CR suelto o cualquier otro
  cambio sigue siendo un problema.
- **Lo que agrega Supabase Cloud:** `rls_auto_enable()` y su disparador de eventos `ensure_rls` activan RLS en cada
  tabla nueva de `public`. Se aceptan solo si son idénticos a la versión revisada (`pruebas/supabase_rls_auto_enable.sql`);
  cualquier otra función de más, o una versión distinta, es ✗.
- **Seguridad:** ninguna SECURITY DEFINER invocable por la API salvo `current_role_is()` (la evalúan las políticas
  RLS con el rol de quien consulta), sin CREATE en `public` para anon/authenticated, y una simulación como anon y
  como usuario autenticado sin perfil que no puede leer datos privados ni invocar las seis funciones del servidor.

## Lo que 04 no puede comprobar (configuración de Auth, de la API y de Vercel)

| Comprobación | Cómo verla desde el navegador |
|---|---|
| Registros públicos desactivados y Email activo | Abre en Safari `https://rlprgtelbujyggpahdni.supabase.co/auth/v1/settings?apikey=` seguido de tu clave **publicable** (`sb_publishable_…`; es pública, va en el código del sitio). Debe decir `"disable_signup":true` y, dentro de `external`, `"email":true`. Si responde con un error de clave, revisa los dos interruptores del paso 3. |
| Site URL | *Authentication → URL Configuration*. |
| Claves correctas en Vercel | *Vercel → Settings → Environment Variables*: `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_…`; `SUPABASE_SERVICE_ROLE_KEY` = `sb_secret_…`. **Nunca** una `sb_secret_` en una variable `NEXT_PUBLIC_`. |
| Esquema público expuesto en la API | *Settings → API → Exposed schemas* incluye `public` (así viene por defecto). |
| La aplicación funciona de punta a punta | Después del despliegue: entra a `/admin/login` con el usuario del paso 4 y envía un formulario de prueba desde `/contacto`. |

## Claves `APP_SECRET`, `IP_HASH_SALT` y `CRON_SECRET` sin terminal

En el SQL Editor, en una consulta nueva, ejecuta:

```sql
select translate(encode(extensions.gen_random_bytes(48), 'base64'), '+/=', '-_') as clave;
```

Son 48 bytes del generador criptográfico de Postgres (pgcrypto). No se guarda nada en la base. Ejecútalo una vez por
variable, copia el valor y pégalo **directamente** en *Vercel → Settings → Environment Variables*: edita la variable,
pega y marca **Sensitive**. No lo guardes en notas, capturas ni chats. Al terminar, cierra la pestaña de la consulta
sin guardarla. Cambia `APP_SECRET` antes del lanzamiento: hacerlo después invalida los enlaces de estudios ya enviados.

## Turnstile (anti-spam de Cloudflare)

Ya está implementado en los siete envíos públicos: contacto y cotizaciones, calculadora, planilla, pedido, cuenta
comercial, documentos industriales y la cotización industrial. Normalmente es invisible: solo pide un desafío si
Cloudflare duda. Se activa con las **dos** claves; con una sola, el panel lo marca como *INCOMPLETA* y se ignora.

1. Crea primero el proyecto en Vercel (ver abajo) y anota su dominio `….vercel.app`.
2. *Cloudflare → Turnstile → Add widget*: nombre «energysolec-web»; hostnames `energysolec.com`,
   `www.energysolec.com` y el dominio `….vercel.app`; modo **Managed**.
3. En Vercel, entorno **Production**: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = *Site Key* y `TURNSTILE_SECRET_KEY` = *Secret
   Key* (marcada **Sensitive**).
4. *Deployments → … → Redeploy*: la clave pública se incorpora al compilar, así que hace falta un despliegue nuevo.
5. Comprueba en `/admin/configuracion` que «Protección anti-spam (Turnstile)» diga **activa**, y envía un formulario
   desde `/contacto`.

## ¿Cuándo pulsar «Crear proyecto» en Vercel?

Cuando `04` muestre **✓ Lista para el primer despliegue** y la URL de Auth confirme `"disable_signup":true`. Las
variables están solo en *Production*: las vistas previas (otras ramas) no tendrán base de datos y su compilación
fallará. Eso no afecta al sitio.
