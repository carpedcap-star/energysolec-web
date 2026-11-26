import { db, expect, expectNoOverflow, isMobile, staffLogin, tag, test } from './helpers';

const LEAD_WITH_BILL = () => db().leads[0].id as string;
const BILL = '11111111-1111-4111-8111-111111111111';

test.describe('planillas eléctricas (sin clave de IA)', () => {
  test('sin ANTHROPIC_API_KEY la opción no aparece y la API responde 503', async ({ page, request }) => {
    await page.goto('/calculadora');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('¿Qué dato tienes?')).toBeVisible();
    await expect(page.getByText('¿Tienes tu planilla eléctrica a mano?')).toHaveCount(0);
    const r = await request.post('/api/bill', { multipart: { consent: 'on', file: { name: 'p.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') } } });
    expect(r.status()).toBe(503);
  });

  test('una carga confirmada se vincula al estudio y al lead una sola vez', async ({ page, request }, info) => {
    test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');
    // En un reintento, la carga del primer intento ya quedó vinculada: se usa su gemela sembrada.
    const billUploadId = info.retry ? '22222222-2222-4222-8222-222222222223' : '22222222-2222-4222-8222-222222222222';
    const study = (o = {}) => ({ mode: 'rapida', segment: 'residencial', objective: 'reducir_factura', province: 'Pichincha', monthlyKwh: 320, monthlyBillUsd: 31.4, billUploadId, ...o });
    const s1 = await request.post('/api/study', { data: study() });
    expect(s1.ok()).toBe(true);
    const { code } = await s1.json();
    const email = `planilla-${tag(info)}-${info.retry}@example.com`;
    expect((await request.post('/api/study/unlock', { data: { code, name: 'Cliente Planilla', email, acceptPrivacy: true, acceptMarketing: false, website: '' } })).ok()).toBe(true);
    expect((await request.post('/api/study', { data: study({ monthlyKwh: 999 }) })).ok()).toBe(true);
    expect((await request.post('/api/study', { data: study({ billUploadId: '../../etc/passwd' }) })).ok()).toBe(true);

    await staffLogin(page, 'superadmin');
    await page.goto(`/admin/leads/${db().leads.find((l: { email: string }) => l.email === email).id}`);
    await expect(page.getByText('Datos confirmados por el cliente')).toBeVisible();
    await expect(page.getByRole('cell', { name: '320 kWh' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: '999 kWh' })).toHaveCount(0);
  });

  test('ficha del lead y archivo privado según el rol', async ({ page, browser }) => {
    await staffLogin(page, 'superadmin');
    await page.goto(`/admin/leads/${LEAD_WITH_BILL()}`);
    await expect(page.getByRole('heading', { name: 'Planilla eléctrica' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '14.808 kWh' })).toBeVisible();
    await expectNoOverflow(page);
    const f = await page.request.get(`/admin/planillas/${BILL}`);
    expect(f.status()).toBe(200);
    expect(f.headers()['content-type']).toBe('application/pdf');
    expect(f.headers()['cache-control']).toContain('no-store');
    expect((await page.request.get('/admin/planillas/44444444-4444-4444-8444-444444444444')).status()).toBe(404);

    await staffLogin(page, 'marketing');
    await page.goto(`/admin/leads/${LEAD_WITH_BILL()}`);
    await expect(page.getByRole('heading', { name: 'Planilla eléctrica' })).toHaveCount(0);
    expect((await page.request.get(`/admin/planillas/${BILL}`)).status()).toBe(403);

    const anon = await browser.newContext();
    expect((await anon.request.get(`/admin/planillas/${BILL}`)).status()).toBe(401);
    expect((await anon.request.get(`/api/dev-media/../private/bills/${BILL}.pdf`)).status()).toBeGreaterThanOrEqual(400);
    await anon.close();
  });
});
