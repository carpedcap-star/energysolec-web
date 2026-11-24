import { getStore } from '@/lib/data/store';
export const metadata = { title: 'Marcas y tecnología', description: 'Fabricantes y tecnologías de paneles, inversores, baterías y estructuras que comercializa Energy Solutions Ecuador.', alternates: { canonical: '/marcas' } };
export const revalidate = 600;
export default async function Page() {
  const brands = await getStore().listBrands();
  return (
    <section className="pb-24 pt-32"><div className="container-site">
      <p className="eyebrow">Marcas y respaldo tecnológico</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Tecnología de fabricantes de primer nivel</h1>
      <p className="mt-4 max-w-2xl text-muted">Solo destacamos alianzas y representaciones con respaldo documental vigente.</p>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {brands.map((b) => (
          <div key={b.id} className="card flex flex-col p-6">
            <div className="grid h-16 place-items-center">{b.logo ? <img src={b.logo} alt={b.name} className="max-h-12 w-auto" /> : <span className="font-display text-xl font-bold">{b.name}</span>}</div>
            {b.relationship_verified && b.relationship && <p className="mt-4 text-center text-xs font-semibold uppercase tracking-wider text-brand-accent">{b.relationship}</p>}
            {b.description && <p className="mt-3 text-sm text-muted">{b.description}</p>}
          </div>
        ))}
      </div>
    </div></section>
  );
}
