import type { Brand, Product, ProjectRecord, Stat } from './types';

/**
 * Datos semilla. TODO está marcado como provisional:
 * - Productos de ejemplo (is_placeholder) — la BD de producción impide publicarlos.
 * - Fichas de proyectos sin cifras: Energy Solutions debe completarlas y autorizarlas.
 * - Marcas sin relación comercial verificada.
 * - Indicadores sin valor: el contador solo muestra los verificados.
 */
export const SEED_STATS: Stat[] = [
  'MWp instalados', 'Proyectos ejecutados', 'Paneles solares instalados', 'Toneladas de CO₂ evitadas',
  'Energía generada (MWh)', 'Años de experiencia', 'Clientes atendidos',
].map((label, i) => ({ id: `stat-${i}`, label, value: 0, unit: null, source_note: 'PENDIENTE: dato real a ingresar por Gerencia', verified: false, sort: i }));

const projectStub = (slug: string, title: string, segment: ProjectRecord['segment'], industry: string): ProjectRecord => ({
  id: `prj-${slug}`, slug, title, client_name: null, segment, industry, province: null, city: null, lat: null, lng: null,
  location_authorized: false, capacity_kwp: null, inverter_kw: null, panel_count: null, installation_type: null, technology: [],
  annual_generation_kwh: null, generation_is_measured: false, annual_savings_usd: null, co2_avoided_t: null, executed_on: null,
  status: 'finalizado', description: null, testimonial: null, testimonial_author: null, cover: null, gallery: [],
  published: false, featured: false, is_placeholder: true,
  client_name_authorized: false, financials_authorized: false, testimonial_verified: false, updated_at: null,
});

export const SEED_PROJECTS: ProjectRecord[] = [
  projectStub('empacreci', 'Empacreci', 'industrial', 'Empacadora'),
  projectStub('hotel-los-ceibos', 'Hotel Los Ceibos', 'comercial', 'Hotelería'),
  projectStub('importadora-chinatown', 'Importadora Chinatown', 'comercial', 'Comercio'),
  projectStub('productos-lacteos-gonzales', 'Productos Lácteos Gonzáles', 'industrial', 'Agroindustria láctea'),
  projectStub('esheclabri', 'ESHECLABRI', 'industrial', 'Por definir'),
];

export const SEED_BRANDS: Brand[] = [
  'KACO New Energy – Siemens', 'AE Solar', 'Huawei', 'SMA', 'Fronius', 'GoodWe', 'Deye', 'Pylontech', 'BYD', 'Suntree', 'ACESCO', 'Alurack',
].map((name, i) => ({
  id: `brand-${i}`, slug: name.toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/-+$/, ''), name, logo: null, description: null,
  relationship: null, relationship_verified: false, published: true,
}));

const ex = (n: number, p: Omit<Product, 'id' | 'is_placeholder' | 'published' | 'images' | 'datasheet_url' | 'certifications' | 'promo_price'> & Partial<Product>): Product => ({
  id: `prod-${n}`, images: [], datasheet_url: null, certifications: [], promo_price: null, is_placeholder: true, published: true, ...p,
});

export const SEED_PRODUCTS: Product[] = [
  ex(1, { sku: 'EJ-PAN-580', slug: 'ejemplo-panel-580w', name: 'Panel monocristalino 580 W (EJEMPLO)', brand: null, model: 'Ejemplo', category: 'paneles-solares', summary: 'Producto de ejemplo para pruebas de la tienda.', specs: { 'Potencia (W)': 580, 'Tecnología': 'N-type bifacial' }, warranty: 'Por definir', vat_rate: 0.15, stock: 0, availability: 'consultar', installable: true, price: 0 }),
  ex(2, { sku: 'EJ-INV-HYB-6', slug: 'ejemplo-inversor-hibrido-6kw', name: 'Inversor híbrido 6 kW (EJEMPLO)', brand: null, model: 'Ejemplo', category: 'inversores-hibridos', summary: 'Producto de ejemplo para pruebas de la tienda.', specs: { 'Potencia (kW)': 6, 'Fases': 'Monofásico' }, warranty: 'Por definir', vat_rate: 0.15, stock: 0, availability: 'consultar', installable: true, price: 0 }),
  ex(3, { sku: 'EJ-BAT-5', slug: 'ejemplo-bateria-litio-5kwh', name: 'Batería LiFePO4 5 kWh (EJEMPLO)', brand: null, model: 'Ejemplo', category: 'baterias-de-litio', summary: 'Producto de ejemplo para pruebas de la tienda.', specs: { 'Capacidad (kWh)': 5, 'Química': 'LiFePO4' }, warranty: 'Por definir', vat_rate: 0.15, stock: 0, availability: 'consultar', installable: true, price: 0 }),
];

export const PRODUCT_CATEGORIES = [
  ['paneles-solares', 'Paneles solares'], ['inversores-on-grid', 'Inversores On Grid'], ['inversores-hibridos', 'Inversores híbridos'],
  ['inversores-off-grid', 'Inversores Off Grid'], ['baterias-de-litio', 'Baterías de litio'], ['sistemas-bess', 'Sistemas BESS'],
  ['kits-solares', 'Kits solares'], ['kits-respaldo', 'Kits de respaldo sin paneles'], ['estructuras', 'Estructuras de montaje'],
  ['protecciones', 'Protecciones eléctricas'], ['cableado', 'Cableado solar'], ['conectores', 'Conectores'], ['accesorios', 'Accesorios'],
  ['cargadores-ve', 'Cargadores para vehículos eléctricos'], ['monitoreo', 'Equipos de monitoreo'], ['herramientas', 'Herramientas para instaladores'],
] as const;
