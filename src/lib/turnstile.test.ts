import { describe, expect, it, vi } from 'vitest';
import { SITEVERIFY_URL, TURNSTILE_ACTIONS, turnstileStatus, verifyTurnstile } from './turnstile';

const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const base = { secret: 's3cr3t', token: 'tok', action: TURNSTILE_ACTIONS.lead } as const;

describe('turnstileStatus', () => {
  it('solo está activo con las dos claves', () => {
    expect(turnstileStatus({})).toBe('inactivo');
    expect(turnstileStatus({ TURNSTILE_SECRET_KEY: 'x' })).toBe('incompleto');
    expect(turnstileStatus({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'x' })).toBe('incompleto');
    expect(turnstileStatus({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: ' ', TURNSTILE_SECRET_KEY: 'x' })).toBe('incompleto');
    expect(turnstileStatus({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'x', TURNSTILE_SECRET_KEY: 'y' })).toBe('activo');
  });
  it('las acciones cumplen el formato de Cloudflare y son únicas', () => {
    const v = Object.values(TURNSTILE_ACTIONS);
    for (const a of v) expect(a).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(new Set(v).size).toBe(v.length);
  });
});

describe('verifyTurnstile', () => {
  it('envía secreto, token, IP y clave de idempotencia a siteverify', async () => {
    const f = reply({ success: true, action: 'lead' });
    expect(await verifyTurnstile({ ...base, ip: '203.0.113.9', idempotencyKey: 'k1', fetchImpl: f })).toEqual({ ok: true });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({ secret: 's3cr3t', response: 'tok', remoteip: '203.0.113.9', idempotency_key: 'k1' });
  });
  it('no envía una IP desconocida', async () => {
    const f = reply({ success: true });
    await verifyTurnstile({ ...base, ip: 'unknown', fetchImpl: f });
    expect(new URLSearchParams(String((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).has('remoteip')).toBe(false);
  });
  it('rechaza sin token o con un token desmesurado, sin llamar a Cloudflare', async () => {
    const f = reply({ success: true });
    expect((await verifyTurnstile({ ...base, token: undefined, fetchImpl: f })).ok).toBe(false);
    expect((await verifyTurnstile({ ...base, token: '   ', fetchImpl: f })).ok).toBe(false);
    expect((await verifyTurnstile({ ...base, token: 'x'.repeat(2049), fetchImpl: f })).ok).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it('rechaza lo que Cloudflare rechaza, con sus códigos', async () => {
    expect(await verifyTurnstile({ ...base, fetchImpl: reply({ success: false, 'error-codes': ['timeout-or-duplicate'] }) }))
      .toEqual({ ok: false, reason: 'rechazado: timeout-or-duplicate' });
    expect((await verifyTurnstile({ ...base, fetchImpl: reply({ success: 'true' }) })).ok).toBe(false);
  });
  it('rechaza un token emitido para otro formulario', async () => {
    expect((await verifyTurnstile({ ...base, fetchImpl: reply({ success: true, action: 'pedido' }) })).ok).toBe(false);
    expect((await verifyTurnstile({ ...base, fetchImpl: reply({ success: true, action: '' }) })).ok).toBe(true); // claves de prueba
  });
  it('falla cerrado si Cloudflare no responde o responde mal', async () => {
    expect((await verifyTurnstile({ ...base, fetchImpl: reply({}, 500) })).ok).toBe(false);
    expect((await verifyTurnstile({ ...base, fetchImpl: vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch })).ok).toBe(false);
    expect((await verifyTurnstile({ ...base, fetchImpl: vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch })).ok).toBe(false);
    const hang = vi.fn((_u: unknown, init: RequestInit) => new Promise<Response>((_, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as unknown as typeof fetch;
    expect(await verifyTurnstile({ ...base, fetchImpl: hang, timeoutMs: 20 })).toEqual({ ok: false, reason: 'siteverify sin respuesta: TimeoutError' });
  });
});
