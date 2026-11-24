import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { saveStatAction } from '../../actions';
export default async function Page() {
  await requireStaff('stats');
  const stats = await getStore().listStats();
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Indicadores de la página de inicio</h1>
      <p className="mt-2 text-sm text-muted">Solo se publican los indicadores marcados como verificados, con su fuente documentada. Nunca se muestran cifras estimadas.</p>
      <div className="mt-6 space-y-3">
        {stats.map((s) => (
          <form key={s.id} action={saveStatAction} className="card grid items-end gap-3 p-4 sm:grid-cols-[1.4fr_.8fr_.5fr_1.6fr_auto_auto]">
            <input type="hidden" name="id" value={s.id} /><input type="hidden" name="sort" value={s.sort} />
            <label className="text-xs text-muted">Indicador<input name="label" defaultValue={s.label} className="input mt-1" /></label>
            <label className="text-xs text-muted">Valor<input name="value" type="number" step="any" min={0} defaultValue={s.value} className="input mt-1" /></label>
            <label className="text-xs text-muted">Unidad<input name="unit" defaultValue={s.unit ?? ''} className="input mt-1" /></label>
            <label className="text-xs text-muted">Fuente del dato<input name="source_note" defaultValue={s.source_note} required className="input mt-1" /></label>
            <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="verified" defaultChecked={s.verified} /> Verificado</label>
            <button className="btn-dark !py-2">Guardar</button>
          </form>
        ))}
      </div>
    </div>
  );
}
