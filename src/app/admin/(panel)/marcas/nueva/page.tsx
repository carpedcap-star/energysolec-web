import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { BrandForm } from '../brand-form';

export const metadata: Metadata = { title: 'Nueva marca', description: 'Alta de marca', alternates: { canonical: '/admin/marcas/nueva' } };

export default async function Page() {
  await requireStaff('brands');
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/marcas" className="hover:underline">Marcas</Link> / Nueva</nav>
      <h1 className="text-2xl font-bold">Nueva marca</h1>
      <BrandForm brand={null} />
    </div>
  );
}
