import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../shell';
import { ActivateForm } from '../forms';

export const metadata: Metadata = { title: 'Activa tu cuenta comercial', description: 'Elige la contraseña de tu cuenta comercial.', alternates: { canonical: '/cuenta/activar' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

/** El enlace NO se consume al abrir la página (los filtros de correo visitan enlaces): solo al enviar el formulario. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash = '', type } = await searchParams;
  const recovery = type === 'recovery';
  return (
    <AuthCard title={recovery ? 'Elige una nueva contraseña' : 'Activa tu cuenta'}>
      {token_hash ? (
        <>
          <p className="mt-2 text-sm text-muted">Mínimo 10 caracteres, con letras y al menos un número.</p>
          <ActivateForm token={token_hash} type={recovery ? 'recovery' : 'invite'} />
        </>
      ) : <p role="alert" className="mt-4 text-sm text-red-700">El enlace no es válido. <Link href="/cuenta/recuperar" className="underline">Pide uno nuevo</Link>.</p>}
    </AuthCard>
  );
}
