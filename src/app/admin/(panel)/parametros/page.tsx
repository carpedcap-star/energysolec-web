import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { toFormValues } from '@/lib/services/params-form';
import { ParamsForm } from './params-form';

export const metadata: Metadata = { title: 'Parámetros de cálculo', description: 'Precios, pérdidas, finanzas y escenarios de la calculadora', alternates: { canonical: '/admin/parametros' } };

export default async function Page({ searchParams }: { searchParams: Promise<{ guardado?: string; pendiente?: string }> }) {
  const staff = await requireStaff('params');
  const { version, ...p } = await getStore().getActiveParams();
  const sp = await searchParams;
  const canValidate = ['superadmin', 'gerencia'].includes(staff.role);
  const tiers = p.pricing.pvTiers.map((t, i, a) => ({ up: i === a.length - 1 ? '' : String(t.upToKwp), price: String(t.usdPerKwp) }));
  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Parámetros de cálculo</h1>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">Versión activa {version}</span>
        {p.isPlaceholder ? <span className="placeholder-badge">Provisional</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Validados por Gerencia</span>}
      </div>
      <p className="mt-2 text-sm text-muted">Cada guardado crea una versión nueva; cada estudio registra la versión con la que se calculó.</p>
      {sp.guardado && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Guardado como versión {sp.guardado}.{sp.pendiente ? ' Quedó pendiente de validación por Gerencia.' : ''}</p>}
      <ParamsForm key={version} values={toFormValues(p)} tiers={tiers} validated={!p.isPlaceholder} canValidate={canValidate} />
    </div>
  );
}
