# Plan de implementación por fases

## Fase 1 — Núcleo comercial ✅ entregada en este código

| Módulo | Estado | Verificación |
|---|---|---|
| Esquema de base de datos (32 tablas), RLS por rol (57 políticas), auditoría, buckets | ✅ | Migraciones ejecutadas en PostgreSQL 16; restricciones de pago y de productos de ejemplo probadas |
| Motor solar (PVGIS-NSRDB, PVGIS-ERA5, NASA POWER, respaldo regional, pérdidas, dimensionamiento, baterías) | ✅ | 20 pruebas unitarias |
| Motor financiero (tarifas por bloques y demanda, inversa factura→kWh, VAN, TIR, retornos, LCOE, 3 escenarios, cuota) | ✅ | Pruebas unitarias |
| Calculadora rápida y profesional (12 meses, tarifa, demanda, % diurno, sitio, baterías, respaldo, presupuesto) | ✅ | Prueba de extremo a extremo en navegador |
| Captación obligatoria con correo, privacidad y autorización comercial separada (LOPDP) | ✅ | Validaciones y consentimientos guardados |
| Resultados, PDF de marca, envío por correo, aviso comercial, oportunidad en CRM, visita técnica, WhatsApp | ✅ | PDF generado y revisado; correo en cola sin proveedor configurado |
| Tienda: catálogo, filtros, comparador, ficha, carrito, pedido con número único guardado antes de WhatsApp | ✅ | Prueba de extremo a extremo |
| Formularios de cotización, contacto, servicios y financiamiento → CRM | ✅ | Prueba de extremo a extremo |
| Páginas: inicio, 3 unidades de negocio, proyectos con filtros y mapa, servicios (15), marcas, financiamiento con simulador, nosotros, blog, contacto, privacidad | ✅ | Revisión en escritorio y móvil (390 px sin desborde) |
| Panel: login, roles, dashboard gerencial, CRM con seguimiento, pedidos con verificación de pagos, parámetros versionados, tarifas, indicadores, exportación CSV | ✅ | Permisos probados con Ventas y Gerencia |
| SEO técnico: metadatos, sitemap, robots, Schema.org (Organization, Product), URLs amigables | ✅ | |
| Consentimiento de cookies + Consent Mode v2 + GTM/GA4/Meta Pixel + UTM | ✅ | |
| Seguridad: validación en servidor, límite de solicitudes, honeypot, Turnstile opcional, cabeceras, tokens HMAC | ✅ | |

## Fase 2 — Administración completa y automatización (estimado: 3–4 semanas)

- ✅ Panel de productos: CRUD con precios por nivel y promociones, inventario, imágenes y ficha técnica en `public-media` (`/admin/productos`).
- ✅ Panel de proyectos: CRUD con portada y galería, banderas de autorización, coordenadas con vista previa en el mapa (`/admin/proyectos`) y migración `0003` de privacidad.
- ✅ Panel de contenido: bloques editables con texto base, borrador/publicado e imágenes (`/admin/contenido`); portada, soluciones y «Nosotros» leen de ahí.
- ✅ Panel de marcas (relación comercial con respaldo privado y vigencia, documentos públicos; migración `0004`) y de servicios (catálogo base + contenido validado).
- ✅ Blog con editor Markdown, vista previa, imágenes, programación, categorías, SEO editable y datos estructurados `BlogPosting`.
- ✅ Usuarios y roles: invitación por enlace de un solo uso, activación con contraseña propia, desactivación con reasignación de leads, matriz de permisos.
- ✅ Identidad gráfica: colores con control de contraste, logos y favicon desde el panel.
- Pantallas del panel para datos de contacto e integraciones. Hoy se gestionan desde Supabase Studio.
- ✅ Formularios guiados para parámetros y tarifas, con reglas de coherencia, vista previa de factura y validación por Gerencia.
- ✅ Carga de planilla eléctrica en PDF o foto con lectura por IA (API de Claude) y revisión y confirmación del cliente antes de calcular; planilla visible en la ficha del lead (migración `0005`). Requiere `ANTHROPIC_API_KEY`; pendiente: depurar las planillas no confirmadas con la tarea programada.
- Flujo industrial con carga de documentos (curva de carga, planos).
- ✅ Cuentas de instaladores y distribuidores: solicitud con RUC, aprobación por Gerencia, acceso propio y precios de su nivel en tienda, carrito y pedidos (migración `0006`).
- Recordatorios automáticos de seguimiento y reintento de la cola de correos (tarea programada).
- Caché del recurso solar por celda (tabla creada) y prueba en vivo de PVGIS y NASA POWER desde producción.
- Pruebas automatizadas de extremo a extremo (Playwright) en CI.

## Fase 3 — Escala (estimado: 3–4 semanas)

- Pagos en línea con pasarelas compatibles con Ecuador (Payphone, Kushki, Datafast) y conciliación de transferencias.
- WhatsApp Cloud API con plantillas aprobadas y bandeja compartida.
- API para CRM externos (HubSpot, Zoho) y webhooks.
- Versión en inglés.
- Portal del cliente con monitoreo de su sistema.
