import { BrandLogo } from '@/components/brand-logo';
import { getIdentity } from '@/lib/identity';
import { LoginForm } from './form';
import { devAuthEnabled } from '@/lib/auth';
export const metadata = { title: 'Ingreso al panel', robots: { index: false } };
export const dynamic = 'force-dynamic';
export default async function Page() {
  return (
    <div className="grid min-h-screen place-items-center bg-brand-dark p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8">
        <BrandLogo src={(await getIdentity()).urls.logo} width={170} height={56} className="h-12 w-auto" />
        <h1 className="mt-6 text-xl font-bold">Panel administrativo</h1>
        <LoginForm dev={devAuthEnabled()} />
      </div>
    </div>
  );
}
