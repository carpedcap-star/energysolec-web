import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { PostForm } from '../post-form';

export const metadata: Metadata = { title: 'Nuevo artículo', description: 'Alta de artículo del blog', alternates: { canonical: '/admin/blog/nuevo' } };

export default async function Page() {
  await requireStaff('blog');
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/blog" className="hover:underline">Blog</Link> / Nuevo</nav>
      <h1 className="text-2xl font-bold">Nuevo artículo</h1>
      <PostForm post={null} />
    </div>
  );
}
