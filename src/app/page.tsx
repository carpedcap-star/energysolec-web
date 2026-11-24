import Link from 'next/link';
import { getStore } from '@/lib/data/store';
import { SEGMENTS } from '@/content/segments';
import { IconArrow, IconBuilding, IconCalc, IconChart, IconFactory, IconHome, IconShield, IconBattery, IconPanel } from '@/components/icons';
import { StatCounter } from '@/components/stat-counter';
import { fmtKwp } from '@/lib/format';

export const revalidate = 300;

const SEG_ICON = { residencial: IconHome, comercial: IconBuilding, industrial: IconFactory };

export default async function Home() {
  const store = getStore();
  const [stats, projects, brands] = await Promise.all([store.listStats(), store.listProjects(), store.listBrands()]);
  const verified = stats.filter((s) => s.verified);
  const featured = projects.filter((p) => p.featured).slice(0, 3);

  return (
    <>
      {/* HERO — reemplazar el fondo por foto/video real de proyecto desde el panel (content_blocks home.hero) */}
      <section className="relative isolate overflow-hidden bg-brand-dark text-white">
        <HeroBackdrop />
        <div className="container-site relative grid min-h-[92vh] content-center gap-10 pb-16 pt-32 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div className="reveal">
            <p className="eyebrow !text-brand">Ingeniería solar · Ecuador</p>
            <h1 className="font-display mt-5 text-[2.6rem] font-extrabold leading-[1.02] sm:text-6xl lg:text-[4.4rem]">
              Transformamos la energía en <span className="text-brand">oportunidades.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/75">
              Ingeniería, tecnología y soluciones energéticas diseñadas para construir un futuro más eficiente, rentable y sostenible.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/calculadora" className="btn-primary">Descubre cuánto puedes ahorrar <IconArrow className="h-4 w-4" /></Link>
              <Link href="#soluciones" className="btn-ghost-dark">Explora nuestras soluciones</Link>
              <Link href="/contacto?tema=asesoria" className="btn-ghost-dark">Solicita una asesoría</Link>
            </div>
          </div>
          <div className="reveal hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur lg:block" style={{ animationDelay: '.15s' }}>
            <p className="text-sm text-white/60">Estudio solar en minutos</p>
            <p className="font-display mt-2 text-2xl font-bold">Tu factura, tu ubicación, tu ahorro real.</p>
            <ul className="mt-5 space-y-3 text-sm text-white/75">
              <li className="flex gap-3"><IconPanel className="h-5 w-5 shrink-0 text-brand" /> Irradiación de tu provincia con PVGIS y NASA POWER</li>
              <li className="flex gap-3"><IconChart className="h-5 w-5 shrink-0 text-brand" /> VAN, TIR, retorno y LCOE en tres escenarios</li>
              <li className="flex gap-3"><IconShield className="h-5 w-5 shrink-0 text-brand" /> Supuestos visibles, sin promesas infladas</li>
            </ul>
            <Link href="/calculadora" className="btn-primary mt-6 w-full">Calcular mi ahorro</Link>
          </div>
        </div>
      </section>

      {/* CONTADOR — solo indicadores verificados por Gerencia */}
      {verified.length > 0 && (
        <section className="border-b border-line bg-white">
          <div className="container-site grid grid-cols-2 gap-y-8 py-12 md:grid-cols-4 lg:grid-cols-7">
            {verified.map((s) => <StatCounter key={s.id} value={s.value} unit={s.unit} label={s.label} />)}
          </div>
        </section>
      )}

      {/* UNIDADES DE NEGOCIO */}
      <section id="soluciones" className="container-site scroll-mt-20 py-24">
        <div className="max-w-2xl">
          <p className="eyebrow">Unidades de negocio</p>
          <h2 className="font-display mt-3 text-3xl font-bold sm:text-4xl">Una solución energética para cada escala.</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {SEGMENTS.map((s, i) => {
            const Icon = SEG_ICON[s.slug];
            return (
              <Link key={s.slug} href={`/soluciones/${s.slug}`} className={`group relative flex min-h-[340px] flex-col overflow-hidden rounded-3xl p-8 transition hover:-translate-y-1 ${i === 2 ? 'bg-brand-dark text-white' : 'card'}`}>
                <Icon className={`h-10 w-10 ${i === 2 ? 'text-brand' : 'text-brand-accent'}`} />
                <p className={`mt-8 text-xs font-semibold uppercase tracking-[0.18em] ${i === 2 ? 'text-white/55' : 'text-muted'}`}>Energy Solutions</p>
                <h3 className="font-display mt-1 text-3xl font-extrabold">{s.name}</h3>
                <p className={`mt-4 text-[15px] leading-relaxed ${i === 2 ? 'text-white/70' : 'text-muted'}`}>{s.lead}</p>
                <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-semibold">Ver soluciones <IconArrow className="h-4 w-4 transition group-hover:translate-x-1" /></span>
                <span className="absolute inset-x-0 bottom-0 h-1 origin-left scale-x-0 bg-brand transition group-hover:scale-x-100" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="bg-white py-24">
        <div className="container-site grid gap-14 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="eyebrow">Por qué Energy Solutions</p>
            <h2 className="font-display mt-3 text-3xl font-bold sm:text-4xl">Ingeniería que se traduce en rentabilidad.</h2>
            <p className="mt-5 leading-relaxed text-muted">Dimensionamos cada sistema con datos de irradiación de tu ubicación, tu perfil de consumo y la estructura real de tu tarifa eléctrica. Te mostramos los supuestos, los riesgos y los escenarios antes de que inviertas.</p>
            <Link href="/nosotros" className="btn-ghost mt-8">Conoce la empresa</Link>
          </div>
          <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-2">
            {[
              [IconChart, 'Ahorro medible', 'Análisis por componentes de tu factura: energía, demanda y cargos fijos.'],
              [IconBattery, 'Continuidad operativa', 'Baterías y BESS para enfrentar cortes y racionamientos.'],
              [IconFactory, 'Capacidad EPC', 'Desde sistemas residenciales hasta centrales de varios megavatios.'],
              [IconShield, 'Respaldo tecnológico', 'Equipos de fabricantes reconocidos con garantías documentadas.'],
            ].map(([I, t, d]) => {
              const Icon = I as typeof IconChart;
              return (
                <div key={t as string} className="bg-white p-7">
                  <Icon className="h-7 w-7 text-brand-accent" />
                  <p className="mt-5 font-semibold">{t as string}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* PROYECTOS DESTACADOS */}
      {featured.length > 0 && (
        <section className="container-site py-24">
          <div className="flex items-end justify-between gap-6">
            <div><p className="eyebrow">Proyectos</p><h2 className="font-display mt-3 text-3xl font-bold sm:text-4xl">Proyectos ejecutados</h2></div>
            <Link href="/proyectos" className="btn-ghost hidden sm:inline-flex">Ver portafolio</Link>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {featured.map((p) => (
              <Link key={p.id} href={`/proyectos/${p.slug}`} className="card group overflow-hidden">
                <div className="aspect-[4/3] bg-brand-dark/90 bg-cover bg-center" style={p.cover ? { backgroundImage: `url(${p.cover})` } : undefined} />
                <div className="p-6"><p className="text-xs uppercase tracking-wider text-muted">{p.segment} · {p.province}</p><p className="font-display mt-1 text-xl font-bold">{p.title}</p>{p.capacity_kwp && <p className="mt-2 text-sm text-brand-accent">{fmtKwp(p.capacity_kwp)}</p>}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* MARCAS */}
      {brands.length > 0 && (
        <section className="border-y border-line bg-white py-14">
          <div className="container-site">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted">Tecnología de fabricantes reconocidos</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
              {brands.map((b) => b.logo
                ? <img key={b.id} src={b.logo} alt={b.name} className="h-8 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0" loading="lazy" />
                : <span key={b.id} className="font-display text-lg font-bold text-ink/45">{b.name}</span>)}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container-site py-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-brand p-10 sm:p-16">
          <IconCalc className="absolute -right-6 -top-6 h-48 w-48 text-brand-dark/10" />
          <h2 className="font-display max-w-2xl text-3xl font-extrabold text-brand-dark sm:text-5xl">¿Cuánto puedes ahorrar con energía solar?</h2>
          <p className="mt-4 max-w-xl text-brand-dark/75">Obtén un estudio de prefactibilidad con potencia recomendada, inversión, retorno y flujo de caja a 25 años.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/calculadora" className="btn-dark">Calcular mi ahorro</Link><Link href="/contacto?tema=cotizacion" className="btn border border-brand-dark/25 text-brand-dark hover:border-brand-dark">Cotizar mi proyecto</Link></div>
        </div>
      </section>
    </>
  );
}

/** Fondo abstracto de módulos solares en perspectiva, ligero (SVG) hasta cargar fotografía real. */
function HeroBackdrop() {
  return (
    <div className="absolute inset-0 -z-10" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_20%,rgba(253,201,19,.22),transparent_55%),radial-gradient(ellipse_at_10%_90%,rgba(0,130,170,.25),transparent_50%)]" />
      <svg className="absolute bottom-0 left-0 h-[60%] w-full opacity-[0.22]" viewBox="0 0 1200 500" preserveAspectRatio="xMidYMax slice">
        <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#0082AA" stopOpacity="0" /><stop offset="1" stopColor="#0082AA" /></linearGradient></defs>
        {Array.from({ length: 9 }).map((_, r) => Array.from({ length: 14 }).map((_, c) => {
          const y = 120 + r * r * 5 + r * 20, h = 8 + r * 4.5, w = 60 + r * 9, x = c * (w + 6) - r * 40 + 30;
          return <path key={`${r}-${c}`} d={`M${x} ${y + h} L${x + w * 0.12} ${y} L${x + w} ${y} L${x + w * 0.88} ${y + h} Z`} fill="url(#g)" stroke="#5fc3e0" strokeOpacity=".35" strokeWidth=".6" />;
        }))}
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-brand-dark to-transparent" />
    </div>
  );
}
