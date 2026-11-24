import Link from 'next/link';
import Image from 'next/image';
import { requireStaff, can, type Perm } from '@/lib/auth';
import { getStore } from '@/lib/data/store';
import { logoutAction } from '../actions';
import { roleLabel } from '@/lib/services/users';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false } };
const NAV: [string, string, Perm][] = [
  ['/admin', 'Dashboard', 'dashboard'], ['/admin/leads', 'CRM · Leads', 'leads'], ['/admin/pedidos', 'Pedidos', 'orders'], ['/admin/productos', 'Productos', 'products'], ['/admin/proyectos', 'Proyectos', 'projects'], ['/admin/contenido', 'Contenido del sitio', 'content'], ['/admin/marcas', 'Marcas', 'brands'], ['/admin/servicios', 'Servicios', 'services'], ['/admin/blog', 'Blog', 'blog'], ['/admin/usuarios', 'Usuarios', 'users_read'],
  ['/admin/parametros', 'Parámetros de cálculo', 'params'], ['/admin/tarifas', 'Tarifas eléctricas', 'tariffs'], ['/admin/indicadores', 'Indicadores de inicio', 'stats'],
];
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff();
  const devStore = getStore().kind === 'dev';
  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-brand-dark p-5 text-white lg:min-h-screen lg:border-0">
        <Image src="/brand/logo-dark.png" alt="Energy Solutions" width={150} height={50} className="h-10 w-auto" />
        <nav className="mt-8 flex gap-1 overflow-x-auto lg:flex-col">
          {NAV.filter(([, , p]) => can(staff, p)).map(([h, l]) => <Link key={h} href={h} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-white/75 hover:bg-white/10 hover:text-white">{l}</Link>)}
        </nav>
        {/* Visible también en móvil: cada persona entra con su cuenta y debe poder cerrar sesión. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60 lg:mt-8 lg:block lg:text-white/50">
          <p className="font-medium text-white/80 lg:font-normal lg:text-inherit">{staff.full_name}</p>
          <p className="uppercase tracking-wider">{roleLabel(staff.role)}</p>
          <form action={logoutAction} className="ml-auto lg:ml-0"><button className="underline underline-offset-2 hover:text-white lg:mt-3">Cerrar sesión</button></form>
        </div>
      </aside>
      <div className="min-w-0 p-5 lg:p-10">
        {devStore && <p className="mb-6 rounded-xl border-l-4 border-brand bg-amber-50 px-4 py-2 text-sm text-amber-950">Modo desarrollo: datos en archivo local, sin Supabase.</p>}
        {children}
      </div>
    </div>
  );
}
