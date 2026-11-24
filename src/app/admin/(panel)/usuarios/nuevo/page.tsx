import Link from 'next/link';
import type { Metadata } from 'next';
import { requireStaff } from '@/lib/auth';
import { UserForm } from '../user-form';

export const metadata: Metadata = { title: 'Invitar usuario', description: 'Alta de usuario del panel', alternates: { canonical: '/admin/usuarios/nuevo' } };

export default async function Page() {
  await requireStaff('users');
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/usuarios" className="hover:underline">Usuarios</Link> / Invitar</nav>
      <h1 className="text-2xl font-bold">Invitar usuario</h1>
      <p className="mt-1 text-sm text-muted">La persona recibe un enlace para activar su cuenta y elegir su contraseña. Nadie más la conoce.</p>
      <UserForm user={null} self={false} openLeads={0} advisors={[]} />
    </div>
  );
}
