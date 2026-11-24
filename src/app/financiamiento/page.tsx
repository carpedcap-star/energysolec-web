import { getStore } from '@/lib/data/store';
import { FinanceSimulator } from '@/components/finance-sim';
import { LeadForm } from '@/components/lead-form';
export const metadata = { title: 'Financiamiento y modelos de inversión solar', description: 'Compra directa, financiamiento, proyectos llave en mano y contratos PPA para sistemas solares en Ecuador.', alternates: { canonical: '/financiamiento' } };
export const dynamic = 'force-dynamic';
const MODELS = [
  ['Compra directa', 'Inversión propia con el mayor retorno a largo plazo.'],
  ['Financiamiento', 'Cuotas mensuales que pueden compensarse con el ahorro energético.'],
  ['Proyectos llave en mano', 'Un solo contrato desde la ingeniería hasta la puesta en marcha.'],
  ['Contratos PPA', 'Compra de energía a precio pactado, sujeta a evaluación y disponibilidad.'],
  ['Sin inversión inicial', 'Soluciones para empresas, sujetas a evaluación técnica y financiera.'],
];
export default async function Page() {
  const p = await getStore().getActiveParams();
  return (
    <section className="pb-24 pt-32"><div className="container-site">
      <p className="eyebrow">Financiamiento</p>
      <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Modelos de inversión a tu medida</h1>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{MODELS.map(([t, d]) => <div key={t} className="card p-6"><p className="font-semibold">{t}</p><p className="mt-2 text-sm text-muted">{d}</p></div>)}</div>
      <h2 className="font-display mt-16 text-2xl font-bold">Simulador de cuota</h2>
      <div className="mt-6"><FinanceSimulator rate={p.financial.financing.annualRate} years={p.financial.financing.years} /></div>
      <h2 className="font-display mt-16 text-2xl font-bold">Formulario de precalificación</h2>
      <div className="card mt-6 p-6"><LeadForm source="financiamiento" topic="Precalificación de financiamiento" submitLabel="Solicitar precalificación" /></div>
    </div></section>
  );
}
