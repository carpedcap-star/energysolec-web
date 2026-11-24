import { getStore } from '@/lib/data/store';
import { BRAND_ASSET_KINDS } from '@/lib/data/types';

export const metadata = { title: 'Marcas y tecnología', description: 'Fabricantes y tecnologías de paneles, inversores, baterías y estructuras que comercializa Energy Solutions Ecuador.', alternates: { canonical: '/marcas' } };
export const revalidate = 600;
const kindLabel = (k: string) => BRAND_ASSET_KINDS.find((x) => x.id === k)?.label ?? 'Documento';

export default async function Page() {
  const brands = await getStore().listBrands();
  return (
    <section className="pb-24 pt-32"><div className="container-site">
      <p className="eyebrow">Marcas y respaldo tecnológico</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Tecnología de fabricantes de primer nivel</h1>
      <p className="mt-4 max-w-2xl text-muted">Solo indicamos alianzas y representaciones con respaldo documental vigente. Las demás marcas son fabricantes con los que trabajamos, sin una relación comercial declarada.</p>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {brands.map((b) => (
          <article key={b.id} className="card flex flex-col p-6">
            <div className="grid h-16 place-items-center">{b.logo ? <img src={b.logo} alt={b.name} className="max-h-12 w-auto max-w-full object-contain" /> : <h2 className="font-display text-xl font-bold">{b.name}</h2>}</div>
            {b.logo && <h2 className="sr-only">{b.name}</h2>}
            {b.relationship && <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wider text-brand-accent">{b.relationship}</p>}
            {b.description && <p className="mt-3 text-sm text-muted">{b.description}</p>}
            {b.assets.length > 0 && (
              <ul className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
                {b.assets.map((a, i) => (
                  <li key={i}><a href={a.url} target="_blank" rel="noopener" className="text-brand-accent hover:underline"><span className="text-xs uppercase tracking-wide text-muted">{kindLabel(a.kind)} · </span>{a.title}</a></li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </div></section>
  );
}
