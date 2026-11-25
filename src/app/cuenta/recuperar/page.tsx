import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '../shell';
import { RecoverForm } from '../forms';

export const metadata: Metadata = { title: 'Recupera tu acceso · Cuenta comercial', description: 'Recibe un enlace para elegir una nueva contraseña.', alternates: { canonical: '/cuenta/recuperar' }, robots: { index: false } };

export default function Page() {
  return (
    <AuthCard title="Recupera tu acceso">
      <p className="mt-2 text-sm text-muted">Te enviaremos un enlace de un solo uso para elegir una nueva contraseña. También sirve si nunca activaste tu cuenta.</p>
      <RecoverForm />
      <p className="mt-6 text-center text-sm"><Link href="/cuenta/ingresar" className="text-muted underline">Volver a ingresar</Link></p>
    </AuthCard>
  );
}
