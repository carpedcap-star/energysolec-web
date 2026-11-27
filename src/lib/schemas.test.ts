import { describe, expect, it } from 'vitest';
import { UnlockBody } from './schemas';

const body = (o: Record<string, unknown> = {}) => ({ code: 'ESE-2026-000002', name: 'Cliente Prueba', email: 'a@example.com', phone: '', company: '', acceptPrivacy: true, acceptMarketing: false, website: '', ...o });
describe('desbloqueo del estudio', () => {
  it('acepta la marca de tiempo numérica que el navegador guarda con las UTM', () => {
    const r = UnlockBody.safeParse(body({ utm: { utm_source: 'facebook', landing: '/calculadora', _at: 1764200000000, raro: { x: 1 } } }));
    expect(r.success && r.data.utm).toEqual({ utm_source: 'facebook', landing: '/calculadora', _at: '1764200000000' });
    expect(UnlockBody.safeParse(body({ utm: undefined })).success).toBe(true);
  });
  it('WhatsApp vacío, nacional o internacional y consentimiento comercial opcional', () => {
    for (const phone of ['', '0991234567', '099 123 4567', '+593 99 123 4567', '+593991234567'])
      for (const acceptMarketing of [true, false]) expect(UnlockBody.safeParse(body({ phone, acceptMarketing })).success).toBe(true);
    expect(UnlockBody.safeParse(body({ phone: 'abc' })).success).toBe(false);
    expect(UnlockBody.safeParse(body({ acceptPrivacy: false })).success).toBe(false);
  });
});
