import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { TariffForm } from '../tariff-form';

export const metadata: Metadata = { title: 'Nueva tarifa', description: 'Alta de tarifa eléctrica', alternates: { canonical: '/admin/tarifas/nueva' } };

export default async function Page() {
  await requireStaff('tariffs');
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/tarifas" className="hover:underline">Tarifas eléctricas</Link> / Nueva</nav>
      <h1 className="text-2xl font-bold">Nueva tarifa</h1>
      <TariffForm tariff={null} />
    </div>
  );
}
