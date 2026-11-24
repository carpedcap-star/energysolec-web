import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { AddToCart } from '@/components/store/add-to-cart';
import { fmtUsd2 } from '@/lib/format';
import { IconPanel } from '@/components/icons';
import { SITE } from '@/lib/site';

export const revalidate = 120;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getStore().getProductBySlug((await params).slug);
  return p ? { title: p.name, description: p.summary ?? undefined, alternates: { canonical: `/tienda/${p.slug}` }, robots: p.is_placeholder ? { index: false } : undefined } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getStore().getProductBySlug(slug);
  if (!p) notFound();
  const price = p.promo_price ?? p.price;
  const ld = !p.is_placeholder && price > 0 ? { '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.sku, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined, description: p.summary, offers: { '@type': 'Offer', priceCurrency: 'USD', price, availability: p.availability === 'disponible' ? 'https://schema.org/InStock' : 'https://schema.org/PreOrder', url: `${SITE.url}/tienda/${p.slug}` } } : null;
  return (
    <section className="pb-24 pt-32">
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />}
      <div className="container-site">
        <nav className="mb-6 text-sm text-muted"><Link href="/tienda" className="hover:underline">Tienda</Link> / {p.name}</nav>
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="card grid aspect-square place-items-center">{p.images[0] ? <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain p-10" /> : <IconPanel className="h-24 w-24 text-line" />}</div>
          <div>
            {p.is_placeholder && <span className="placeholder-badge mb-3">Producto de ejemplo · no a la venta</span>}
            <p className="text-sm uppercase tracking-wider text-muted">{p.brand ?? 'Marca por definir'} · Modelo {p.model ?? '—'} · SKU {p.sku}</p>
            <h1 className="font-display mt-2 text-3xl font-extrabold sm:text-4xl">{p.name}</h1>
            {p.summary && <p className="mt-4 text-muted">{p.summary}</p>}
            <div className="mt-6">{price > 0 ? <p className="font-display text-3xl font-bold">{fmtUsd2(price)} <span className="text-base font-normal text-muted">+ IVA {Math.round(p.vat_rate * 100)} %</span></p> : <p className="font-semibold">Precio a consultar con un asesor</p>}</div>
            <div className="mt-6"><AddToCart p={{ ...p, price }} /></div>
            {p.installable && <p className="mt-4 text-sm text-muted">¿Necesitas instalación? Indícalo al finalizar tu pedido y un técnico te cotizará el servicio.</p>}
            <dl className="mt-8 divide-y divide-line border-y border-line text-sm">
              {Object.entries(p.specs).map(([k, v]) => <div key={k} className="flex justify-between py-2.5"><dt className="text-muted">{k}</dt><dd className="font-medium">{String(v)}</dd></div>)}
              <div className="flex justify-between py-2.5"><dt className="text-muted">Garantía</dt><dd className="font-medium">{p.warranty ?? '—'}</dd></div>
              {p.certifications.length > 0 && <div className="flex justify-between py-2.5"><dt className="text-muted">Certificaciones</dt><dd className="font-medium">{p.certifications.join(', ')}</dd></div>}
            </dl>
            {p.datasheet_url && <a href={p.datasheet_url} className="btn-ghost mt-6" target="_blank" rel="noopener">Descargar ficha técnica</a>}
          </div>
        </div>
      </div>
    </section>
  );
}
