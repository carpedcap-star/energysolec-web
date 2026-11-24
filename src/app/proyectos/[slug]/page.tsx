import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStore } from '@/lib/data/store';
import type { Metadata } from 'next';
import { fmtKwh, fmtKwp, fmtNum, fmtUsd } from '@/lib/format';
import { PROJECT_STATUSES } from '@/lib/data/types';

export const revalidate = 300;
const find = async (slug: string) => (await getStore().listProjects()).find((x) => x.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await find((await params).slug);
  if (!p) return {};
  const what = [p.capacity_kwp ? fmtKwp(p.capacity_kwp) : null, p.segment, p.province].filter(Boolean).join(' · ');
  return { title: p.title, description: (p.description?.slice(0, 155) || `Proyecto fotovoltaico ${what}`).trim(), alternates: { canonical: `/proyectos/${p.slug}` }, openGraph: p.cover ? { images: [p.cover] } : undefined };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await find(slug);
  if (!p) notFound();
  const facts: [string, string | null][] = [
    ['Cliente', p.client_name], ['Ubicación', [p.city, p.province].filter(Boolean).join(', ') || null], ['Industria', p.industry],
    ['Capacidad instalada', p.capacity_kwp ? fmtKwp(p.capacity_kwp) : null], ['Potencia de inversores', p.inverter_kw ? `${fmtNum(p.inverter_kw)} kW` : null],
    ['Paneles', p.panel_count ? fmtNum(p.panel_count, 0) : null], ['Tipo de instalación', p.installation_type], ['Tecnología', p.technology.join(', ') || null],
    [p.generation_is_measured ? 'Generación anual medida' : 'Generación anual estimada', p.annual_generation_kwh ? fmtKwh(p.annual_generation_kwh) : null],
    ['Ahorro económico anual', p.annual_savings_usd ? fmtUsd(p.annual_savings_usd) : null], ['CO₂ evitado', p.co2_avoided_t ? `${fmtNum(p.co2_avoided_t)} t/año` : null],
    ['Ejecución', p.executed_on ? new Date(`${p.executed_on}T12:00:00`).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' }) : null],
    ['Estado', PROJECT_STATUSES.find((s) => s.id === p.status)?.label ?? null],
  ];
  return (
    <section className="pb-24 pt-32">
      <div className="container-site">
        <nav className="text-sm text-muted"><Link href="/proyectos" className="hover:underline">Proyectos</Link> / {p.title}</nav>
        <h1 className="font-display mt-4 break-words text-4xl font-extrabold max-sm:hyphens-auto sm:text-5xl">{p.title}</h1>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {p.cover ? <img src={p.cover} alt={`Instalación fotovoltaica: ${p.title}`} className="aspect-[16/9] w-full rounded-3xl bg-brand-dark object-cover" /> : <div className="aspect-[16/9] rounded-3xl bg-brand-dark" />}
            {p.gallery.length > 0 && (
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Galería del proyecto">
                {p.gallery.map((src, i) => <li key={src}><a href={src} target="_blank" rel="noopener"><img src={src} alt={`${p.title}, foto ${i + 1}`} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /></a></li>)}
              </ul>
            )}
            {p.description && <p className="mt-8 whitespace-pre-line leading-relaxed">{p.description}</p>}
            {p.testimonial && <blockquote className="mt-10 border-l-4 border-brand pl-6 text-lg italic">“{p.testimonial}”<footer className="mt-2 text-sm not-italic text-muted">— {p.testimonial_author}</footer></blockquote>}
          </div>
          <dl className="card divide-y divide-line self-start text-sm">{facts.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-4 p-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>
        </div>
      </div>
    </section>
  );
}
