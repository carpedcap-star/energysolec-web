export type Segment = 'residencial' | 'comercial' | 'industrial';
export type LeadStage = 'nuevo' | 'contactado' | 'calificado' | 'visita_tecnica' | 'cotizacion_enviada' | 'negociacion' | 'ganado' | 'perdido';
export type LeadSource = 'calculadora' | 'tienda' | 'contacto' | 'cotizacion' | 'catalogo' | 'financiamiento' | 'capacitacion' | 'campana' | 'servicio';
export type OrderStatus = 'nuevo' | 'pendiente_contacto' | 'contactado' | 'cotizado' | 'confirmado' | 'pagado' | 'en_preparacion' | 'despachado' | 'entregado' | 'cancelado';
export type AppRole = 'superadmin' | 'gerencia' | 'marketing' | 'ventas' | 'ingenieria' | 'compras';

export const LEAD_STAGES: { id: LeadStage; label: string }[] = [
  { id: 'nuevo', label: 'Nuevo lead' }, { id: 'contactado', label: 'Contactado' }, { id: 'calificado', label: 'Calificado' },
  { id: 'visita_tecnica', label: 'Visita técnica' }, { id: 'cotizacion_enviada', label: 'Cotización enviada' },
  { id: 'negociacion', label: 'Negociación' }, { id: 'ganado', label: 'Ganado' }, { id: 'perdido', label: 'Perdido' },
];
export const ORDER_STATUSES: { id: OrderStatus; label: string }[] = [
  { id: 'nuevo', label: 'Nuevo' }, { id: 'pendiente_contacto', label: 'Pendiente de contacto' }, { id: 'contactado', label: 'Contactado' },
  { id: 'cotizado', label: 'Cotizado' }, { id: 'confirmado', label: 'Confirmado' }, { id: 'pagado', label: 'Pagado' },
  { id: 'en_preparacion', label: 'En preparación' }, { id: 'despachado', label: 'Despachado' }, { id: 'entregado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' },
];
export const PAID_STATES: OrderStatus[] = ['pagado', 'en_preparacion', 'despachado', 'entregado'];

export type Lead = {
  id: string; full_name: string; email: string; phone?: string | null; company?: string | null;
  segment?: Segment | null; province?: string | null; city?: string | null;
  monthly_kwh?: number | null; monthly_bill_usd?: number | null; recommended_kwp?: number | null; estimated_investment_usd?: number | null;
  source: LeadSource; utm: Record<string, string>; stage: LeadStage; advisor_id?: string | null;
  next_activity_at?: string | null; next_activity_note?: string | null; notes?: string | null;
  first_contact_at?: string | null; created_at: string;
};

export type Study = {
  id: string; code: string; lead_id: string | null; mode: 'rapida' | 'profesional';
  inputs: unknown; results: import('../engine/study').StudyResult; params_version: number; solar_source: string;
  unlocked: boolean; visit_requested: boolean; created_at: string;
};

export type Product = {
  id: string; sku: string; slug: string; name: string; brand: string | null; model: string | null;
  category: string; summary: string | null; specs: Record<string, string | number>; warranty: string | null;
  certifications: string[]; images: string[]; datasheet_url: string | null; vat_rate: number; stock: number;
  availability: 'disponible' | 'bajo_pedido' | 'agotado' | 'consultar'; installable: boolean;
  price: number; promo_price: number | null; is_placeholder: boolean; published: boolean;
};

export type PriceTier = 'final' | 'instalador' | 'distribuidor';
export const PRICE_TIERS: { id: PriceTier; label: string }[] = [
  { id: 'final', label: 'Cliente final' }, { id: 'instalador', label: 'Instalador' }, { id: 'distribuidor', label: 'Distribuidor' },
];
export type TierPrice = { tier: PriceTier; price: number; promo_price: number | null; promo_until: string | null };
export type Availability = Product['availability'];
export const AVAILABILITY: { id: Availability; label: string }[] = [
  { id: 'disponible', label: 'Disponible' }, { id: 'bajo_pedido', label: 'Bajo pedido' }, { id: 'agotado', label: 'Agotado' }, { id: 'consultar', label: 'Consultar' },
];
/** Archivo del bucket public-media registrado en la tabla `media`. */
export type MediaRef = { id: string; path: string; url: string; alt: string | null };
export type MediaBucket = 'public-media' | 'private-docs';

/** Vista completa de un producto para el panel: todos los niveles de precio y los medios con su id. */
export type ProductRecord = Omit<Product, 'price' | 'promo_price' | 'images' | 'datasheet_url'> & {
  brand_id: string | null; prices: TierPrice[]; images: MediaRef[]; datasheet: MediaRef | null; updated_at: string | null;
};
/** Datos que el panel envía para crear o actualizar un producto (ya validados con Zod). */
export type ProductInput = Omit<ProductRecord, 'id' | 'brand' | 'images' | 'datasheet' | 'updated_at'> & {
  id?: string; image_ids: string[]; datasheet_id: string | null;
};

export type OrderItem ={ product_id: string; sku: string; name: string; qty: number; unit_price: number; vat_rate: number; line_subtotal: number };
export type Order = {
  id: string; number: string; lead_id: string | null; customer_name: string; email: string; phone: string; city: string; address: string;
  customer_type: 'final' | 'instalador' | 'distribuidor' | 'empresa'; notes: string | null; needs_installation: boolean;
  subtotal: number; tax: number; total: number; status: OrderStatus; payment_reference: string | null;
  payment_verified_by: string | null; payment_verified_at: string | null; whatsapp_message: string; items: OrderItem[]; created_at: string;
};

