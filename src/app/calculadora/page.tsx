import type { Metadata } from 'next';
import { COVERAGE, DISTRIBUTORS } from '@/content/tarifas/pliego-2026';
import { TARIFF_CHOICES } from '@/lib/services/tariff-select';
import { CalculatorWizard } from '@/components/calculator/wizard';
import { billAiEnabled } from '@/lib/services/bill-extractor';

export const metadata: Metadata = {
  title: 'Calculadora solar Ecuador',
  description: 'Calcula la potencia solar, inversión, ahorro, retorno, VAN y TIR de tu sistema fotovoltaico con datos de irradiación de tu provincia y tu tarifa eléctrica.',
  alternates: { canonical: '/calculadora' },
};
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const seg = ['residencial', 'comercial', 'industrial'].includes(q.segmento ?? '') ? (q.segmento as 'residencial') : undefined;
  return (
    <section className="pb-24 pt-32">
      <div className="container-site">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <p className="eyebrow">Calculadora solar inteligente</p>
          <h1 className="font-display mt-3 text-4xl font-extrabold sm:text-5xl">Descubre cuánto puedes ahorrar</h1>
          <p className="mt-4 text-muted">Irradiación de tu ubicación, tu consumo y tu tarifa. Sube tu planilla y compara tres alternativas: conectada a la red, híbrida con baterías y aislada, con todos los supuestos visibles.</p>
        </div>
        <CalculatorWizard distributors={DISTRIBUTORS.map(({ code, name }) => ({ code, name }))} coverage={COVERAGE} tariffChoices={TARIFF_CHOICES} initialSegment={seg} initialObjective={q.objetivo} billUpload={billAiEnabled()} />
      </div>
    </section>
  );
}
