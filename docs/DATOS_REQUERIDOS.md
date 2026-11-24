# Datos que Energy Solutions Ecuador debe proporcionar

Todo lo que figura aquí está hoy como **provisional** en la plataforma y se reemplaza desde el panel o Supabase, sin programar.

## Imprescindible antes del lanzamiento

| # | Dato | Responsable | Dónde se carga |
|---|---|---|---|
| 1 | Pliego tarifario ARCONEL vigente: tarifas residencial, comercial e industrial (BT/MT/AT), con y sin demanda, por distribuidora (al menos CNEL Guayas–Los Ríos, EEQ y Centrosur) | Ingeniería | /admin/tarifas |
| 2 | Precio llave en mano USD/kWp por tramo de tamaño, USD/kWh de baterías y % de ingeniería y permisos | Gerencia | /admin/parametros |
| 3 | Tratamiento de IVA de los sistemas fotovoltaicos (posibles exoneraciones) | Contabilidad | /admin/parametros |
| 4 | Régimen de excedentes aplicable (regulación ARCONEL de generación distribuida para autoabastecimiento) y si debe valorarse en la calculadora | Ingeniería / Legal | /admin/parametros |
| 5 | Factor de emisión del SNI vigente (kg CO₂/kWh) | Ingeniería | /admin/parametros |
| 6 | Tasa de descuento, costo de O&M por kWp, condiciones de financiamiento de referencia | Gerencia | /admin/parametros |
| 7 | Correo oficial, dirección y horario de atención; correo para avisos comerciales | Gerencia | Variables de entorno / site_settings |
| 8 | Política de privacidad revisada por asesor legal (LOPDP) y nombre del responsable de protección de datos | Legal | /privacidad |
| 9 | Dominio de envío verificado en Resend (SPF/DKIM de energysolec.com) | TI | Resend |
| 10 | Usuarios del panel con su rol; asesores comerciales | Gerencia | Supabase Auth + profiles |

## Contenido comercial

- Fotografías y videos de proyectos en alta resolución (incluidos drones, antes y después), con autorización de uso.
- Fichas de proyectos: Empacreci, Hotel Los Ceibos, Importadora Chinatown, Productos Lácteos Gonzáles, ESHECLABRI y otros, con capacidad, inversores, paneles, tecnología, generación (estimada o medida), fecha, descripción y **autorización escrita** para publicar el nombre del cliente, la ubicación y las cifras financieras.
- Testimonios verificables (texto, nombre, cargo, autorización).
- Indicadores reales de la portada con su fuente: MWp instalados, proyectos, paneles, CO₂ evitado, energía generada, años de experiencia, clientes.
- Catálogo: por producto, nombre, marca, modelo, SKU, fotos, precios (final, instalador, distribuidor), IVA, stock, ficha técnica PDF, garantía, certificaciones, especificaciones, compatibilidades y accesorios.
- Marcas: logotipos oficiales y **documento vigente** de cada representación o distribución (sin él, la relación no se publica).
- Servicios: descripción, beneficios, alcance y fotos de los 15 servicios.
- Nosotros: historia, misión, visión, equipo, certificaciones.

## Cuentas e integraciones

- Supabase (plan Pro recomendado por las copias de seguridad PITR) y Vercel.
- Google Analytics 4, Google Tag Manager, Meta Business (Pixel) y, si se usará la API de WhatsApp, Meta Business verificado con WhatsApp Cloud API.
- Cloudflare Turnstile (gratuito) para la protección contra spam.
