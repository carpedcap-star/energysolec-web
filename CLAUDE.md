# CLAUDE.md — Plataforma web Energy Solutions Ecuador

Contexto para Claude Code. Léelo completo antes de cambiar código.

## Qué es

Plataforma corporativa de **Energy Solutions Ecuador S.A.S.** (www.energysolec.com): sitio premium, calculadora solar con captación de leads y PDF, tienda con pedidos por WhatsApp, CRM y panel con roles. Idioma: español (es-EC). Moneda: USD. La Fase 1 está construida y probada; ver `docs/PLAN_POR_FASES.md`.

La especificación original completa del cliente está en `docs/ESPECIFICACION_ORIGINAL.md`. Ante cualquier duda de alcance, manda esa especificación.

## Comandos

```bash
npm install
npm run dev          # http://localhost:3000 — sin Supabase usa .data/dev-db.json
npm test             # vitest: motor solar/financiero y tienda (deben pasar siempre)
npm run typecheck
npm run build        # con ALLOW_DEV_STORE=true si no hay Supabase
npm run e2e          # Playwright, escritorio 1440 px y móvil 390 px (levanta su propio next dev en :3100)
npm run test:live    # PVGIS y NASA POWER en vivo (red externa; no corre en npm test)
npm run test:supabase   # almacén contra Supabase local real (supabase start; ver docs/SUPABASE.md)
npm run e2e:supabase    # recorrido en el navegador contra Supabase local
```

CI (`.github/workflows/ci.yml`): en cada push a `main` y en cada PR corre pruebas, tipos, compilación y la suite e2e; el reporte de Playwright queda como artefacto si falla. `fuentes-solares.yml` corre `test:live` cada lunes y a mano.

Panel en desarrollo: `DEV_ADMIN_PASSWORD=algo npm run dev` → `/admin/login`, permite elegir cualquier rol de prueba (correo vacío) o entrar con un usuario creado en `/admin/usuarios` (sin proveedor de correo, el enlace de activación se muestra en pantalla).

## Stack y estructura

Next.js 15 App Router · TypeScript estricto · Tailwind 3 · Supabase (Postgres + Auth + Storage) · Zod · @react-pdf/renderer · Resend.

- `src/lib/engine/` — motores de cálculo **puros y probados**. Cualquier cambio requiere actualizar `engine.test.ts`. Metodología en `docs/MOTOR_DE_CALCULO.md`.
- `src/lib/data/store.ts` — única puerta a los datos. Interfaz `Store` con dos implementaciones (Supabase y archivo local). Si agregas una operación, impleméntala en **ambas**.
- `src/lib/auth.ts` — `PERMS` (matriz de roles), `requireStaff(perm)`. Debe mantenerse en espejo con la RLS de `supabase/migrations/0002_rls.sql`.
- `src/app/api/*` — escrituras públicas: validar con Zod (`src/lib/schemas.ts`), `guard()` para el límite de solicitudes, `verifyHuman()` para el anti-spam.
- `src/app/admin/actions.ts` — server actions del panel; cada una empieza con `const staff = await requireStaff(…)` y usa `getStoreAs(staff.id)`, nunca `getStore()`: así la base atribuye el cambio (auditoría) y aplica reglas como la verificación de pagos (`app_actor()`, migración 0010; la cabecera `x-ese-actor` solo vale con la clave de servicio).
- `supabase/migrations/` — nunca edites una migración ya aplicada en producción; crea la siguiente (`0011_*.sql`). En un CHECK sobre arreglos usa `cardinality()`, nunca `array_length()` (con un arreglo vacío da null y el CHECK no falla).
- Almacén de desarrollo: su estado vive en `globalThis` (no en variables de módulo) porque `next dev` instancia `store.ts` una vez por ruta compilada; con variables de módulo, cada instancia pisaba las escrituras de las demás.
- Modo desarrollo: React 19 envía al navegador el valor de cada E/S asíncrona que espera un componente de servidor (para DevTools). Por eso el almacén local lee su archivo con `readFileSync`. En producción no ocurre, pero no conectes `next dev` a datos reales sensibles.
- Contenido escrito por el personal (blog): renderízalo con `renderMarkdown` de `src/lib/markdown.tsx`. No agregues `dangerouslySetInnerHTML` con texto del panel (salvo JSON-LD con `<` escapado).
- `src/content/segments.ts` — textos base de las unidades de negocio y la lista de servicios. `src/content/blocks.ts` — bloques editables desde el panel y su texto base.

## Reglas de negocio NO negociables

