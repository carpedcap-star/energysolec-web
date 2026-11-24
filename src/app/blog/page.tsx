import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { BLOG_CATEGORIES } from '@/lib/services/blog';
import { readingMinutes } from '@/lib/markdown';

export const metadata: Metadata = {
  title: 'Blog y noticias de energía solar',
  description: 'Guías, regulación eléctrica ecuatoriana, almacenamiento, eficiencia energética y casos de éxito de energía solar en Ecuador.',
  alternates: { canonical: '/blog' },
};
export const revalidate = 300;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('es-EC', { timeZone: 'America/Guayaquil', day: 'numeric', month: 'long', year: 'numeric' });

export default async function Page({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  const cat = BLOG_CATEGORIES.find((c) => c.slug === categoria);
  const all = await getStore().listPublishedPosts();
  const posts = cat ? all.filter((p) => p.category === cat.name) : all;
  const used = new Set(all.map((p) => p.category));
  return (
    <section className="pb-24 pt-32"><div className="container-site">
      <p className="eyebrow">Blog y noticias</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Conocimiento en energía solar</h1>
      <nav aria-label="Categorías" className="mt-8 flex flex-wrap gap-2">
        <Link href="/blog" aria-current={!cat ? 'page' : undefined} className={`rounded-full border px-3 py-1 text-sm ${!cat ? 'border-brand-dark bg-brand-dark text-white' : 'border-line text-muted hover:border-ink'}`}>Todas</Link>
        {BLOG_CATEGORIES.filter((c) => used.has(c.name)).map((c) => (
          <Link key={c.slug} href={`/blog?categoria=${c.slug}`} aria-current={cat?.slug === c.slug ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${cat?.slug === c.slug ? 'border-brand-dark bg-brand-dark text-white' : 'border-line text-muted hover:border-ink'}`}>{c.name}</Link>
        ))}
      </nav>
      {posts.length ? (
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <article key={p.slug} className="card group flex flex-col overflow-hidden">
              <Link href={`/blog/${p.slug}`} tabIndex={-1} aria-hidden className="block aspect-[16/9] bg-brand-dark">
                {p.cover && <img src={p.cover} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:opacity-90" />}
              </Link>
              <div className="flex flex-1 flex-col p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-accent">{p.category}</p>
                <h2 className="font-display mt-2 text-xl font-bold leading-snug"><Link href={`/blog/${p.slug}`} className="hover:underline">{p.title}</Link></h2>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.excerpt}</p>
                <p className="mt-5 text-xs text-muted"><time dateTime={p.published_at}>{fmt(p.published_at)}</time> · {readingMinutes(p.body_md)} min de lectura</p>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="card mt-10 p-10 text-center text-muted">{cat ? 'Aún no hay artículos en esta categoría.' : 'Próximamente publicaremos guías y casos de éxito.'}</div>}
    </div></section>
  );
}
