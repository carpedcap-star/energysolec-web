import type { Metadata } from 'next';
import Link from 'next/link';
import { TradeApplyForm } from '@/components/trade/apply-form';

export const metadata: Metadata = {
  title: 'Instaladores y distribuidores',
  description: 'Solicita tu cuenta comercial en Energy Solutions Ecuador: precios diferenciados para instaladores y distribuidores autorizados de equipos solares.',
  alternates: { canonical: '/profesionales' },
};

const STEPS = [
  ['Solicita tu cuenta', 'Completa el formulario con los datos de tu empresa y tu RUC.'],
  ['Revisamos tu solicitud', 'Nuestro equipo verifica la información y aprueba el tipo de cuenta.'],
  ['Activa tu acceso', 'Recibes un enlace personal para crear tu contraseña.'],
  ['Compra con tu precio', 'En la tienda ves los precios de tu nivel y tus pedidos se registran a nombre de tu empresa.'],
];

export default function Page() {
  return (
    <section className="pb-24 pt-32">
      <div className="container-site grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div className="min-w-0">
          <p className="eyebrow">Programa para profesionales</p>
          <h1 className="font-display mt-3 text-4xl font-extrabold [overflow-wrap:anywhere] sm:text-5xl">Instaladores y distribuidores</h1>
          <p className="mt-4 text-muted">Si instalas o comercializas sistemas fotovoltaicos, solicita una cuenta comercial para comprar con precios diferenciados en nuestra tienda.</p>
          <ol className="mt-8 space-y-5">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-dark text-sm font-bold text-white">{i + 1}</span>
                <span><b className="block">{t}</b><span className="text-sm text-muted">{d}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-8 text-sm text-muted">¿Ya tienes cuenta? <Link href="/cuenta/ingresar" className="font-semibold text-ink underline">Ingresa aquí</Link>.</p>
        </div>
        <div className="min-w-0"><TradeApplyForm /></div>
      </div>
    </section>
  );
}
