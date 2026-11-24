import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';
import { SEGMENTS, SERVICES } from '@/content/segments';
import { getStore } from '@/lib/data/store';
export const revalidate = 3600;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const store = getStore();
  const [products, projects] = await Promise.all([store.listProducts(), store.listProjects()]);
  const u = (p: string, priority = 0.7) => ({ url: `${SITE.url}${p}`, lastModified: new Date(), priority });
  return [
    u('/', 1), u('/calculadora', 0.95), u('/tienda', 0.9), u('/proyectos', 0.8), u('/servicios'), u('/marcas', 0.6), u('/financiamiento'), u('/nosotros', 0.5), u('/blog', 0.6), u('/contacto', 0.8),
    ...SEGMENTS.map((s) => u(`/soluciones/${s.slug}`, 0.9)), ...SERVICES.map((s) => u(`/servicios/${s.slug}`, 0.6)),
    ...products.filter((p) => !p.is_placeholder).map((p) => u(`/tienda/${p.slug}`, 0.6)), ...projects.map((p) => u(`/proyectos/${p.slug}`, 0.6)),
  ];
}
