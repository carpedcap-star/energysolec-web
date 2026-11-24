import Link from 'next/link';
import { getStore } from '@/lib/data/store';
import { publicServices } from '@/lib/services/service-catalog';
import { IconArrow } from '@/components/icons';

export const metadata = { title: 'Servicios de ingeniería solar y eléctrica', description: 'Ingeniería fotovoltaica, EPC, O&M, termografía, auditorías energéticas, subestaciones y capacitación técnica en Ecuador.', alternates: { canonical: '/servicios' } };
export const revalidate = 600;

export default async function Page() {
  const services = publicServices(await getStore().listServiceRows());
  return (
    <section className="pb-24 pt-32"><div className="container-site">
      <p className="eyebrow">Servicios especializados</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Ingeniería y servicios para todo el ciclo de vida de tu sistema</h1>
      <div className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s, i) => (
          <Link key={s.slug} href={`/servicios/${s.slug}`} className="group flex items-center justify-between gap-4 bg-white p-7 hover:bg-surface">
            <span className="min-w-0">
              <span className="font-display text-sm font-bold text-brand-accent">{String(i + 1).padStart(2, '0')}</span>
              <span className="mt-2 block font-semibold">{s.name}</span>
              {s.summary && <span className="mt-1 block text-sm text-muted">{s.summary}</span>}
            </span>
            <IconArrow className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
          </Link>
        ))}
      </div>
    </div></section>
  );
}
