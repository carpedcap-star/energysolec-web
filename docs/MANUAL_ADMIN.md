# Manual de administración

Acceso: `https://www.energysolec.com/admin/login` con el usuario que te asigne el Superadministrador.

## Roles

| Sección | Superadmin | Gerencia | Marketing | Ventas | Ingeniería | Compras |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CRM (ver) | ✓ | ✓ | ✓ | sus leads y sin asignar | ✓ | |
| CRM (editar) | ✓ | ✓ | | sus leads | | |
| Pedidos | ✓ | ✓ | | ✓ | | ✓ |
| Verificar pagos | ✓ | ✓ | | | | |
| Parámetros de cálculo y tarifas | ✓ | ✓ | | | ✓ | |
| Indicadores de inicio | ✓ | ✓ | | | | |
| Exportar CSV | ✓ | ✓ | ✓ | | | |

## CRM

- Cada lead entra con su fuente (calculadora, tienda, contacto, cotización, servicio, financiamiento), su campaña (UTM) y sus consentimientos.
- Los leads se asignan automáticamente al asesor activo con menos leads abiertos. Un asesor de Ventas que abre un lead sin asignar lo toma.
- Para registrar el seguimiento, abre el lead → elige la etapa → tipo de actividad y detalle → fecha de la próxima actividad → **Guardar**. Las actividades vencidas aparecen en rojo en la lista.
- Etapas: Nuevo → Contactado → Calificado → Visita técnica → Cotización enviada → Negociación → Ganado / Perdido. El primer cambio desde *Nuevo* registra el tiempo de respuesta.
- **Comunicaciones promocionales:** solo a quienes marcaron la autorización comercial. El sistema bloquea los envíos de marketing sin consentimiento.

## Pedidos

1. El cliente registra el pedido en la web; el pedido se guarda **antes** de abrir WhatsApp.
2. El asesor confirma disponibilidad, precio final, forma de pago, entrega e instalación, y actualiza el estado.
3. **Pagado** y los estados posteriores exigen que Gerencia ingrese una referencia verificable (número de transferencia, voucher). La base de datos rechaza el cambio sin ella.

## Parámetros de cálculo

**/admin/parametros** muestra la versión activa. Al guardar se crea una versión nueva y los estudios siguientes la usan; los anteriores conservan la suya. Cuando Gerencia valide los valores, cambia `"isPlaceholder": true` a `false` para quitar el aviso de valores provisionales.

Campos clave: `pricing.pvTiers` (USD/kWp sin IVA por tramo), `pricing.batteryUsdPerKwh`, `pricing.vatOnCapex`, `financial.discountRate`, `financial.exportCompensation` (`none` | `net_balance` | `fixed_price`), `financial.scenarios`, `technical.gridCo2KgPerKwh`.

## Tarifas eléctricas

**/admin/tarifas**: un registro por tarifa y distribuidora. Los bloques de energía se cargan como `{ "from_kwh", "to_kwh" (null = sin límite), "usd_per_kwh" }`. La fuente es obligatoria (resolución ARCONEL, fecha y distribuidora). Marca `is_placeholder: false` una vez validada.

## Indicadores de la portada

**/admin/indicadores**: ingresa el valor real, su unidad y **la fuente del dato**, y marca *Verificado*. Solo los indicadores verificados aparecen en el contador de inicio.

## Productos e inventario

**/admin/productos** (roles *superadmin* y *compras*): lista con búsqueda y filtros (publicados, borradores, de ejemplo, sin stock), alta, edición y eliminación.

- **Precios por nivel** (cliente final, instalador, distribuidor), en USD sin IVA. El precio final es obligatorio; 0 se muestra como «Precio a consultar». Un nivel vacío no se ofrece. La promoción debe ser menor al precio y vale hasta el final del día indicado (hora de Ecuador).
- **Inventario**: «Disponible» exige stock mayor a 0; «Agotado» exige stock 0.
- **Imágenes** (JPG, PNG o WebP, hasta 5 MB, máximo 12; la primera es la principal) y **ficha técnica** (PDF, hasta 15 MB) se guardan en el bucket `public-media` y se registran en `media`. El servidor verifica el contenido real del archivo, no solo su extensión.
- Un **producto de ejemplo** no puede publicarse. Desmárcalo solo cuando los datos sean reales y verificados.
- Un producto que figura en pedidos no se elimina: despublícalo para conservar el historial.

## Proyectos

**/admin/proyectos** (roles *superadmin*, *marketing* e *ingeniería*): lista con columna de autorizaciones, alta, edición y eliminación.

- Cada dato sensible tiene su autorización: **nombre del cliente**, **punto en el mapa** (coordenadas), **ahorro anual** y **testimonio** (verificado). Sin ella, el dato se guarda pero no se publica. El recuadro «Qué verá el público» lo muestra antes de guardar.
- Si el cliente no autorizó su nombre, el **título y la URL** no pueden contenerlo: usa un título genérico («Empacadora en Guayas, 250 kWp»).
- Coordenadas: pega «lat, lng» desde Google Maps en el campo Latitud. Deben estar dentro del Ecuador (incluye Galápagos).
- Fotos: una portada y hasta 20 fotos de galería (JPG, PNG o WebP, 5 MB). La portada del sitio muestra los 3 destacados más recientes.

## Contenido del sitio

**/admin/contenido** (roles *superadmin* y *marketing*): textos e imágenes de la portada, las páginas de soluciones y «Nosotros».

- Cada bloque parte de su **texto base** (el texto original del sitio). Al guardar con **Publicar** marcado, la web muestra tu versión; sin marcar, queda como **borrador** y la web sigue con el texto base.
- **Restaurar texto base** descarta la versión guardada.
- Los campos tienen límite de caracteres (el contador lo muestra) y algunas listas tienen cantidad fija porque cada elemento lleva su ícono.
- **Provisional**: en «Nosotros», la página muestra la etiqueta «Contenido provisional» mientras esté marcado. Desmárcalo solo con información oficial.
- No escribas cifras, certificaciones ni relaciones con marcas sin respaldo documental (regla «Nada inventado»).
- La foto de fondo de la portada es opcional; sin ella se muestra el fondo gráfico.

## Marcas y usuarios

Hasta que se entreguen las pantallas de la fase 2, se gestionan desde **Supabase Studio → Table Editor** (tablas `brands`, `services`, `blog_posts`, `profiles`) y **Storage → public-media** para imágenes y fichas técnicas. Reglas que la base de datos hace cumplir:

- Un producto con `is_placeholder = true` no puede publicarse.
- Un proyecto muestra el cliente solo con `client_name_authorized`, la ubicación en el mapa solo con `location_authorized`, el ahorro solo con `financials_authorized` y el testimonio solo con `testimonial_verified` (vista `projects_public`; la clave pública no puede leer esas columnas de la tabla).
- Una marca muestra su relación comercial solo con `relationship_verified` y documento de respaldo.
- Todos los cambios quedan en `audit_log` con el usuario y los valores anteriores.
