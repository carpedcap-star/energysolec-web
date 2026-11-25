import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { getIdentity } from '@/lib/identity';
import { IdentityForm } from './identity-form';

export const metadata: Metadata = { title: 'Identidad gráfica', description: 'Colores y logos del sitio', alternates: { canonical: '/admin/identidad' } };

export default async function Page({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  await requireStaff('identity');
  const id = await getIdentity();
  const saved = (await searchParams).guardado === '1';
  const logo = (k: 'logo' | 'logoDark' | 'favicon') => ({ id: id[k], url: id.urls[k], custom: id.custom[k] });
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Identidad gráfica</h1>
      <p className="mt-1 text-sm text-muted">Colores y logos del sitio y del panel. Los cambios se aplican a todas las páginas al guardar.</p>
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Identidad guardada y aplicada al sitio.</p>}
      <IdentityForm key={JSON.stringify(id)} colors={id.colors} logos={{ logo: logo('logo'), logoDark: logo('logoDark'), favicon: logo('favicon') }} />
    </div>
  );
}
