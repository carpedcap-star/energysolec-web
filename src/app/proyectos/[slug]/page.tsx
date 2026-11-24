import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getStore } from '@/lib/data/store';
import { fmtKwh, fmtKwp, fmtNum, fmtUsd } from '@/lib/format';

export const revalidate = 300;
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = (await getStore().listProjects()).find((x) => x.slug === slug);
  if (!p) notFound();
  const facts: [string, string | null][] = [
    ['Cliente', p.client_name], ['Ubicación', [p.city, p.province].filter(Boolean).join(', ') || null], ['Industria', p.industry],
    ['Capacidad instalada', p.capacity_kwp ? fmtKwp(p.capacity_kwp) : null], ['Potencia de inversores', p.inverter_kw ? `${fmtNum(p.inverter_kw)} kW` : null],
    ['Paneles', p.panel_count ? fmtNum(p.panel_count, 0) : null], ['Tipo de instalación', p.installation_type], ['Tecnología', p.technology.join(', ') || null],
    [p.generation_is_measured ? 'Generación anual medida' : 'Generación anual estimada', p.annual_generation_kwh ? fmtKwh(p.annual_generation_kwh) : null],
    ['Ahorro económico anual', p.annual_savings_usd ? fmtUsd(p.annual_savings_usd) : null], ['CO₂ evitado', p.co2_avoided_t ? `${fmtNum(p.co2_avoided_t)} t/año` : null],
    ['Ejecución', p.executed_on], ['Estado', p.status],
  ];
  return (
    <section className="pb-24 pt-32">
      <div className="container-site">
        <nav className="text-sm text-muted"><Link href="/proyectos" className="hover:underline">Proyectos</Link> / {p.title}</nav>
        <h1 className="font-display mt-4 text-4xl font-extrabold sm:text-5xl">{p.title}</h1>
        <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="aspect-[16/9] rounded-3xl bg-brand-dark bg-cover bg-center" style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined} />
            {p.description && <p className="mt-8 whitespace-pre-line leading-relaxed">{p.description}</p>}
            {p.testimonial && <blockquote className="mt-10 border-l-4 border-brand pl-6 text-lg italic">“{p.testimonial}”<footer className="mt-2 text-sm not-italic text-muted">— {p.testimonial_author}</footer></blockquote>}
          </div>
          <dl className="card divide-y divide-line self-start text-sm">{facts.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between gap-4 p-4"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>
        </div>
      </div>
    </section>
  );
}
