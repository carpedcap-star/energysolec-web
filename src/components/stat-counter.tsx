'use client';
import { useEffect, useRef, useState } from 'react';

/** Contador animado al entrar en pantalla. Solo recibe indicadores verificados. */
export function StatCounter({ value, unit, label }: { value: number; unit: string | null; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      if (reduce) return setV(value);
      const t0 = performance.now();
      const step = (t: number) => { const p = Math.min(1, (t - t0) / 1400); setV(value * (1 - (1 - p) ** 3)); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, [value]);
  const d = value % 1 ? 1 : 0;
  return (
    <div ref={ref} className="px-2">
      <p className="font-display text-3xl font-extrabold tabular-nums">{v.toLocaleString('es-EC', { maximumFractionDigits: d, minimumFractionDigits: d })}{unit && <span className="ml-1 text-base text-brand-accent">{unit}</span>}</p>
      <p className="mt-1 text-xs leading-snug text-muted">{label}</p>
    </div>
  );
}