export type Stat = { id: string; label: string; value: number; unit: string | null; source_note: string; verified: boolean; sort: number };
export type Project = {
  id: string; slug: string; title: string; client_name: string | null; segment: Segment; industry: string | null;
  province: string | null; city: string | null; lat: number | null; lng: number | null; location_authorized: boolean;
  capacity_kwp: number | null; inverter_kw: number | null; panel_count: number | null; installation_type: string | null;
  technology: string[]; annual_generation_kwh: number | null; generation_is_measured: boolean; annual_savings_usd: number | null;
  co2_avoided_t: number | null; executed_on: string | null; status: ProjectStatus; description: string | null;
  testimonial: string | null; testimonial_author: string | null; cover: string | null; gallery: string[]; published: boolean; featured: boolean; is_placeholder: boolean;
};
export type ProjectStatus = 'en_desarrollo' | 'en_construccion' | 'operativo' | 'finalizado';
export const PROJECT_STATUSES: { id: ProjectStatus; label: string }[] = [
  { id: 'en_desarrollo', label: 'En desarrollo' }, { id: 'en_construccion', label: 'En construcción' }, { id: 'operativo', label: 'Operativo' }, { id: 'finalizado', label: 'Finalizado' },
];
/**
 * Vista completa de un proyecto para el panel: datos sin enmascarar, banderas de autorización y medios.
 * Lo público (`Project`) se obtiene SIEMPRE con `toPublicProject`, que oculta lo no autorizado.
 */
export type ProjectRecord = Omit<Project, 'cover' | 'gallery'> & {
  client_name_authorized: boolean; financials_authorized: boolean; testimonial_verified: boolean;
  cover: MediaRef | null; gallery: MediaRef[]; updated_at: string | null;
};
export type ProjectInput = Omit<ProjectRecord, 'id' | 'cover' | 'gallery' | 'updated_at' | 'is_placeholder'> & {
  id?: string; cover_id: string | null; gallery_ids: string[];
};
/**
 * Marca para lo público: la relación comercial solo viene si está verificada, con respaldo y vigente
 * (siempre pasar por `toPublicBrand`). `relationship_verified` indica si se muestra.
 */
export type Brand = {
  id: string; slug: string; name: string; logo: string | null; description: string | null;
  relationship: string | null; relationship_verified: boolean; published: boolean;
  assets: { kind: BrandAssetKind; title: string; url: string }[];
};
export type BrandAssetKind = 'datasheet' | 'certificate' | 'warranty' | 'catalog' | 'video';
export const BRAND_ASSET_KINDS: { id: BrandAssetKind; label: string }[] = [
  { id: 'datasheet', label: 'Ficha técnica' }, { id: 'certificate', label: 'Certificado' }, { id: 'warranty', label: 'Garantía' },
  { id: 'catalog', label: 'Catálogo' }, { id: 'video', label: 'Video' },
];
export type BrandAsset = { id: string; kind: BrandAssetKind; title: string; media: MediaRef | null; url: string | null };
/** Marca completa para el panel. `relationship_doc` está en el bucket privado: su URL es la ruta protegida del panel. */
export type BrandRecord = {
  id: string; slug: string; name: string; logo: MediaRef | null; description: string | null;
  relationship: string | null; relationship_verified: boolean; relationship_doc: MediaRef | null; relationship_valid_until: string | null;
  published: boolean; sort: number; assets: BrandAsset[];
};
export type BrandInput = Omit<BrandRecord, 'id' | 'logo' | 'relationship_doc' | 'assets'> & {
  id?: string; logo_id: string | null; relationship_doc_id: string | null;
  assets: { id?: string; kind: BrandAssetKind; title: string; media_id: string | null; url: string | null }[];
};

/** Servicio público. `isPlaceholder`: aún sin descripción oficial (se marca de forma visible). */
export type Service = {
  slug: string; name: string; summary: string | null; description: string | null; benefits: string[]; scope: string[];
  segments: Segment[]; cover: string | null; isPlaceholder: boolean;
};
/** Servicio en el panel: los del catálogo base existen aunque aún no tengan fila en la base (`id: null`). */
export type ServiceRecord = Omit<Service, 'cover' | 'isPlaceholder'> & {
  id: string | null; cover: MediaRef | null; published: boolean; sort: number; isBase: boolean;
};
export type ServiceRow = Omit<ServiceRecord, 'isBase' | 'id'> & { id: string };
export type ServiceInput = Omit<ServiceRecord, 'id' | 'cover' | 'isBase'> & { id?: string; cover_id: string | null };
export type Consent = { purpose: 'privacidad_servicio' | 'comercial_marketing'; granted: boolean };
export type Staff = { id: string; email: string; full_name: string; role: AppRole };
export type Activity = { id: string; lead_id: string; kind: string; body: string | null; at: string; actor: string | null };

/** Fila de `content_blocks`. `data` se valida y combina con el texto base al leerla (src/content/blocks.ts). */
export type ContentBlockRow = { page: string; slot: string; data: unknown; is_placeholder: boolean; published: boolean; updated_at: string | null };

/** Artículo del blog para lo público (solo publicados con fecha cumplida). */
export type BlogPost = {
  slug: string; title: string; excerpt: string; body_md: string; category: string; cover: string | null;
  author: string | null; published_at: string; seo_title: string | null; seo_description: string | null;
};
export type BlogPostRecord = Omit<BlogPost, 'cover' | 'published_at' | 'excerpt'> & {
  id: string; excerpt: string | null; cover: MediaRef | null; published: boolean; published_at: string | null; author_id: string | null;
};
export type BlogPostInput = Omit<BlogPostRecord, 'id' | 'cover' | 'author' | 'author_id'> & { id?: string; cover_id: string | null };
