'use server';
import { redirect } from 'next/navigation';
import { getStore } from '@/lib/data/store';
import { guard } from '@/lib/request';
import { tradeActivate, tradeSignIn, tradeSignOut } from '@/lib/trade-auth';
import { sendTradeAccessEmail, tradeAccessUrl } from '@/lib/services/trade-mail';

/** Solo rutas internas: evita redirecciones abiertas con ?next=. */
const safeNext = (v: FormDataEntryValue | null) => { const s = typeof v === 'string' ? v : ''; return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/cuenta'; };

export async function tradeLoginAction(_: unknown, fd: FormData): Promise<{ error?: string; email?: string }> {
  const email = String(fd.get('email') ?? '');
  if (!(await guard('trade_login', 10, 900))) return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.', email };
  const err = await tradeSignIn(email, String(fd.get('password') ?? ''));
  if (err) return { error: err, email };
  redirect(safeNext(fd.get('next')));
}

export async function tradeActivateAction(_: unknown, fd: FormData): Promise<{ error?: string }> {
  if (!(await guard('trade_activate', 10, 900))) return { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' };
  const password = String(fd.get('password') ?? ''), confirm = String(fd.get('confirm') ?? '');
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' };
  const err = await tradeActivate(String(fd.get('token_hash') ?? ''), fd.get('type') === 'recovery' ? 'recovery' : 'invite', password);
  if (err) return { error: err };
  redirect('/cuenta?activada=1');
}

/** Siempre responde lo mismo: no revela si el correo tiene cuenta. */
export async function tradeRecoverAction(_: unknown, fd: FormData): Promise<{ done?: boolean; error?: string }> {
  if (!(await guard('trade_recover', 5, 3600))) return { error: 'Demasiadas solicitudes. Inténtalo más tarde.' };
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Ingresa un correo válido.' };
  const store = getStore();
  const t = (await store.listTradeAccounts()).find((x) => x.email === email && x.status === 'aprobada');
  if (t) {
    try {
      const tok = await store.createTradeAccessToken(t.id);
      const link = await tradeAccessUrl(tok.token_hash, t.activated ? 'recovery' : tok.type);
      const sent = await sendTradeAccessEmail(t.email, t.contact_name, t.company, link, t.activated ? 'recovery' : 'invite');
      // Sin proveedor de correo (desarrollo) el enlace solo queda en el registro del servidor, nunca en la respuesta.
      if (!sent && process.env.NODE_ENV !== 'production') console.info('[cuenta] enlace de acceso (sin proveedor de correo):', link);
    } catch (e) { console.error('[cuenta] no se pudo generar el enlace', e); }
  }
  return { done: true };
}

export async function tradeLogoutAction() {
  await tradeSignOut();
  redirect('/cuenta/ingresar?salida=1');
}
