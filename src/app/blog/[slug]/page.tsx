import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { BLOG_CATEGORIES } from '@/lib/services/blog';
import { readingMinutes, renderMarkdown } from '@/lib/markdown';
import { SITE } from '@/lib/site';

export const revalidate = 300;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'long', year: 'numeric' });
const abs = (u: string) => (u.startsWith('/') ? `${SITE.url}${u}` : u);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await getStore().getPublishedPost((await params).slug);
  if (!p) return {};
  const description = p.seo_description || p.excerpt;
  return {
    title: p.seo_title || p.title, description, alternates: { canonical: `/blog/${p.slug}` },
    openGraph: { type: 'article', title: p.seo_title || p.title, description, publishedTime: p.published_at, images: p.cover ? [abs(p.cover)] : undefined },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getStore().getPublishedPost((await params).slug);
  if (!p) notFound();
  const cat = BLOG_CATEGORIES.find((c) => c.name === p.category);
  const ld = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.seo_description || p.excerpt,
    datePublished: p.published_at, inLanguage: 'es-EC', mainEntityOfPage: `${SITE.url}/blog/${p.slug}`, articleSection: p.category,
    image: p.cover ? [abs(p.cover)] : undefined,
    author: p.author ? { '@type': 'Person', name: p.author } : { '@type': 'Organization', name: 'Energy Solutions Ecuador' },
    publisher: { '@type': 'Organization', name: 'Energy Solutions Ecuador S.A.S.', logo: { '@type': 'ImageObject', url: `${SITE.url}/brand/logo.png` } },
  };
  return (
    <article className="pb-24 pt-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />
      <div className="container-site max-w-3xl">
        <nav className="text-sm text-muted"><Link href="/blog" className="hover:underline">Blog</Link>{cat && <> / <Link href={`/blog?categoria=${cat.slug}`} className="hover:underline">{cat.name}</Link></>}</nav>
        <h1 className="font-display mt-4 [overflow-wrap:anywhere] text-3xl font-extrabold leading-tight sm:text-5xl">{p.title}</h1>
        <p className="mt-4 text-sm text-muted">
          <time dateTime={p.published_at}>{fmt(p.published_at)}</time>{p.author ? ` · ${p.author}` : ''} · {readingMinutes(p.body_md)} min de lectura
        </p>
        {p.cover && <img src={p.cover} alt="" className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover" />}
        <div className="mt-6 text-[17px]">{renderMarkdown(p.body_md)}</div>
        <aside className="mt-14 rounded-3xl bg-brand p-8">
          <p className="font-display text-2xl font-extrabold text-brand-dark">¿Cuánto puedes ahorrar con energía solar?</p>
          <p className="mt-2 text-brand-dark/75">Calcula tu sistema con la irradiación de tu ubicación y tu tarifa real.</p>
          <Link href="/calculadora" className="btn-dark mt-5">Calcular mi ahorro</Link>
        </aside>
      </div>
    </article>
  );
}