1. **Nada inventado.** No se publican estadísticas, precios, productos, testimonios, certificaciones ni relaciones con marcas sin respaldo. El contenido provisional se marca de forma visible (`placeholder-badge`, `is_placeholder`). Los documentos de respaldo (contratos, cartas de fabricantes) van al bucket privado `private-docs`, nunca a `public-media`.
2. Indicadores de portada: solo `verified=true` y con `source_note`.
3. Proyectos: nombre del cliente, ubicación en el mapa y cifras financieras solo con sus banderas `*_authorized`; el testimonio solo con `testimonial_verified`. Todo lo público sale por `toPublicProject` (y en la base, por la vista `projects_public`): nunca envíes un `ProjectRecord` a un componente público.
4. Calculadora:
   - Pérdidas de sistema aplicadas una sola vez: las fuentes se piden con `loss=0`.
   - Excedentes valen $0 salvo que `exportCompensation` esté configurado.
   - El cargo por demanda no se reduce por defecto.
   - La factura nunca llega a cero.
   - Se adopta el recurso solar más bajo entre PVGIS-NSRDB (API v5_2), PVGIS-ERA5 (API v5_3) y NASA POWER.
5. Leads (LOPDP):
   - El correo es obligatorio.
   - Privacidad y autorización comercial van **separadas**; el estudio se entrega sin exigir la autorización comercial.
   - Los envíos de marketing requieren consentimiento.
6. Pedidos:
   - Se guardan antes de redirigir a WhatsApp.
   - Precios recalculados en servidor.
   - "Pagado" exige referencia verificada por Gerencia; la base de datos lo impone con una restricción `check`.
7. Claves privadas solo en servidor. Nunca `NEXT_PUBLIC_` para secretos. Nada de escrituras desde el navegador directo a Supabase.

## Identidad visual

- Colores del logo: amarillo `#FDC913` (acciones, énfasis), grafito `#282626` (base oscura premium), azul `#0082AA` (datos, enlaces, gráficos).
- No uses amarillo para texto sobre fondo blanco: el contraste es insuficiente.
- Colores y logos se editan en `/admin/identidad` (el layout inyecta las variables en `<html>`). Los valores por defecto de `globals.css` deben coincidir con `DEFAULT_COLORS` (lo verifica una prueba). Usa siempre las clases `brand`, `brand-dark` y `brand-accent`, nunca el hexadecimal fijo, y los logos con `getIdentity()` + `BrandLogo`, nunca `/brand/*.png` directo.
- El azul del logo (`#0082AA`) da 4,4:1 sobre blanco: válido para texto grande, justo por debajo del 4,5:1 recomendado para texto pequeño.
- Tokens en `src/app/globals.css` (`--brand`, `--brand-dark`, `--accent`). Clases de componentes (`.btn-*`, `.card`, `.input`) dentro de `@layer components`; si las sacas de ahí, pisan a las utilidades.
- Tipografía Archivo (`font-display` = ancho 125 %, en eco del logotipo).
- Logos: `public/brand/logo.png`, `logo-dark.png`, `favicon.png`.
- Estilo: minimalista corporativo, espacios amplios, animaciones sutiles que respetan `prefers-reduced-motion`. Referentes: Siemens, Tesla Energy, SMA, sin copiarlos.

## Convenciones

- Textos de interfaz en español de Ecuador, con "tú" para el cliente.
- Componentes de servidor por defecto; `'use client'` solo cuando haga falta.
- Toda página nueva necesita `metadata` con título, descripción y `canonical`, y una entrada en `src/app/sitemap.ts` si es pública.
- Accesibilidad: etiquetas en todos los campos, `role="alert"` en errores, foco visible, sin desborde horizontal a 390 px.
- Formularios largos del panel: envío manual (`onSubmit` + `preventDefault` + `startTransition`), no `<form action>`: React reinicia los campos al terminar la acción y se perdería lo escrito ante un error.
- Contenedores `overflow-x-auto` siempre con `relative`: si no, las etiquetas `sr-only` (absolutas) se escapan y desbordan la página en móvil.
- Títulos con texto editable: `[overflow-wrap:anywhere]` (no `hyphens-auto`, que parte palabras que sí caben) y `min-w-0` en columnas de grid; un `overflow-hidden` puede ocultar texto recortado sin que la página desborde.
- Verifica los cambios visuales en el navegador (escritorio 1440 px y móvil 390 px) antes de darlos por terminados.

## Siguiente trabajo (Fase 2, en orden sugerido)

