import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SEGMENTS } from '@/content/segments';
import { LeadForm } from '@/components/lead-form';
import { getStore } from '@/lib/data/store';
import { IconArrow, IconBolt } from '@/components/icons';
import { fmtKwp } from '@/lib/format';
import { getBlock } from '@/lib/content';

export const revalidate = 300;
export const generateStaticParams = () => SEGMENTS.map((s) => ({ segmento: s.slug }));
export async function generateMetadata({ params }: { params: Promise<{ segmento: string }> }): Promise<Metadata> {
  const { segmento } = await params;
  const s = SEGMENTS.find((x) => x.slug === segmento);
  if (!s) return {};
  const b = await getBlock(`soluciones-${s.slug}`, 'main');
  return { title: `Energía solar ${s.name.toLowerCase()} en Ecuador`, description: b.text('lead'), alternates: { canonical: `/soluciones/${s.slug}` } };
}

export default async function SegmentPage({ params }: { params: Promise<{ segmento: string }> }) {
  const { segmento } = await params;
  const s = SEGMENTS.find((x) => x.slug === segmento);
  if (!s) notFound();
  const [all, b] = await Promise.all([getStore().listProjects(), getBlock(`soluciones-${s.slug}`, 'main')]);
  const projects = all.filter((p) => p.segment === s.slug).slice(0, 3);
  const industrial = s.slug === 'industrial';
  return (
    <>
      <section className={`${industrial ? 'bg-brand-dark text-white' : 'bg-white'} pb-20 pt-36`}>
        <div className="container-site">
          <p className={`eyebrow ${industrial ? '!text-brand' : ''}`}>{b.text('eyebrow')}</p>
          <h1 className="font-display mt-4 max-w-4xl [overflow-wrap:anywhere] text-4xl font-extrabold leading-[1.05] sm:text-6xl">{b.text('title')}</h1>
          <p className={`mt-6 max-w-2xl text-lg leading-relaxed ${industrial ? 'text-white/70' : 'text-muted'}`}>{b.text('lead')}</p>
          <div className="mt-8 flex flex-wrap gap-2">{b.list('audience').map((a) => <span key={a} className={`rounded-full border px-3 py-1 text-sm ${industrial ? 'border-white/15 text-white/75' : 'border-line text-muted'}`}>{a}</span>)}</div>
          <div className="mt-10 flex flex-wrap gap-3"><Link href={`/calculadora?segmento=${s.slug}`} className="btn-primary">Calcular mi ahorro</Link>{industrial ? <Link href="/cotizacion-industrial" className="btn-ghost-dark">Solicitar cotización industrial</Link> : <a href="#cotizar" className="btn-ghost">Solicitar propuesta</a>}</div>
        </div>
      </section>

      {s.goals && (
        <section className="container-site py-20">
          <p className="eyebrow">¿Qué buscas?</p>
          <h2 className="font-display mt-3 text-3xl font-bold">Elige tu objetivo y te mostramos la solución adecuada.</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {s.goals.map((g) => (
              <Link key={g.id} href={`/calculadora?segmento=${s.slug}&objetivo=${g.id}`} className="card group p-7 transition hover:border-brand-dark">
                <IconBolt className="h-7 w-7 text-brand-accent" /><p className="font-display mt-5 text-xl font-bold">{g.title}</p>
                <p className="mt-2 text-sm text-muted">{g.text}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold">Calcular <IconArrow className="h-4 w-4" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={`${s.goals ? 'bg-white' : ''} py-20`}>
        <div className="container-site">
          <p className="eyebrow">Soluciones</p>
          <h2 className="font-display mt-3 text-3xl font-bold">Lo que hacemos por ti</h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {b.items('solutions').map((x, i) => (
              <div key={i} className="bg-white p-7">
                <p className="font-display text-sm font-bold text-brand-accent">{String(i + 1).padStart(2, '0')}</p>
                <p className="mt-3 font-semibold">{x.title}</p><p className="mt-2 text-sm leading-relaxed text-muted">{x.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {projects.length > 0 && (
        <section className="container-site py-20">
          <h2 className="font-display text-3xl font-bold">Proyectos {s.name.toLowerCase()}es</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">{projects.map((p) => <Link key={p.id} href={`/proyectos/${p.slug}`} className="card p-6"><p className="font-display text-lg font-bold">{p.title}</p><p className="text-sm text-muted">{p.province}{p.capacity_kwp ? ` · ${fmtKwp(p.capacity_kwp)}` : ''}</p></Link>)}</div>
        </section>
      )}

      <section id="cotizar" className="scroll-mt-20 bg-brand-dark py-20">
        <div className="container-site grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div className="text-white">
            <p className="eyebrow !text-brand">{b.text('eyebrow')}</p>
            <h2 className="font-display mt-3 text-3xl font-bold">{b.text('formTitle')}</h2>
            <p className="mt-4 text-white/70">{b.text('formText')}</p>
          </div>
          <LeadForm source="cotizacion" segment={s.slug} topic={`Cotización ${s.name}`} dark />
        </div>
      </section>
    </>
  );
}
