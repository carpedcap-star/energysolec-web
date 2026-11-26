import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { getStore } from './data/store';
import { turnstileStatus, verifyTurnstile, type TurnstileAction } from './turnstile';

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

/**
 * Anti-spam: campo trampa y, si Turnstile está configurado (las dos claves), token válido para la acción del
 * formulario. Ver src/lib/turnstile.ts.
 */
export async function verifyHuman(token: string | undefined, honeypot: string | undefined, action: TurnstileAction) {
  if (honeypot) return false;
  if (turnstileStatus() !== 'activo') return true;
  const { ip } = await clientMeta();
  const check = await verifyTurnstile({ secret: process.env.TURNSTILE_SECRET_KEY!.trim(), token, action, ip, idempotencyKey: randomUUID() });
  if (!check.ok) console.warn(`[turnstile] ${action}: ${check.reason}`);
  return check.ok;
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
