import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { JsonEditor } from '../json-editor';
import { saveParamsAction } from '../../actions';
export default async function Page() {
  await requireStaff('params');
  const p = await getStore().getActiveParams();
  const { version, ...editable } = p;
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Parámetros de cálculo <span className="text-base font-normal text-muted">· versión activa {version}</span></h1>
      <p className="mt-2 text-sm text-muted">Precios por kWp (por tramo), baterías, IVA, pérdidas, degradación, tasa de descuento, O&M, escenarios y régimen de excedentes. Cada guardado crea una versión nueva; los estudios registran la versión usada. Cambia <code>isPlaceholder</code> a <code>false</code> cuando Gerencia valide los valores.</p>
      <JsonEditor initial={editable} action={saveParamsAction} />
    </div>
  );
}
