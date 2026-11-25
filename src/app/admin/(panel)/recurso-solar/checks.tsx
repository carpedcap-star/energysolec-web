'use client';
import { useActionState } from 'react';
import { clearSolarCacheAction, verifySourcesAction } from '../../actions';
import { SOURCE_LABEL, type SourceId } from '@/lib/engine/resource';

const fmtTime = (iso: string) => new Intl.DateTimeFormat('es-EC', { timeStyle: 'short', dateStyle: 'medium', timeZone: 'America/Guayaquil' }).format(new Date(iso));

export function VerifySources() {
  const [state, action, pending] = useActionState(verifySourcesAction, null);
  const points = [...new Set(state?.checks?.map((c) => c.point) ?? [])];
  return (
    <section className="card p-5">
      <h2 className="font-semibold">Verificación en vivo</h2>
      <p className="mt-1 text-sm text-muted">Consulta ahora, sin caché, las tres fuentes en Guayaquil, Quito y Puerto Baquerizo Moreno, y valida sus respuestas.</p>
      <form action={action} className="mt-4"><button className="btn-dark" disabled={pending}>{pending ? 'Consultando fuentes…' : 'Verificar fuentes ahora'}</button></form>
      {state?.error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{state.error}</p>}
      {state?.checks && (
        <div role="status" className="mt-4">
          <p className="text-sm text-muted">Resultado de las {state.at ? fmtTime(state.at) : ''}: {state.checks.filter((c) => c.ok).length} de {state.checks.length} consultas correctas. Rendimiento anual en kWh/kWp, antes de pérdidas de sistema.</p>
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Resultado de la verificación por punto y fuente</caption>
              <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted"><tr><th scope="col" className="px-3 py-2">Punto</th>{(Object.keys(SOURCE_LABEL) as SourceId[]).map((s) => <th key={s} scope="col" className="px-3 py-2">{s}</th>)}</tr></thead>
              <tbody>{points.map((pt) => (
                <tr key={pt} className="border-t border-line align-top">
                  <th scope="row" className="px-3 py-2 text-left font-medium">{pt}</th>
                  {(Object.keys(SOURCE_LABEL) as SourceId[]).map((s) => {
                    const c = state.checks!.find((x) => x.point === pt && x.source === s)!;
                    return <td key={s} className="px-3 py-2">{c.ok
                      ? <><span className="font-semibold tabular-nums">{c.annual?.toLocaleString('es-EC')}</span><span className="block text-xs text-muted">{c.period ?? ''} · {(c.ms / 1000).toFixed(1)} s</span></>
                      : <span className="text-red-700"><span className="font-semibold">Falla</span><span className="block max-w-[14rem] text-xs [overflow-wrap:anywhere]">{c.error}</span></span>}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Las fuentes difieren entre sí; la calculadora adopta siempre la menor. Si una falla, se usa su último dato guardado; si fallan todas, un rendimiento regional conservador (parámetros).</p>
        </div>
      )}
    </section>
  );
}

export function ClearCache({ rows }: { rows: number }) {
  const [state, action, pending] = useActionState(clearSolarCacheAction, null);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm('¿Vaciar la caché? Los próximos estudios volverán a consultar las fuentes.')) e.preventDefault(); }} className="mt-4">
      <button className="btn-ghost !py-2" disabled={pending || rows === 0}>{pending ? 'Vaciando…' : 'Vaciar caché'}</button>
      {state?.cleared != null && <p role="status" className="mt-2 text-sm text-green-800">Se borraron {state.cleared} filas.</p>}
      {state?.error && <p role="alert" className="mt-2 text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
