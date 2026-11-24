import Link from 'next/link';
import type { Metadata } from 'next';
import { getStore } from '@/lib/data/store';
import { can, PERMS, requireStaff } from '@/lib/auth';
import { PERM_LABELS, ROLES, roleLabel } from '@/lib/services/users';

export const metadata: Metadata = { title: 'Usuarios', description: 'Usuarios del panel y matriz de roles', alternates: { canonical: '/admin/usuarios' } };

export default async function Page() {
  const staff = await requireStaff('users_read');
  const manage = can(staff, 'users');
  const store = getStore();
  const [users, open] = await Promise.all([store.listUsers(), store.openLeadsByAdvisor()]);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usuarios</h1>
          <p className="mt-1 text-sm text-muted">Personas con acceso al panel. Cada una entra con su correo y su propia contraseña.</p>
        </div>
        {manage && <Link href="/admin/usuarios/nuevo" className="btn-dark">Invitar usuario</Link>}
      </div>
      <div className="card relative mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Usuarios del panel</caption>
          <thead className="bg-surface text-left text-xs uppercase tracking-wider text-muted">
            <tr>{['Usuario', 'Rol', 'Asesor comercial', 'Leads abiertos', 'Estado'].map((h) => <th key={h} scope="col" className="px-4 py-3">{h}</th>)}</tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const st = !u.active ? ['Desactivado', 'bg-surface text-muted'] : u.activated ? ['Activo', 'bg-green-100 text-green-900'] : ['Pendiente de activar', 'bg-amber-100 text-amber-900'];
              return (
                <tr key={u.id} className={`border-t border-line align-top ${u.active ? '' : 'text-muted'}`}>
                  <td className="px-4 py-3">
                    {manage ? <Link href={`/admin/usuarios/${u.id}`} className="font-medium hover:underline">{u.full_name}</Link> : <span className="font-medium">{u.full_name}</span>}
                    {u.id === staff.id && <span className="ml-2 text-xs text-muted">(tú)</span>}
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">{roleLabel(u.role)}</td>
                  <td className="px-4 py-3">{u.is_advisor ? 'Sí' : 'No'}</td>
                  <td className="px-4 py-3 tabular-nums">{open[u.id] ?? 0}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${st[1]}`}>{st[0]}</span></td>
                </tr>
              );
            })}
            {!users.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">Aún no hay usuarios. {manage ? 'Invita al equipo.' : ''}</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Qué puede hacer cada rol</h2>
        <p className="mt-1 text-sm text-muted">Los roles son fijos: la base de datos aplica los mismos permisos (RLS), así que no se editan desde el panel.</p>
        <div className="card relative mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Permisos por rol</caption>
            <thead className="bg-surface text-xs uppercase tracking-wider text-muted">
              <tr><th scope="col" className="px-4 py-3 text-left">Sección</th>{ROLES.map((r) => <th key={r.id} scope="col" className="px-2 py-3 text-center">{r.label}</th>)}</tr>
            </thead>
            <tbody>
              {Object.entries(PERMS).map(([perm, roles]) => (
                <tr key={perm} className="border-t border-line">
                  <th scope="row" className="px-4 py-2 text-left font-normal">{PERM_LABELS[perm] ?? perm}</th>
                  {ROLES.map((r) => {
                    const ok = (roles as readonly string[]).includes(r.id);
                    return <td key={r.id} className="px-2 py-2 text-center">{ok ? <span className="text-green-700" aria-label="Sí">✓</span> : <span className="text-line" aria-label="No">—</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2">{ROLES.map((r) => <li key={r.id}><b className="text-ink">{r.label}:</b> {r.description}</li>)}</ul>
      </section>
    </div>
  );
}
