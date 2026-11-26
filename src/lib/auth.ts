import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword } from './passwords';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AppRole, Staff } from './data/types';
import { devUserAuth } from './data/store';
import { passwordProblem } from './services/users';

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
  brands: ['superadmin', 'marketing', 'compras'],   // RLS: brands, brand_assets
  brand_docs: ['superadmin', 'gerencia', 'marketing', 'compras'],   // RLS: lectura del bucket private-docs (0004)
  services: ['superadmin', 'marketing'],   // RLS: services
  blog: ['superadmin', 'marketing'],   // RLS: blog_posts, media
  users_read: ['superadmin', 'gerencia'],   // RLS: profiles self_read
  users: ['superadmin'],   // RLS: profiles admin_write
  identity: ['superadmin', 'marketing'],   // RLS: site_settings
  settings: ['superadmin', 'marketing'],   // RLS: site_settings (contact, notifications, integrations_public)
  bills: ['superadmin', 'gerencia', 'ingenieria', 'ventas'],
  trade: ['superadmin', 'gerencia', 'ventas'],   // RLS: trade_accounts (0002)
  trade_approve: ['superadmin', 'gerencia'],
  messages: ['superadmin', 'gerencia'],   // RLS: outbound_messages (0002), cron_runs (0007)
  assign_leads: ['superadmin', 'gerencia'],   // la base lo impone con el disparador guard_trade_account (0006)   // RLS: bill_uploads y lectura del bucket bills (0002)
} satisfies Record<string, AppRole[]>;
export type Perm = keyof typeof PERMS;
export const can = (s: Staff | null, p: Perm) => !!s && (PERMS[p] as AppRole[]).includes(s.role);

export const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function supabaseAuthClient() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: (list) => { try { list.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch {} } },
  });
}

// ---- Sesión de desarrollo (solo sin Supabase y fuera de producción) ----
const DEV_COOKIE = 'ese_dev_admin';
export const devSig = (v: string) => createHmac('sha256', process.env.APP_SECRET ?? 'dev-only-secret').update(v).digest('base64url');
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
  const decoded = Buffer.from(payload, 'base64url').toString();
  // Usuario creado en el panel: se relee en cada petición, así desactivarlo o cambiar su rol rige de inmediato.
  if (decoded.startsWith('u:')) {
    const u = await devUserAuth.findById(decoded.slice(2));
    return u && u.active && u.password_hash ? { id: u.id, email: u.email, full_name: u.full_name, role: u.role } : null;
  }
  const role = decoded as AppRole;
  if (!DEV_ROLES.includes(role)) return null;
  return { id: `dev-${role}`, email: `${role}@dev.local`, full_name: `Dev (${role})`, role };
}
const DEV_ROLES: AppRole[] = ['superadmin', 'gerencia', 'marketing', 'ventas', 'ingenieria', 'compras'];
async function setDevSession(payloadText: string) {
  const payload = Buffer.from(payloadText).toString('base64url');
  (await cookies()).set(DEV_COOKIE, `${payload}.${devSig(payload)}`, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 60 * 60 * 8 });
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
  if (email.trim()) {
    // Usuario creado en el panel (correo y contraseña propios).
    const u = await devUserAuth.findByEmail(email);
    if (!u?.password_hash || !(await verifyPassword(password, u.password_hash))) return 'Credenciales no válidas';
    if (!u.active) return 'Tu usuario no tiene un perfil activo en el panel.';
    await setDevSession(`u:${u.id}`);
    return null;
  }
  const a = Buffer.from(password), b = Buffer.from(process.env.DEV_ADMIN_PASSWORD!);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'Credenciales no válidas';
  if (!DEV_ROLES.includes(devRole)) return 'Rol no válido';
  await setDevSession(devRole);
  return null;
}

const LINK_EXPIRED = 'El enlace expiró o ya se usó. Pide uno nuevo a un administrador.';
/**
 * Activa la cuenta o restablece la contraseña con el enlace enviado por correo.
 * La contraseña se valida ANTES de consumir el token (un solo uso), para no gastarlo con un error.
 */
export async function activateAccount(token: string, type: 'invite' | 'recovery', password: string): Promise<string | null> {
  const problem = passwordProblem(password);
  if (problem) return problem;
  if (!token || token.length > 512) return LINK_EXPIRED;
  if (supabaseConfigured()) {
    const sb = await supabaseAuthClient();
    const { data, error } = await sb.auth.verifyOtp({ token_hash: token, type });
    if (error || !data.user) return LINK_EXPIRED;
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: p } = await admin.from('profiles').select('active').eq('id', data.user.id).maybeSingle();
    if (!p?.active) { await sb.auth.signOut(); return 'Tu usuario no tiene un perfil activo en el panel.'; }
    const up = await sb.auth.updateUser({ password });
    if (up.error) return `No se pudo guardar la contraseña: ${up.error.message}`;
    return null;
  }
  if (!devAuthEnabled()) return 'El panel requiere Supabase configurado.';
  const u = await devUserAuth.consumeToken(token);
  if (!u) return LINK_EXPIRED;
  if (!u.active) return 'Tu usuario no tiene un perfil activo en el panel.';
  await devUserAuth.setPasswordHash(u.id, await hashPassword(password));
  await setDevSession(`u:${u.id}`);
  return null;
}

export async function signOut() {
  if (supabaseConfigured()) await (await supabaseAuthClient()).auth.signOut();
  (await cookies()).delete(DEV_COOKIE);
}
