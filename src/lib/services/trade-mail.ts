import 'server-only';
import { headers } from 'next/headers';
import { SITE } from '../site';
import { esc, sendEmail } from './messaging';

/** Enlace de activación o restablecimiento para clientes comerciales (página pública /cuenta/activar). */
export async function tradeAccessUrl(token: string, type: 'invite' | 'recovery') {
  let base = SITE.url;
  if (process.env.NODE_ENV !== 'production') {
    const h = await headers();
    base = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host') ?? 'localhost:3000'}`;
  }
  return `${base}/cuenta/activar?token_hash=${encodeURIComponent(token)}&type=${type}`;
}

export async function sendTradeAccessEmail(to: string, name: string, company: string, link: string, type: 'invite' | 'recovery') {
  const invite = type === 'invite';
  const r = await sendEmail({
    to, template: invite ? 'cuenta_comercial_aprobada' : 'cuenta_comercial_acceso',
    subject: invite ? 'Tu cuenta comercial fue aprobada — Energy Solutions Ecuador' : 'Restablece tu contraseña — Energy Solutions Ecuador',
    html: `<div style="font-family:Arial,sans-serif"><p>Hola ${esc(name)},</p><p>${invite ? `Aprobamos la cuenta comercial de <b>${esc(company)}</b>.` : 'Recibimos una solicitud para restablecer tu contraseña.'} Usa este enlace personal para ${invite ? 'activar tu acceso y elegir' : 'elegir'} tu contraseña:</p><p><a href="${esc(link)}">${invite ? 'Activar mi cuenta' : 'Elegir nueva contraseña'}</a></p><p style="color:#666">El enlace es de un solo uso y vence en 24 horas. Si no esperabas este correo, ignóralo.</p></div>`,
  });
  return r.sent;
}
