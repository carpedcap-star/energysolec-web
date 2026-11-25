import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { publicServices } from '@/lib/services/service-catalog';
import { SERVICES } from '@/content/segments';
import { LeadForm } from '@/components/lead-form';

export const revalidate = 600;
export const generateStaticParams = () => SERVICES.map((s) => ({ slug: s.slug }));
const find = async (slug: string) => publicServices(await getStore().listServiceRows()).find((x) => x.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = await find((await params).slug);
  return s ? { title: s.name, description: s.summary ?? s.description?.slice(0, 155) ?? `${s.name} en Ecuador — Energy Solutions Ecuador.`, alternates: { canonical: `/servicios/${s.slug}` } } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const s = await find((await params).slug);
  if (!s) notFound();
  return (
    <section className="pb-24 pt-32"><div className="container-site grid gap-12 lg:grid-cols-[1.2fr_1fr]">
      <div className="min-w-0">
        <nav className="text-sm text-muted"><Link href="/servicios" className="hover:underline">Servicios</Link> / {s.name}</nav>
        <h1 className="font-display mt-3 [overflow-wrap:anywhere] text-4xl font-extrabold sm:text-5xl">{s.name}</h1>
        {s.segments.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{s.segments.map((g) => <Link key={g} href={`/soluciones/${g}`} className="rounded-full border border-line px-3 py-1 text-sm capitalize text-muted hover:border-ink">{g}</Link>)}</div>}
        {s.cover && <img src={s.cover} alt={s.name} className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover" />}
        {s.isPlaceholder ? (
          <>
            <p className="placeholder-badge mt-6">Contenido provisional</p>
            <p className="mt-4 leading-relaxed text-muted">La descripción detallada, los beneficios y el alcance de este servicio se publicarán con información validada por el área de Ingeniería. Escríbenos y te contamos cómo podemos ayudarte.</p>
          </>
        ) : (
          <>
            {s.summary && <p className="mt-6 text-lg leading-relaxed text-muted">{s.summary}</p>}
            <p className="mt-6 whitespace-pre-line leading-relaxed">{s.description}</p>
            {s.benefits.length > 0 && <><h2 className="font-display mt-10 text-2xl font-bold">Beneficios</h2><ul className="mt-4 list-disc space-y-2 pl-5">{s.benefits.map((b) => <li key={b}>{b}</li>)}</ul></>}
            {s.scope.length > 0 && <><h2 className="font-display mt-10 text-2xl font-bold">Alcance</h2><ul className="mt-4 list-disc space-y-2 pl-5">{s.scope.map((b) => <li key={b}>{b}</li>)}</ul></>}
          </>
        )}
      </div>
      <div className="card self-start p-6"><LeadForm source="servicio" topic={s.name} title="Solicita este servicio" /></div>
    </div></section>
  );
}
