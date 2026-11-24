# Arquitectura técnica

## Visión general

```
Navegador ──► Next.js (Vercel)
               ├─ Páginas públicas (SSR/ISR)          ──► Supabase (lectura pública vía RLS)
               ├─ Rutas API (validación Zod, límite    ──► Supabase (service role, solo servidor)
               │  de solicitudes, anti-spam)           ──► PVGIS (JRC) · NASA POWER
               │                                       ──► Resend (correo) · WhatsApp Cloud API
               └─ Panel /admin (sesión Supabase Auth,  ──► Supabase (rol verificado en servidor + RLS)
                  rol verificado en servidor)
```

**Principios**

- Ninguna clave privada llega al navegador. La `service role` de Supabase solo existe en el servidor.
- El navegador nunca escribe directamente en la base de datos: leads, estudios y pedidos pasan por rutas API que validan con Zod, limitan solicitudes por IP (hash, no IP en claro), comprueban el honeypot y, si está configurado, Cloudflare Turnstile.
- Los precios del carrito se recalculan siempre en servidor desde el catálogo.
- Doble barrera de permisos: el servidor comprueba el rol (`src/lib/auth.ts`) y la base de datos lo vuelve a exigir con RLS (`0002_rls.sql`).
- Reglas de negocio críticas impuestas por la base de datos, no solo por la interfaz: un pedido no puede pasar a *Pagado* sin referencia, verificador y fecha; un producto de ejemplo no puede publicarse; solo Gerencia puede registrar la verificación de pagos.

## Arquitectura de información

```
Inicio
├─ Soluciones ─ Residencial · Comercial · Industrial      (formulario de cotización por segmento)
├─ Proyectos ─ filtros + mapa (solo ubicaciones autorizadas) → ficha de proyecto
├─ Calculadora solar ─ asistente 4 pasos → pantalla de registro → resultados → PDF / visita / WhatsApp
├─ Tienda solar ─ catálogo con filtros y comparador → producto → carrito → pedido → WhatsApp
├─ Servicios ─ 15 servicios → página con formulario
├─ Marcas y tecnología
├─ Financiamiento ─ modelos + simulador de cuota + precalificación
├─ Nosotros · Blog · Contacto · Política de privacidad
└─ Botones permanentes: Cotizar mi proyecto · Calcular mi ahorro (≥1536 px; en el menú siempre) · WhatsApp flotante · Carrito
```

## Base de datos (32 tablas)

| Dominio | Tablas |
|---|---|
| Usuarios y auditoría | `profiles` (rol), `audit_log` (trigger en 15 tablas administrativas) |
| Contenido | `site_settings`, `content_blocks`, `media`, `company_stats`, `seo_meta`, `brands`, `brand_assets`, `services`, `blog_posts` |
| Proyectos | `projects` (con banderas de autorización: nombre de cliente, ubicación, cifras financieras), `project_media` |
| Catálogo | `product_categories`, `products`, `product_prices` (precio por nivel: final, instalador, distribuidor), `product_relations`, `trade_accounts` |
| CRM | `leads`, `lead_activities`, `consents` (LOPDP, por finalidad y con versión de política) |
| Calculadora | `tariffs`, `calc_params` (versionados), `solar_resource_cache`, `solar_studies`, `bill_uploads` |
| Pedidos | `orders` (número ESE-P-AAAA-NNNNNN), `order_items`, `order_status_history` |
| Operación | `outbound_messages` (cola de correo/WhatsApp con estado), `events` (métricas agregadas), `rate_limits` |

Funciones: `current_role_is()`, `next_advisor()` (reparto equitativo), `hit_rate_limit()`, triggers de auditoría, historial de estados y bitácora de cambios de etapa.

## Integraciones

| Integración | Estado | Notas |
|---|---|---|
| PVGIS-NSRDB (API 5.2) y PVGIS-ERA5 (API 5.3) | Implementada | Para Ecuador: NSRDB cubre América 60°N–20°S; ERA5 es reanálisis global. |
| NASA POWER (climatología) | Implementada | Segunda fuente independiente. Se adopta el valor menor. |
| Resend (correo transaccional) | Implementada | Sin clave, los correos quedan en `outbound_messages` como pendientes. |
| WhatsApp | Enlace `wa.me` implementado; Cloud API opcional | La Cloud API requiere cuenta Meta Business verificada. |
| GA4 / GTM / Meta Pixel | Implementados con Consent Mode v2 | Denegados por defecto hasta que el usuario acepte. |
| Cloudflare Turnstile | Implementado (opcional) | Se activa con las variables de entorno. |
| Lectura de planillas (OCR/IA) | Fase 2 | Tabla `bill_uploads` y bucket privado `bills` ya creados. |
| Pasarela de pagos | Fase 3 | El modelo de pedidos ya separa *Confirmado* de *Pagado* con verificación. |

## Seguridad

HTTPS + HSTS · cabeceras `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` · cookies de sesión `httpOnly` · tokens HMAC para el acceso a estudios y PDF · comparación en tiempo constante · exportación CSV protegida contra inyección de fórmulas · `noindex` en panel, API y estudios · buckets privados para planillas y reportes · IP almacenada solo como hash con sal.

## Internacionalización

Columnas `*_en` en contenido y textos en archivos de contenido separados. La moneda es USD con formato `es-EC`.
