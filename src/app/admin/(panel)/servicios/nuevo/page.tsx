import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { ServiceForm } from '../service-form';

export const metadata: Metadata = { title: 'Nuevo servicio', description: 'Alta de servicio', alternates: { canonical: '/admin/servicios/nuevo' } };

export default async function Page() {
  await requireStaff('services');
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/servicios" className="hover:underline">Servicios</Link> / Nuevo</nav>
      <h1 className="text-2xl font-bold">Nuevo servicio</h1>
      <ServiceForm service={null} />
    </div>
  );
}
