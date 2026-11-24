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
```

Panel en desarrollo: `DEV_ADMIN_PASSWORD=algo npm run dev` → `/admin/login`, permite elegir cualquier rol de prueba.

## Stack y estructura

Next.js 15 App Router · TypeScript estricto · Tailwind 3 · Supabase (Postgres + Auth + Storage) · Zod · @react-pdf/renderer · Resend.

- `src/lib/engine/` — motores de cálculo **puros y probados**. Cualquier cambio requiere actualizar `engine.test.ts`. Metodología en `docs/MOTOR_DE_CALCULO.md`.
- `src/lib/data/store.ts` — única puerta a los datos. Interfaz `Store` con dos implementaciones (Supabase y archivo local). Si agregas una operación, impleméntala en **ambas**.
- `src/lib/auth.ts` — `PERMS` (matriz de roles), `requireStaff(perm)`. Debe mantenerse en espejo con la RLS de `supabase/migrations/0002_rls.sql`.
- `src/app/api/*` — escrituras públicas: validar con Zod (`src/lib/schemas.ts`), `guard()` para el límite de solicitudes, `verifyHuman()` para el anti-spam.
- `src/app/admin/actions.ts` — server actions del panel; cada una empieza con `requireStaff`.
- `supabase/migrations/` — nunca edites una migración ya aplicada en producción; crea la siguiente (`0004_*.sql`).
- Modo desarrollo: React 19 envía al navegador el valor de cada E/S asíncrona que espera un componente de servidor (para DevTools). Por eso el almacén local lee su archivo con `readFileSync`. En producción no ocurre, pero no conectes `next dev` a datos reales sensibles.
- `src/content/segments.ts` — textos base de las unidades de negocio y la lista de servicios. `src/content/blocks.ts` — bloques editables desde el panel y su texto base.

## Reglas de negocio NO negociables

1. **Nada inventado.** No se publican estadísticas, precios, productos, testimonios, certificaciones ni relaciones con marcas sin respaldo. El contenido provisional se marca de forma visible (`placeholder-badge`, `is_placeholder`).
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
- Tokens en `src/app/globals.css` (`--brand`, `--brand-dark`, `--accent`). Clases de componentes (`.btn-*`, `.card`, `.input`) dentro de `@layer components`; si las sacas de ahí, pisan a las utilidades.
- Tipografía Archivo (`font-display` = ancho 125 %, en eco del logotipo).
- Logos: `public/brand/logo.png`, `logo-dark.png`, `favicon.png`.
- Estilo: minimalista corporativo, espacios amplios, animaciones sutiles que respetan `prefers-reduced-motion`. Referentes: Siemens, Tesla Energy, SMA, sin copiarlos.

## Convenciones

- Textos de interfaz en español de Ecuador, con "tú" para el cliente.
- Componentes de servidor por defecto; `'use client'` solo cuando haga falta.
- Toda página nueva necesita `metadata` con título, descripción y `canonical`, y una entrada en `src/app/sitemap.ts` si es pública.
- Accesibilidad: etiquetas en todos los campos, `role="alert"` en errores, foco visible, sin desborde horizontal a 390 px.
- Verifica los cambios visuales en el navegador (escritorio 1440 px y móvil 390 px) antes de darlos por terminados.

## Siguiente trabajo (Fase 2, en orden sugerido)

1. ✅ Panel: CRUD de productos, con precios por nivel, inventario, imágenes y ficha técnica en el bucket `public-media` (`/admin/productos`; lógica pura y pruebas en `src/lib/services/catalog.ts`; en desarrollo los archivos van a `.data/media/` y se sirven por `/api/dev-media`).
2. ✅ Panel: CRUD de proyectos, con galería, banderas de autorización y coordenadas para el mapa (`/admin/proyectos`; enmascarado y validación en `src/lib/services/projects.ts`; migración `0003_project_privacy.sql`).
3. ✅ Panel: bloques de contenido (`/admin/contenido`). Registro de bloques, campos y texto base en `src/content/blocks.ts`; las páginas leen con `getBlock(page, slot)` (`src/lib/content.ts`), que cae al texto base campo a campo. Para un bloque nuevo: regístralo en `BLOCKS` y léelo con `getBlock`; la prueba exige que su texto base sea válido.
4. Panel: marcas (con documento de respaldo), servicios, blog, usuarios y roles, identidad gráfica (`site_settings.brand` → variables CSS).
5. Formularios guiados por campo para parámetros y tarifas (hoy son editores JSON validados con Zod).
6. Carga de planilla en PDF o foto con extracción por IA y confirmación del cliente (`bill_uploads`, bucket `bills`).
7. Cuentas de instaladores y distribuidores con precios diferenciados (`trade_accounts`, la RLS ya existe).
8. Recordatorios de seguimiento y reintento de `outbound_messages` (cron de Vercel o Supabase).
9. Caché del recurso solar en `solar_resource_cache` y verificación en vivo de PVGIS y NASA POWER.
10. Pruebas de extremo a extremo con Playwright en CI.

## Datos pendientes del cliente

Ver `docs/DATOS_REQUERIDOS.md`: tarifas ARCONEL, precios por kWp, IVA, régimen de excedentes, fotos, fichas de proyectos con autorización, catálogo real y documentos de las marcas.