1. ✅ Panel: CRUD de productos, con precios por nivel, inventario, imágenes y ficha técnica en el bucket `public-media` (`/admin/productos`; lógica pura y pruebas en `src/lib/services/catalog.ts`; en desarrollo los archivos van a `.data/media/` y se sirven por `/api/dev-media`).
2. ✅ Panel: CRUD de proyectos, con galería, banderas de autorización y coordenadas para el mapa (`/admin/proyectos`; enmascarado y validación en `src/lib/services/projects.ts`; migración `0003_project_privacy.sql`).
3. ✅ Panel: bloques de contenido (`/admin/contenido`). Registro de bloques, campos y texto base en `src/content/blocks.ts`; las páginas leen con `getBlock(page, slot)` (`src/lib/content.ts`), que cae al texto base campo a campo. Para un bloque nuevo: regístralo en `BLOCKS` y léelo con `getBlock`; la prueba exige que su texto base sea válido.
4. Panel: ✅ marcas (`/admin/marcas`: relación comercial solo con respaldo verificado y vigente vía `toPublicBrand`; respaldo en el bucket privado `private-docs`, servido por `/admin/documentos/[id]`; migración `0004_brand_backing.sql`) · ✅ servicios (`/admin/servicios`: catálogo base de `src/content/segments.ts` + tabla `services`, en `src/lib/services/service-catalog.ts`) · ✅ blog (`/admin/blog`: Markdown con editor y vista previa, programación, SEO y `BlogPosting`; el Markdown se renderiza con `src/lib/markdown.tsx` a elementos de React, nunca HTML crudo) · ✅ usuarios y roles (`/admin/usuarios`: alta por invitación con enlace de un solo uso, sin contraseñas compartidas; nunca queda el sistema sin superadministrador; desactivar corta el acceso al instante y permite reasignar leads; reglas en `src/lib/services/users.ts`) · ✅ identidad gráfica (`/admin/identidad`: colores con control de contraste y logos; `site_settings.brand` → variables CSS en `<html>`, favicon, `theme-color` y JSON-LD; lógica en `src/lib/services/identity.ts`, lectura en `src/lib/identity.ts`).
5. ✅ Formularios guiados para parámetros (`/admin/parametros`: registro de campos y reglas de coherencia en `src/lib/services/params-form.ts`; solo Gerencia valida, cualquier otro guardado queda provisional) y tarifas (`/admin/tarifas`: bloques continuos por construcción, vista previa de factura con `monthlyBill`, código único, no se desactiva la última de un segmento; en `src/lib/services/tariff-form.ts`).
6. ✅ Carga de planilla (`/api/bill`): validación y paso a datos de la calculadora en `src/lib/services/bill.ts` (puro y probado), lectura con la API de Claude en `bill-extractor.ts` (salida estructurada Zod, solo servidor, sin datos personales); el cliente revisa y confirma antes de calcular y `/api/study` vincula la carga con `billUploadId`. Archivo en el bucket privado `bills`, visible en la ficha del lead (permiso `bills`, `/admin/planillas/[id]`); migración `0005_bill_uploads.sql`. Sin `ANTHROPIC_API_KEY` la opción no se muestra. Máx. 4 MB por el límite de cuerpo de Vercel (el navegador reduce las fotos). Las cargas sin lead se borran a los 7 días (punto 8).
7. ✅ Cuentas comerciales: solicitud pública en `/profesionales` (`/api/trade/apply`, RUC validado), revisión en `/admin/cuentas` (permiso `trade`; aprobar o suspender solo `trade_approve` = Gerencia/superadmin, impuesto también por el disparador de `0006_trade_accounts.sql`), acceso del cliente en `/cuenta` (sesión propia en `src/lib/trade-auth.ts`, separada del panel, releída en cada petición). Precios por nivel con `unitPriceFor`/`productPricing` en `src/lib/services/trade.ts` (sin precio de nivel o mayor al final → precio final). El nivel sale SOLO de la sesión: `getProductsByIds(ids, tier)` en `/api/orders` y `/api/cart/prices`; la base exige `trade_account_id` si `price_tier <> 'final'`. Tienda, ficha y carrito son dinámicos (sin caché compartida de precios de nivel); el JSON-LD público lleva siempre el precio final.
8. ✅ Tareas programadas en `/api/cron` (GET con `Authorization: Bearer CRON_SECRET`; `vercel.json` la corre a diario 07:30 de Ecuador; `?tareas=mensajes` sirve para reintentar más seguido desde otro programador) y botón en `/admin/mensajes` (permiso `messages`). Lógica pura en `src/lib/services/followup.ts`, ejecución en `cron-jobs.ts`. Correos: `sendEmail` guarda el cuerpo de los que fallan para reintentar (5 min, 30 min, 2 h, 12 h; vencen por plantilla), reserva con `claim_outbound` (`FOR UPDATE SKIP LOCKED`), los PDF se regeneran con `attachmentRefs`; los correos con enlaces de acceso NUNCA se guardan (`isRetryable`). Recordatorios: resumen diario por asesor (actividades de hoy o vencidas y leads nuevos sin contacto > 24 h), una sola vez por actividad (`next_activity_reminded_for`); sin asesor → `SALES_NOTIFY_EMAIL`. Gerencia asigna asesor desde la ficha del lead (aviso por correo). Fechas del CRM en hora de Ecuador (`parseEcLocal`/`fmtEc`: el servidor corre en UTC). Depuración: planillas sin lead > 7 días y límites de solicitudes viejos. Migración `0007_followups.sql`.
9. ✅ Recurso solar (`src/lib/engine/resource.ts`): caché por celda de 0,05°, inclinación y fuente en `solar_resource_cache` (180 días; migración `0008`; adaptador `solarResourceCache()` del almacén), consulta siempre con coordenadas exactas, dato vencido como respaldo si una fuente falla, validación de respuestas (−999, rangos, 12 meses), un reintento ante error de red. Verificación en vivo: tarea diaria «fuentes» y `/admin/recurso-solar` (permiso `params`); `npm run test:live` contra las API reales (en este entorno con proxy necesita `NODE_USE_ENV_PROXY=1`, ya incluido en el script). Pruebas del motor con respuestas reales en `src/lib/engine/fixtures/`. Las notas del recurso ahora llegan al estudio, y el respaldo regional se advierte.
10. ✅ Pruebas de extremo a extremo (`e2e/`, `playwright.config.ts`): sitio público (páginas, calculadora, pedido), matriz de roles del panel, cuentas comerciales, tareas y recordatorios, planillas. El servidor usa su propia base `.data/e2e-db.json` (`DEV_DB_FILE`), sembrada por `e2e/seed.mjs` desde `.data/dev-db.json`: nunca toca el archivo versionado. Corren en serie; cada proyecto tiene su IP de prueba (`x-forwarded-for` solo hacia el servidor) para no compartir límites de solicitudes; los escenarios de datos de una sola vez corren solo en escritorio. `test` de `e2e/helpers.ts` hace fallar cualquier prueba con errores de consola. Al agregar una función, agrega su escenario aquí (y sus datos en `seed.mjs`).
11. ✅ Contacto e integraciones (`/admin/configuracion`, permiso `settings` = superadmin y marketing, como la RLS de `site_settings`): contacto público (`contact`), correo de avisos (`notifications`, privado) e IDs públicos de GTM/GA4/Meta Pixel (`integrations_public`, formato estricto porque van dentro de scripts). Lógica pura en `src/lib/services/site-settings.ts`; lectura con `getSiteSettings()`/`getContact()`/`salesNotifyEmail()` (`src/lib/site-settings.ts`) y en cliente con `useSiteContact()`. `SITE` ya no tiene WhatsApp, correo ni ciudad: nunca los escribas fijos; `waLink(texto, teléfono)` exige el número. Las claves secretas siguen solo en variables de entorno; el panel solo muestra si están activas.
12. ✅ Cotización industrial (`/cotizacion-industrial`; botón desde `/soluciones/industrial`): soluciones de interés, empresa, datos energéticos, contacto y documentos (planillas, curva de carga, planos). Cada documento se sube por separado a `/api/industrial/upload` (≤ 4 MB por el límite de Vercel; tipo por firma: PDF, imágenes, .xlsx, CSV de texto, DWG; nunca HTML/SVG) al bucket privado `project-docs`, y `/api/industrial` crea el lead (fuente `cotizacion_industrial`) y la solicitud, vinculando solo documentos libres y de menos de 2 h. En el panel: `/admin/industrial` (permiso `industrial`; Ventas, sus leads y los sin asignar) y, en la ficha del lead, documentos (`/admin/industrial/documentos/[id]`: PDF/imagen en línea, el resto como descarga, `nosniff` y CSP) y evaluación de ingeniería (`industrial_eval`; cerrar exige criterio, también en la base). Huérfanos > 24 h se borran en la tarea diaria. Lógica en `src/lib/services/industrial.ts`; migración `0009` (corrige además los CHECK de 0008: `array_length('{}')` es null, usa `cardinality`).
13. ✅ Verificación contra Supabase real: `supabase/config.toml` (registros abiertos desactivados en `[auth]`; ¡`[auth.email] enable_signup` es el proveedor de correo y debe quedar activo!), `src/lib/data/store.supabase.test.ts` y `e2e-supabase/`, y trabajo de CI con `supabase start`. Encontró y corrigió (migración 0010): el pago verificado fallaba siempre y la auditoría guardaba actor null, porque el servidor escribe con la clave de servicio. Guía en `docs/SUPABASE.md`.

## Datos pendientes del cliente

Ver `docs/DATOS_REQUERIDOS.md`: tarifas ARCONEL, precios por kWp, IVA, régimen de excedentes, fotos, fichas de proyectos con autorización, catálogo real y documentos de las marcas.
