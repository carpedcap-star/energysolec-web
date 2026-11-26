import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { StatRow } from './stat-row';
export default async function Page() {
  await requireStaff('stats');
  const stats = await getStore().listStats();
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Indicadores de la página de inicio</h1>
      <p className="mt-2 text-sm text-muted">Solo se publican los indicadores marcados como verificados, con su fuente documentada. Nunca se muestran cifras estimadas. Un indicador sin verificar se guarda como borrador.</p>
      <div className="mt-6 space-y-3">
        {stats.map((s) => <StatRow key={s.id} stat={s} />)}
      </div>
    </div>
  );
}
