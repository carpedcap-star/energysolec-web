import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { requireStaff } from '@/lib/auth';
import { AccessLink, UserForm } from '../user-form';

export const metadata: Metadata = { title: 'Editar usuario', description: 'Edición de usuario del panel', robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  const staff = await requireStaff('users');
  const { id } = await params;
  const store = getStore();
  const [users, open] = await Promise.all([store.listUsers(), store.openLeadsByAdvisor()]);
  const u = users.find((x) => x.id === id);
  if (!u) notFound();
  const saved = (await searchParams).guardado === '1';
  return (
    <div className="max-w-3xl">
      <nav className="mb-2 text-sm text-muted"><Link href="/admin/usuarios" className="hover:underline">Usuarios</Link> / {u.full_name}</nav>
      <h1 className="text-2xl font-bold">{u.full_name}</h1>
      <p className="mt-1 text-sm text-muted">{u.email} · {!u.active ? 'Desactivado' : u.activated ? 'Activo' : 'Pendiente de activar'}</p>
      {saved && <p role="status" className="mt-4 rounded-xl bg-green-50 px-4 py-2 text-sm text-green-800">Cambios guardados.</p>}
      <UserForm key={JSON.stringify(u)} user={u} self={u.id === staff.id} openLeads={open[u.id] ?? 0}
        advisors={users.filter((x) => x.active && x.is_advisor).map((x) => ({ id: x.id, full_name: x.full_name }))} />
      {u.active && <AccessLink id={u.id} activated={u.activated} />}
    </div>
  );
}
