import 'server-only';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { devAuthEnabled, devSig, supabaseAuthClient, supabaseConfigured } from './auth';
import { devTradeAuth, getStore } from './data/store';
import type { TradeAccount } from './data/types';
import { hashPassword, verifyPassword } from './passwords';
import { passwordProblem } from './services/users';

/**
 * Sesión de clientes comerciales (instaladores y distribuidores). Separada del panel: un usuario del panel no puede
 * tener cuenta comercial (lo impone la base, 0006) y una cuenta comercial no tiene perfil del panel.
 * La cuenta se relee en cada petición: suspenderla corta el acceso a los precios al instante.
 */
const DEV_COOKIE = 'ese_dev_trade';
const NOT_ACTIVE = 'Tu cuenta comercial no está activa. Escríbenos si crees que es un error.';
const BAD = 'Correo o contraseña incorrectos.';
const LINK_EXPIRED = 'El enlace expiró o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?».';

export async function getTradeAccount(): Promise<TradeAccount | null> {
  if (supabaseConfigured()) {
    const sb = await supabaseAuthClient();
    const { data: { user } } = await sb.auth.getUser();
    return user ? getStore().getApprovedTradeAccountForUser(user.id) : null;
  }
  if (!devAuthEnabled()) return null;
  const c = (await cookies()).get(DEV_COOKIE)?.value;
  if (!c) return null;
  const [payload, sig] = c.split('.');
  const a = Buffer.from(devSig(payload)), b = Buffer.from(sig ?? '');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const id = Buffer.from(payload, 'base64url').toString();
  const t = await devTradeAuth.findById(id);
  return t?.status === 'aprobada' && t.password_hash ? getStore().getTradeAccount(t.id) : null;
}

async function setDevSession(id: string) {
  const payload = Buffer.from(id).toString('base64url');
  (await cookies()).set(DEV_COOKIE, `${payload}.${devSig(payload)}`, { httpOnly: true, sameSite: 'lax', secure: false, path: '/', maxAge: 60 * 60 * 12 });
}

export async function tradeSignIn(email: string, password: string): Promise<string | null> {
  if (!email.trim() || !password) return BAD;
  if (supabaseConfigured()) {
    const sb = await supabaseAuthClient();
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.user) return BAD;
    if (!(await getStore().getApprovedTradeAccountForUser(data.user.id))) { await sb.auth.signOut(); return NOT_ACTIVE; }
    return null;
  }
  if (!devAuthEnabled()) return 'El acceso de clientes requiere Supabase configurado.';
  const t = await devTradeAuth.findByEmail(email);
  if (!t?.password_hash || !(await verifyPassword(password, t.password_hash))) return BAD;
  if (t.status !== 'aprobada') return NOT_ACTIVE;
  await setDevSession(t.id);
  return null;
}

/** Activa la cuenta o restablece la contraseña. La contraseña se valida ANTES de consumir el enlace (un solo uso). */
export async function tradeActivate(token: string, type: 'invite' | 'recovery', password: string, email?: string): Promise<string | null> {
  const problem = passwordProblem(password, email);
  if (problem) return problem;
  if (!token || token.length > 512) return LINK_EXPIRED;
  if (supabaseConfigured()) {
    const sb = await supabaseAuthClient();
    const { data, error } = await sb.auth.verifyOtp({ token_hash: token, type });
    if (error || !data.user) return LINK_EXPIRED;
    if (!(await getStore().getApprovedTradeAccountForUser(data.user.id))) { await sb.auth.signOut(); return NOT_ACTIVE; }
    const up = await sb.auth.updateUser({ password });
    return up.error ? `No se pudo guardar la contraseña: ${up.error.message}` : null;
  }
  if (!devAuthEnabled()) return 'El acceso de clientes requiere Supabase configurado.';
  const t = await devTradeAuth.consumeToken(token);
  if (!t) return LINK_EXPIRED;
  if (t.status !== 'aprobada') return NOT_ACTIVE;
  await devTradeAuth.setPasswordHash(t.id, await hashPassword(password));
  await setDevSession(t.id);
  return null;
}

export async function tradeSignOut() {
  if (supabaseConfigured()) await (await supabaseAuthClient()).auth.signOut();
  (await cookies()).delete(DEV_COOKIE);
}
