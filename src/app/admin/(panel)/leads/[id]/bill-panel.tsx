import type { BillUpload } from '@/lib/data/types';
import type { BillData } from '@/lib/services/bill';
import { MONTHS_ES } from '@/lib/format';

type Confirmed = { monthlyKwh?: number; monthlyHistoryKwh?: number[]; monthlyBillUsd?: number; demandKw?: number };
const n = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${v.toLocaleString('es-EC')}${unit}`);

/** Planillas subidas por el lead: lo que leyó la IA frente a lo que confirmó el cliente, y el archivo original. */
export function BillPanel({ bills }: { bills: BillUpload[] }) {
  return (
    <section className="mt-8">
      <h2 className="font-semibold">Planilla eléctrica</h2>
      <p className="mt-1 text-xs text-muted">Documento con datos personales: no lo reenvíes ni lo descargues en equipos compartidos.</p>
      <div className="mt-3 space-y-3">
        {bills.map((b) => {
          const x = (b.extracted ?? {}) as { read?: BillData; confirmed?: Confirmed };
          const r = x.read, c = x.confirmed;
          const rows: [string, string, string][] = [
            ['Consumo mensual', r?.energyKwh != null ? n(r.energyKwh, ' kWh') : '—', c?.monthlyHistoryKwh ? `${n(Math.round(c.monthlyHistoryKwh.reduce((a, v) => a + v, 0) / 12), ' kWh')} (prom. 12 meses)` : n(c?.monthlyKwh, ' kWh')],
            ['Valor de la factura', r?.electricityUsd != null ? `$${n(r.electricityUsd)}` : r?.totalUsd != null ? `$${n(r.totalUsd)} (total)` : '—', c?.monthlyBillUsd != null ? `$${n(c.monthlyBillUsd)}` : '—'],
            ['Demanda', n(r?.demandKw, ' kW'), n(c?.demandKw || null, ' kW')],
          ];
          return (
            <div key={b.id} className="card p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">{new Date(b.created_at).toLocaleString('es-EC')} · {b.confirmed_by_user ? 'Datos confirmados por el cliente' : 'Sin confirmar'}</p>
                <a href={`/admin/planillas/${b.id}`} target="_blank" rel="noopener" className="btn-ghost !px-3 !py-1.5 text-xs">Ver archivo</a>
              </div>
              {r && <p className="mt-2 text-muted [overflow-wrap:anywhere]">{[r.distributorRaw, r.tariffCategory, r.billingPeriod].filter(Boolean).join(' · ')}</p>}
              <div className="relative mt-3 overflow-x-auto">
                <table className="w-full min-w-[22rem] text-left">
                  <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">Dato</th><th className="py-1 font-medium">Leído por IA</th><th className="py-1 font-medium">Confirmado</th></tr></thead>
                  <tbody className="divide-y divide-line">{rows.map(([k, a, z]) => <tr key={k}><td className="py-1.5 text-muted">{k}</td><td className="py-1.5">{a}</td><td className="py-1.5 font-medium">{z}</td></tr>)}</tbody>
                </table>
              </div>
              {r && r.history.length > 0 && (
                <p className="mt-3 text-xs text-muted [overflow-wrap:anywhere]">Historial leído: {r.history.map((h) => `${MONTHS_ES[Number(h.month.slice(5)) - 1]} ${h.month.slice(2, 4)}: ${n(h.kwh)}`).join(' · ')} kWh</p>
              )}
              {r?.notes && <p className="mt-2 text-xs text-muted">Nota de la lectura: {r.notes}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
