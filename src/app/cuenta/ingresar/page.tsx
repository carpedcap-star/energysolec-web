import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTradeAccount } from '@/lib/trade-auth';
import { AuthCard } from '../shell';
import { LoginForm } from '../forms';

export const metadata: Metadata = { title: 'Ingresar · Cuenta comercial', description: 'Acceso para instaladores y distribuidores autorizados.', alternates: { canonical: '/cuenta/ingresar' }, robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; salida?: string }> }) {
  const q = await searchParams;
  const next = q.next?.startsWith('/') && !q.next.startsWith('//') ? q.next : '/cuenta';
  if (await getTradeAccount()) redirect(next);
  return (
    <AuthCard title="Ingresa a tu cuenta">
      <p className="mt-2 text-sm text-muted">Para instaladores y distribuidores con cuenta aprobada.</p>
      {q.salida && <p className="mt-4 rounded-xl bg-surface p-3 text-sm" role="status">Cerraste sesión.</p>}
      <LoginForm next={next} />
      <p className="mt-6 border-t border-line pt-4 text-center text-sm text-muted">¿Aún no tienes cuenta? <Link href="/profesionales" className="font-semibold text-ink underline">Solicítala aquí</Link></p>
    </AuthCard>
  );
}
