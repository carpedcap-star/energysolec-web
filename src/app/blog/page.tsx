export const metadata = { title: 'Blog y noticias de energía solar', alternates: { canonical: '/blog' } };
const CATS = ['Energía solar residencial', 'Energía solar industrial', 'Almacenamiento energético', 'Eficiencia energética', 'Regulación eléctrica ecuatoriana', 'Innovación tecnológica', 'Casos de éxito', 'Guías para instaladores', 'Retorno de inversión', 'Movilidad eléctrica'];
export default function Page() {
  return (
    <section className="pb-24 pt-32"><div className="container-site">
      <p className="eyebrow">Blog y noticias</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Conocimiento en energía solar</h1>
      <div className="mt-8 flex flex-wrap gap-2">{CATS.map((c) => <span key={c} className="rounded-full border border-line px-3 py-1 text-sm text-muted">{c}</span>)}</div>
      <div className="card mt-10 p-10 text-center text-muted">Próximamente publicaremos guías y casos de éxito.</div>
    </div></section>
  );
}
