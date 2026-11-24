import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { PRODUCT_CATEGORIES } from '@/lib/data/seed';
import { Catalog } from '@/components/store/catalog';

export const metadata: Metadata = { title: 'Tienda solar: paneles, inversores y baterías en Ecuador', description: 'Paneles solares, inversores on grid, híbridos y off grid, baterías de litio, BESS, estructuras y accesorios.', alternates: { canonical: '/tienda' } };
export const revalidate = 120;

export default async function Page() {
  const products = await getStore().listProducts();
  const placeholders = products.some((p) => p.is_placeholder);
  return (
    <section className="pb-24 pt-32">
      <div className="container-site">
        <p className="eyebrow">Tienda solar</p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Equipos solares y de almacenamiento</h1>
        <p className="mt-3 max-w-2xl text-muted">Arma tu pedido y confírmalo con un asesor por WhatsApp. Precios referenciales sujetos a confirmación de disponibilidad.</p>
        {placeholders && <p className="mt-5 rounded-xl border-l-4 border-brand bg-amber-50 px-4 py-3 text-sm text-amber-950">Entorno de desarrollo: se muestran productos de EJEMPLO para probar la tienda. En producción la base de datos impide publicarlos; Compras debe cargar el catálogo real desde el panel.</p>}
        <div className="mt-10"><Catalog products={products} categories={PRODUCT_CATEGORIES} /></div>
      </div>
    </section>
  );
}
