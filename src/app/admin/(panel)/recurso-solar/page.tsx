import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { CACHE_TTL_DAYS, SOURCE_LABEL, SOURCES } from '@/lib/engine/resource';
import { fmtEc, summaryText } from '@/lib/services/followup';
import { ClearCache, VerifySources } from './checks';

export const metadata: Metadata = { title: 'Recurso solar', description: 'Fuentes de irradiación y caché', robots: { index: false } };

export default async function Page() {
  await requireStaff('params');
  const store = getStore();
  const [stats, runs] = await Promise.all([store.solarCacheStats(), store.listCronRuns(30)]);
  const lastCheck = runs.find((r) => r.summary && 'fuentes' in r.summary);
  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold">Recurso solar</h1>
      <p className="mt-1 text-sm text-muted">La calculadora consulta PVGIS-NSRDB, PVGIS-ERA5 y NASA POWER sin pérdidas de sistema y adopta el rendimiento menor. Cada resultado se guarda {CACHE_TTL_DAYS} días por zona de unos 5 km e inclinación.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Caché</h2>
          <dl className="mt-3 divide-y divide-line text-sm">
            {([
              ['Zonas guardadas', stats.cells.toLocaleString('es-EC')],
              ...SOURCES.map((s) => [SOURCE_LABEL[s], `${(stats.bySource[s] ?? 0).toLocaleString('es-EC')} zonas`] as [string, string]),
              ['Consulta más antigua', stats.oldest ? fmtEc(stats.oldest) : '—'],
              ['Consulta más reciente', stats.newest ? fmtEc(stats.newest) : '—'],
            ] as [string, string][]).map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="whitespace-nowrap text-right font-medium">{v}</dd></div>)}
          </dl>
          <ClearCache rows={stats.rows} />
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Última verificación diaria</h2>
          {lastCheck
            ? <p className="mt-3 text-sm"><span className="text-muted">{fmtEc(lastCheck.started_at)} · </span>{summaryText({ fuentes: lastCheck.summary!.fuentes })}</p>
            : <p className="mt-3 text-sm text-muted">Aún no corre. La tarea programada verifica las tres fuentes cada mañana (ver «Mensajes y tareas»).</p>}
        </section>
      </div>
      <div className="mt-6"><VerifySources /></div>
    </div>
  );
}
