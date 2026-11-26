/**
 * Cloudflare Turnstile: verificación del token en el servidor (lógica pura, probada en turnstile.test.ts).
 *
 * Se activa solo con LAS DOS claves: NEXT_PUBLIC_TURNSTILE_SITE_KEY (pública, la usa el widget) y
 * TURNSTILE_SECRET_KEY (secreta, solo servidor). Con una sola, el widget no podría generar tokens o el servidor no
 * podría validarlos y se rechazarían todos los formularios, así que se trata como «sin configurar» (el panel lo
 * marca como incompleto) y siguen valiendo el campo trampa y los límites por IP.
 */

/** Acción de cada formulario: el token emitido para uno no sirve en otro. Máx. 32 caracteres [A-Za-z0-9_-]. */
export const TURNSTILE_ACTIONS = {
  lead: 'lead',
  order: 'pedido',
  bill: 'planilla',
  study: 'estudio',
  trade: 'cuenta_comercial',
  industrial: 'industrial',
  industrialDoc: 'industrial_documento',
} as const;
export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileStatus = 'activo' | 'incompleto' | 'inactivo';
export function turnstileStatus(env: Record<string, string | undefined> = process.env): TurnstileStatus {
  const site = !!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim(), secret = !!env.TURNSTILE_SECRET_KEY?.trim();
  return site && secret ? 'activo' : site || secret ? 'incompleto' : 'inactivo';
}

export type TurnstileCheck = { ok: true } | { ok: false; reason: string };

/**
 * Valida un token con siteverify. Falla cerrado: sin respuesta de Cloudflare (8 s), respuesta inválida o acción
 * distinta, el envío se rechaza.
 */
export async function verifyTurnstile(o: {
  secret: string; token: string | undefined; action: TurnstileAction; ip?: string;
  fetchImpl?: typeof fetch; timeoutMs?: number; idempotencyKey?: string;
}): Promise<TurnstileCheck> {
  const token = o.token?.trim();
  if (!token) return { ok: false, reason: 'sin token' };
  if (token.length > 2048) return { ok: false, reason: 'token demasiado largo' };
  const body = new URLSearchParams({ secret: o.secret, response: token });
  if (o.ip && o.ip !== 'unknown') body.set('remoteip', o.ip);
  if (o.idempotencyKey) body.set('idempotency_key', o.idempotencyKey);
  let r: { success?: unknown; action?: unknown; 'error-codes'?: unknown };
  try {
    const res = await (o.fetchImpl ?? fetch)(SITEVERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(o.timeoutMs ?? 8000) });
    if (!res.ok) return { ok: false, reason: `siteverify HTTP ${res.status}` };
    r = await res.json();
  } catch (e) {
    return { ok: false, reason: `siteverify sin respuesta: ${(e as Error).name}` };
  }
  if (r?.success !== true) {
    const codes = Array.isArray(r?.['error-codes']) ? (r['error-codes'] as unknown[]).join(',') : '';
    return { ok: false, reason: `rechazado${codes ? `: ${codes}` : ''}` };
  }
  // Las claves de prueba de Cloudflare no devuelven acción; las reales sí, y debe ser la del formulario.
  if (typeof r.action === 'string' && r.action !== '' && r.action !== o.action) return { ok: false, reason: `acción ${r.action} ≠ ${o.action}` };
  return { ok: true };
}
