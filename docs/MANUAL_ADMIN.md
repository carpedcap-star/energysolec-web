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
| Planillas de clientes | ✓ | ✓ | | sus leads y sin asignar | ✓ | |

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

**/admin/parametros** (roles *superadmin*, *gerencia* e *ingeniería*): formulario por secciones, con porcentajes en % y unidades visibles.

- **Precio por kWp por tramos**: cada tramo aplica hasta la potencia indicada; el último no tiene límite. La «Comprobación de tramos» muestra qué precio aplica a 3, 10, 50, 200 y 1000 kWp.
- Reglas que el panel verifica antes de guardar: tramos en orden; sombreado ninguno ≤ parcial ≤ significativo; escenarios en orden (conservador ≤ base ≤ optimista en generación y alza de tarifa, al revés en inversión); años de reemplazo dentro de la vida útil.
- **Excedentes**: «Sin compensación» los valora en $0 (regla de negocio). Con «Precio fijo», el precio es obligatorio. El cargo por demanda no se reduce salvo que se active expresamente.
- Cada guardado crea una **versión nueva**; los estudios registran la versión usada.
- **Validación**: solo Gerencia marca los parámetros como validados. Cualquier cambio de otro rol los deja provisionales hasta que Gerencia los revise; mientras tanto, cada estudio lo advierte al cliente.

## Tarifas eléctricas

**/admin/tarifas** (roles *superadmin*, *gerencia* e *ingeniería*): lista de tarifas activas, alta, edición y desactivación.

- **Bloques de energía**: se indica «hasta cuántos kWh» aplica cada bloque; el inicio de cada uno es el final del anterior, así que no puede haber huecos. El último no tiene límite.
- **Vista previa de la factura** para 100, 300, 1000 y 5000 kWh (con 20 kW de demanda de ejemplo si aplica), con el mismo cálculo que usa la calculadora: compárala con una planilla real.
- El **código** no puede repetirse entre tarifas activas. La **fuente** (resolución ARCONEL, fecha y distribuidora) es obligatoria; desmarca «Provisional» cuando esté validada.
- **Desactivar** quita la tarifa de la calculadora (los estudios ya hechos no cambian). No se puede desactivar la última tarifa activa de un segmento.

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

## Marcas

**/admin/marcas** (roles *superadmin*, *marketing* y *compras*): logo, descripción, relación comercial y documentos públicos de cada fabricante.

- La **relación comercial** («Distribuidor autorizado»…) solo se publica si está **verificada**, tiene **documento de respaldo** y no venció («Vigente hasta»). El panel indica en vivo si se publicará y por qué no.
- El documento de respaldo queda en almacenamiento **privado**: solo lo abren superadmin, gerencia, marketing y compras desde el panel.
- **Documentos públicos**: fichas técnicas, certificados, garantías y catálogos (PDF) o enlaces https (videos). Se muestran en /marcas.
- Logos en PNG, JPG o WebP (SVG no se acepta por seguridad). Mostrar una marca no afirma ninguna relación comercial.
- Una marca con productos no se elimina: cambia la marca de esos productos o deja la marca oculta.

## Servicios

**/admin/servicios** (roles *superadmin* y *marketing*): los 15 servicios del catálogo base y los que agregues.

- Un servicio sin **descripción** se muestra como «Contenido provisional». Usa información validada por Ingeniería.
- Los servicios base tienen URL fija; «Restaurar versión base» descarta lo guardado. Desmarca «Publicado» para ocultar un servicio.
- El **resumen** se usa en el listado y como descripción para buscadores.

## Blog

**/admin/blog** (roles *superadmin* y *marketing*): artículos con categoría, portada, extracto y metadatos para buscadores.

- El texto se escribe en **Markdown** con la barra de formato (negrita, cursiva, títulos de sección, listas, citas, enlaces e imágenes). La pestaña **Vista previa** muestra cómo se verá.
- **Insertar imagen** sube la foto y pide su descripción (texto alternativo y pie de foto).
- Los enlaces deben ser https, correo (mailto:), teléfono (tel:) o rutas del sitio (/calculadora). Otros se muestran como texto.
- **Publicar** sin fecha publica al guardar; con una fecha futura el artículo queda **programado** y aparece solo en esa fecha (hora de Ecuador).
- Título y descripción para buscadores son opcionales (60 y 160 caracteres); la vista previa muestra cómo se verá en Google.
- Cifras, normas y tarifas siempre con su fuente (regla «Nada inventado»).

