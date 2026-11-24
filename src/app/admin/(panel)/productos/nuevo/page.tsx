import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { ProductForm } from '../product-form';

export const metadata: Metadata = { title: 'Nuevo producto', description: 'Alta de producto en el catálogo', alternates: { canonical: '/admin/productos/nuevo' } };

export default async function Page() {
  await requireStaff('products');
  const brands = await getStore().listBrands({ includeUnpublished: true });
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/productos" className="hover:underline">Productos</Link> / Nuevo</nav>
      <h1 className="text-2xl font-bold">Nuevo producto</h1>
      <ProductForm product={null} brands={brands.map((b) => ({ id: b.id, name: b.name }))} />
    </div>
  );
}
