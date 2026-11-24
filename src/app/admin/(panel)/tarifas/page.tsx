import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { JsonEditor } from '../json-editor';
import { saveTariffAction } from '../../actions';
export default async function Page() {
  await requireStaff('tariffs');
  const tariffs = await getStore().listTariffs();
  const blank = { code: 'NUEVA', name: '', segment: 'comercial', voltage_level: 'BT', has_demand_charge: false, demand_usd_per_kw: null, commercialization_usd: 0, other_charges_pct: 0, energy_blocks: [{ from_kwh: 0, to_kwh: null, usd_per_kwh: 0 }], source_note: '', is_placeholder: true };
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Tarifas eléctricas</h1>
      <p className="mt-2 text-sm text-muted">Carga el pliego tarifario vigente de ARCONEL por distribuidora. Indica siempre la fuente (resolución y fecha). Mientras una tarifa sea provisional, el estudio lo advierte al cliente.</p>
      <div className="mt-6 space-y-6">
        {tariffs.map((t) => (
          <details key={t.id ?? t.code} className="card p-5">
            <summary className="cursor-pointer font-semibold">{t.code} — {t.name} {t.is_placeholder && <span className="placeholder-badge ml-2">Provisional</span>}</summary>
            <JsonEditor initial={t} action={saveTariffAction} />
          </details>
        ))}
        <details className="card p-5"><summary className="cursor-pointer font-semibold">+ Nueva tarifa</summary><JsonEditor initial={blank} action={saveTariffAction} /></details>
      </div>
    </div>
  );
}