## Usuarios y roles

**/admin/usuarios**: el *superadministrador* invita y edita usuarios; *gerencia* ve la lista y la matriz de permisos.

- **Invitar**: nombre, correo, rol y si es asesor comercial (recibe leads por turno). La persona recibe un enlace de un solo uso (vence en 24 horas) para activar su cuenta y elegir su contraseña. Nadie más la conoce. Si el correo no puede enviarse, el panel muestra el enlace para compartirlo solo con esa persona.
- **Contraseñas**: mínimo 10 caracteres, con letras y al menos un número. «Enviar enlace» en la ficha del usuario sirve para reenviar la invitación o restablecer una contraseña olvidada.
- **Desactivar**: el acceso se corta de inmediato y el historial se conserva (no se eliminan usuarios). Si era asesor con leads abiertos, puedes reasignarlos a otro asesor en el mismo paso.
- **Protecciones**: nadie puede cambiar su propio rol ni desactivarse, y siempre debe quedar al menos un superadministrador activo.
- Los **roles** son fijos porque la base de datos aplica los mismos permisos; la tabla «Qué puede hacer cada rol» los resume.

## Identidad gráfica

**/admin/identidad** (roles *superadmin* y *marketing*): colores y logos del sitio y del panel.

- Tres colores: **acción** (botones principales y énfasis), **base oscuro** (pie, secciones oscuras, panel) y **datos y enlaces**. La vista previa muestra los componentes reales con la paleta elegida.
- El panel calcula el **contraste** de cada combinación que usa el sitio. Una paleta ilegible no se puede guardar; las que quedan por debajo de lo recomendado se marcan con un aviso.
- Logos para fondos claros, para fondos oscuros y favicon, en PNG o WebP con fondo transparente (SVG no se acepta por seguridad). «Usar el original» vuelve al logo de fábrica.
- Al guardar, el cambio se aplica a todas las páginas, al ícono del navegador, a la imagen para redes y a los datos estructurados de la organización.

## Planillas eléctricas

- En la calculadora, el cliente puede subir su planilla (PDF o foto, máx. 4 MB). Una IA lee el consumo, el valor, la demanda y el historial, **sin** nombre, cédula, dirección ni número de cuenta.
- El cliente ve lo leído, corrige los campos y debe marcar «Revisé los datos de consumo y son correctos» antes de continuar. El estudio se calcula solo con lo que confirma.
- La subida exige una autorización separada (LOPDP): el archivo se guarda en el almacenamiento privado `bills` y lo procesa un proveedor externo de IA.
- En la ficha del lead, la sección **Planilla eléctrica** compara lo leído por la IA con lo confirmado y permite abrir el archivo original. Es un documento con datos personales: no lo reenvíes.
- La opción aparece solo si el servidor tiene `ANTHROPIC_API_KEY`. Límites: 5 lecturas por hora por visitante y `BILL_DAILY_MAX` (200 por defecto) al día en todo el sitio. Si la lectura falla, el cliente sigue con el ingreso manual.

## Otros datos

Hasta que se entreguen las pantallas de la fase 2, se gestionan desde **Supabase Studio → Table Editor** (tabla `site_settings`: datos de contacto e integraciones) y **Storage → public-media** para imágenes y fichas técnicas. Reglas que la base de datos hace cumplir:

- Un producto con `is_placeholder = true` no puede publicarse.
- Un proyecto muestra el cliente solo con `client_name_authorized`, la ubicación en el mapa solo con `location_authorized`, el ahorro solo con `financials_authorized` y el testimonio solo con `testimonial_verified` (vista `projects_public`; la clave pública no puede leer esas columnas de la tabla).
- Una marca muestra su relación comercial solo verificada, con documento de respaldo y vigente (vista `brands_public`; la clave pública no puede leer esas columnas de la tabla).
- Todos los cambios quedan en `audit_log` con el usuario y los valores anteriores.
