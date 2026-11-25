import { BrandLogo } from '@/components/brand-logo';
import { getIdentity } from '@/lib/identity';
import type { Metadata } from 'next';
import { ActivateForm } from './form';

export const metadata: Metadata = { title: 'Activa tu cuenta', description: 'Elige tu contraseña del panel', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** El token NO se consume al abrir la página (los filtros de correo visitan enlaces): solo al enviar el formulario. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash = '', type } = await searchParams;
  const recovery = type === 'recovery';
  return (
    <div className="grid min-h-screen place-items-center bg-brand-dark p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8">
        <BrandLogo src={(await getIdentity()).urls.logo} width={170} height={56} className="h-12 w-auto" />
        <h1 className="mt-6 text-xl font-bold">{recovery ? 'Elige una nueva contraseña' : 'Activa tu cuenta'}</h1>
        {token_hash ? (
          <>
            <p className="mt-2 text-sm text-muted">Mínimo 10 caracteres, con letras y al menos un número.</p>
            <ActivateForm token={token_hash} type={recovery ? 'recovery' : 'invite'} />
          </>
        ) : <p role="alert" className="mt-4 text-sm text-red-700">El enlace no es válido. Pide uno nuevo a un administrador.</p>}
      </div>
    </div>
  );
}
