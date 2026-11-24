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

## Contenido, productos, proyectos, marcas y usuarios

Hasta que se entreguen las pantallas de la fase 2, se gestionan desde **Supabase Studio → Table Editor** (tablas `content_blocks`, `products`, `product_prices`, `projects`, `brands`, `services`, `blog_posts`, `profiles`) y **Storage → public-media** para imágenes y fichas técnicas. Reglas que la base de datos hace cumplir:

- Un producto con `is_placeholder = true` no puede publicarse.
- Un proyecto muestra el cliente solo con `client_name_authorized`, la ubicación en el mapa solo con `location_authorized` y el ahorro solo con `financials_authorized`.
- Una marca muestra su relación comercial solo con `relationship_verified` y documento de respaldo.
- Todos los cambios quedan en `audit_log` con el usuario y los valores anteriores.
