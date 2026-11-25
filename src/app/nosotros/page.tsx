import type { Metadata } from 'next';
import { getBlock } from '@/lib/content';

export const revalidate = 300;
export async function generateMetadata(): Promise<Metadata> {
  const b = await getBlock('nosotros', 'main');
  return { title: 'Nosotros', description: b.text('lead'), alternates: { canonical: '/nosotros' } };
}

export default async function Page() {
  const b = await getBlock('nosotros', 'main');
  const img = b.image('image');
  const sections: [string, string][] = [['Historia', b.text('history')], ['Misión', b.text('mission')], ['Visión', b.text('vision')]];
  const values = b.list('values');
  const complete = sections.some(([, v]) => v) || values.length > 0;
  return (
    <section className="pb-24 pt-32"><div className="container-site max-w-3xl">
      <p className="eyebrow">Nosotros</p>
      <h1 className="font-display mt-3 [overflow-wrap:anywhere] text-4xl font-extrabold sm:text-5xl">{b.text('title')}</h1>
      {b.isPlaceholder && <span className="placeholder-badge mt-4">Contenido provisional</span>}
      <p className="mt-6 text-lg leading-relaxed text-muted">{b.text('lead')}</p>
      {img && <img src={img.url} alt={b.text('imageAlt')} className="mt-10 aspect-[16/9] w-full rounded-3xl object-cover" />}
      {sections.filter(([, v]) => v).map(([h, v]) => (
        <div key={h} className="mt-12"><h2 className="font-display text-2xl font-bold">{h}</h2><p className="mt-3 whitespace-pre-line leading-relaxed text-muted">{v}</p></div>
      ))}
      {values.length > 0 && (
        <div className="mt-12"><h2 className="font-display text-2xl font-bold">Valores</h2>
          <ul className="mt-4 flex flex-wrap gap-2">{values.map((v) => <li key={v} className="rounded-full border border-line px-3 py-1 text-sm">{v}</li>)}</ul></div>
      )}
      {!complete && <div className="card mt-10 p-6"><p className="text-sm text-muted">Historia, misión, visión, equipo directivo, certificaciones y fotografías se cargarán con información oficial de la empresa.</p></div>}
    </div></section>
  );
}
