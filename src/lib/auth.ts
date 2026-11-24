import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AppRole, Staff } from './data/types';

/** Matriz de permisos por sección del panel (espejo de la RLS en 0002_rls.sql). */
export const PERMS = {
  dashboard: ['superadmin', 'gerencia', 'marketing', 'ventas', 'ingenieria', 'compras'],
  leads: ['superadmin', 'gerencia', 'ventas', 'marketing', 'ingenieria'],
  leads_edit: ['superadmin', 'gerencia', 'ventas'],
  orders: ['superadmin', 'gerencia', 'ventas', 'compras'],
  verify_payment: ['superadmin', 'gerencia'],
  params: ['superadmin', 'gerencia', 'ingenieria'],
  tariffs: ['superadmin', 'gerencia', 'ingenieria'],
  stats: ['superadmin', 'gerencia'],
  export: ['superadmin', 'gerencia', 'marketing'],
  products: ['superadmin', 'compras'],   // RLS: products, product_prices, media (public-media)
  projects: ['superadmin', 'marketing', 'ingenieria'],   // RLS: projects, project_media, media
  content: ['superadmin', 'marketing'],   // RLS: content_blocks, media
} satisfies Record<string, AppRole[]>;
export type Perm = keyof typeof PERMS;
export const can = (s: Staff | null, p: Perm) => !!s && (PERMS[p] as AppRole[]).includes(s.role);

const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function supabaseAuthClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: (list) => { try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch {} } },
  });
}

// ---- Sesión de desarrollo (solo sin Supabase y fuera de producción) ----
const DEV_COOKIE = 'ese_dev_admin';
const devSig = (v: string) => createHmac('sha256', process.env.APP_SECRET ?? 'dev-only-secret').update(v).digest('base64url');
export const devAuthEnabled = () => !supabaseConfigured() && process.env.NODE_ENV !== 'production' && !!process.env.DEV_ADMIN_PASSWORD;

export async function getStaff(): Promise<Staff | null> {
  if (supabaseConfigured()) {
    const sb = await supabaseAuthClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: p } = await admin.from('profiles').select('id, email, full_name, role, active').eq('id', user.id).maybeSingle();
    return p?.active ? { id: p.id, email: p.email, full_name: p.full_name, role: p.role } : null;
  }
  if (!devAuthEnabled()) return null;
  const c = (await cookies()).get(DEV_COOKIE)?.value;
  if (!c) return null;
  const [payload, sig] = c.split('.');
  const a = Buffer.from(devSig(payload)), b = Buffer.from(sig ?? '');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const role = Buffer.from(payload, 'base64url').toString() as AppRole;
  return { id: `dev-${role}`, email: `${role}@dev.local`, full_name: `Dev (${role})`, role };
}

export async function requireStaff(perm: Perm = 'dashboard'): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect('/admin/login');
  if (!can(s, perm)) redirect('/admin?denied=1');
  return s;
}

export async function signIn(email: string, password: string, devRole: AppRole = 'superadmin'): Promise<string | null> {
  if (supabaseConfigured()) {
    const sb = await supabaseAuthClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return 'Credenciales no válidas';
    if (!(await getStaff())) { await sb.auth.signOut(); return 'Tu usuario no tiene un perfil activo en el panel.'; }
    return null;
  }
  if (!devAuthEnabled()) return 'El panel requiere Supabase configurado.';
  const a = Buffer.from(password), b = Buffer.from(process.env.DEV_ADMIN_PASSWORD!);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'Credenciales no válidas';
  const payload = Buffer.from(devRole).toString('base64url');
  (await cookies()).set(DEV_COOKIE, `${payload}.${devSig(payload)}`, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 60 * 60 * 8 });
  return null;
}

export async function signOut() {
  if (supabaseConfigured()) await (await supabaseAuthClient()).auth.signOut();
  (await cookies()).delete(DEV_COOKIE);
}
