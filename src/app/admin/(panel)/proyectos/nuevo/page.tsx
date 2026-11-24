import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { ProjectForm } from '../project-form';

export const metadata: Metadata = { title: 'Nuevo proyecto', description: 'Alta de proyecto en el portafolio', alternates: { canonical: '/admin/proyectos/nuevo' } };

export default async function Page() {
  await requireStaff('projects');
  return (
    <div className="max-w-4xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/proyectos" className="hover:underline">Proyectos</Link> / Nuevo</nav>
      <h1 className="text-2xl font-bold">Nuevo proyecto</h1>
      <ProjectForm project={null} />
    </div>
  );
}
