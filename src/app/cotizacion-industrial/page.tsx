import type { Metadata } from 'next';
import { IndustrialQuoteForm } from '@/components/industrial/quote-form';

export const metadata: Metadata = {
  title: 'Cotización industrial',
  description: 'Solicita una propuesta para tu industria: solar en cubierta o suelo, flotante, BESS, hibridación, media tensión, SCADA y O&M. Adjunta planillas, curva de carga y planos.',
  alternates: { canonical: '/cotizacion-industrial' },
};

const STEPS = ['Recibimos tu solicitud y documentos', 'Un asesor comercial toma tu caso', 'Ingeniería evalúa consumo, sitio y conexión', 'Te contactamos con el alcance y los siguientes pasos'];

export default function Page() {
  return (
    <section className="pb-24 pt-32">
      <div className="container-site grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div className="min-w-0">
          <p className="eyebrow">Energy Solutions Industrial</p>
          <h1 className="font-display mt-3 text-4xl font-extrabold [overflow-wrap:anywhere] sm:text-5xl">Cotización industrial</h1>
          <p className="mt-4 text-muted">Para industrias, empacadoras, camaroneras, agroindustrias y plantas productivas. Cuanta más información compartas, más precisa será la primera evaluación.</p>
          <ol className="mt-8 space-y-4">
            {STEPS.map((t, i) => (
              <li key={t} className="flex gap-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line text-sm font-bold">{i + 1}</span><span className="pt-1 text-sm">{t}</span></li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-muted">Tus documentos se guardan en un almacenamiento privado y solo los ve el equipo que evalúa tu proyecto.</p>
        </div>
        <div className="min-w-0"><IndustrialQuoteForm /></div>
      </div>
    </section>
  );
}
