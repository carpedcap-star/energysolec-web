import { notFound } from 'next/navigation';
import { SERVICES } from '@/content/segments';
import { LeadForm } from '@/components/lead-form';
export const generateStaticParams = () => SERVICES.map((s) => ({ slug: s.slug }));
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const s = SERVICES.find((x) => x.slug === slug); return s ? { title: s.name, alternates: { canonical: `/servicios/${s.slug}` } } : {};
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = SERVICES.find((x) => x.slug === slug); if (!s) notFound();
  return (
    <section className="pb-24 pt-32"><div className="container-site grid gap-12 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <p className="eyebrow">Servicio</p>
        <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">{s.name}</h1>
        {/* Descripción, beneficios, alcance y fotografías se administran desde el panel (tabla services). */}
        <p className="placeholder-badge mt-6">Contenido provisional</p>
        <p className="mt-4 leading-relaxed text-muted">La descripción detallada, los beneficios, el alcance y las fotografías de este servicio se cargarán desde el panel administrativo con información validada por el área de Ingeniería.</p>
      </div>
      <div className="card p-6"><LeadForm source="servicio" topic={s.name} title="Solicita este servicio" /></div>
    </div></section>
  );
}
