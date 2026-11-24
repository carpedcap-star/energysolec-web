import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { getStore } from './data/store';

export async function clientMeta() {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown';
  const salt = process.env.IP_HASH_SALT ?? 'energysolec';
  return { ip, ipHash: createHash('sha256').update(salt + ip).digest('hex').slice(0, 32), ua: h.get('user-agent') ?? '' };
}

/** Límite de solicitudes por IP y ruta. */
export async function guard(route: string, max: number, windowSec: number) {
  const { ipHash } = await clientMeta();
  return getStore().rateLimit(`${route}:${ipHash}`, max, windowSec);
}

/** Verificación anti-spam con Cloudflare Turnstile (si está configurado) + honeypot. */
export async function verifyHuman(token: string | undefined, honeypot: string | undefined) {
  if (honeypot) return false;
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret, response: token }),
  }).then((x) => x.json()).catch(() => ({ success: false }));
  return !!r.success;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
