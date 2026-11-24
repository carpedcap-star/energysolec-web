'use client';
import { useState } from 'react';
import { fmtUsd } from '@/lib/format';

/** Simulador de cuota referencial. Tasa y plazos vienen de los parámetros financieros del panel. */
export function FinanceSimulator({ rate, years }: { rate: number; years: number }) {
  const [amount, setAmount] = useState(15000), [down, setDown] = useState(30), [n, setN] = useState(years), [r, setR] = useState(rate * 100);
  const P = amount * (1 - down / 100), i = r / 100 / 12, m = n * 12;
  const pay = i ? (P * i) / (1 - (1 + i) ** -m) : P / m;
  return (
    <div className="card grid gap-6 p-6 md:grid-cols-[1.3fr_1fr]">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Monto del proyecto (USD)<input className="input mt-1" type="number" min={1000} value={amount} onChange={(e) => setAmount(+e.target.value)} /></label>
        <label className="text-sm">Entrada (%)<input className="input mt-1" type="number" min={0} max={90} value={down} onChange={(e) => setDown(+e.target.value)} /></label>
        <label className="text-sm">Plazo (años)<input className="input mt-1" type="number" min={1} max={15} value={n} onChange={(e) => setN(+e.target.value)} /></label>
        <label className="text-sm">Tasa anual referencial (%)<input className="input mt-1" type="number" min={0} max={30} step="0.1" value={r} onChange={(e) => setR(+e.target.value)} /></label>
      </div>
      <div className="rounded-2xl bg-brand-dark p-6 text-white">
        <p className="text-sm text-white/60">Cuota mensual referencial</p>
        <p className="font-display mt-1 text-4xl font-extrabold text-brand">{fmtUsd(pay)}</p>
        <p className="mt-3 text-sm text-white/70">Financiado: {fmtUsd(P)} · {m} cuotas</p>
        <p className="mt-4 text-xs text-white/50">Simulación referencial. No constituye oferta ni garantiza aprobación crediticia; las condiciones dependen de la entidad financiera y de la evaluación del cliente.</p>
      </div>
    </div>
  );
}
