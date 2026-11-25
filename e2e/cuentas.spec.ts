import type { Page } from '@playwright/test';
import { expect, expectNoOverflow, isMobile, navLink, staffLogin, tag, test } from './helpers';

/** Flujo completo: solicitud → revisión → aprobación por Gerencia → activación → precios de nivel → suspensión. */
test('cuenta comercial de instalador, de la solicitud a la suspensión', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const t = tag(info);
  const company = `Solar Andes ${t.toUpperCase()} S.A.S.`;
  const EMAIL = `ana-${t}@solarandes.ec`, RUC = isMobile(info) ? '0912345678001' : '1790012345001', PW = 'Instalador2026';
  const alertText = (p: Page) => p.locator('p[role=alert]').first();

  async function apply(o: { ruc?: string; privacy?: boolean; email?: string } = {}) {
    await page.goto('/profesionales');
    await page.getByLabel('Razón social o nombre comercial *').fill(company);
    await page.getByLabel('RUC *').fill(o.ruc ?? RUC);
    await page.getByLabel('Ciudad *').fill('Quito');
    await page.getByLabel('Persona de contacto *').fill('Ana Pérez');
    await page.getByLabel('Teléfono / WhatsApp *').fill('+593 99 123 4567');
    await page.getByLabel('Correo de acceso *').fill(o.email ?? EMAIL);
    if (o.privacy !== false) await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  }

  await test.step('solicitud pública con validaciones', async () => {
    await apply({ privacy: false });
    await expect(alertText(page)).toContainText('privacidad');
    await apply({ ruc: '1234' });
    await expect(alertText(page)).toContainText('13 dígitos');
    await apply();
    await expect(page.getByText('Revisaremos tu solicitud')).toBeVisible();
    await apply({ ruc: '0101234567001' });
    await expect(alertText(page)).toContainText('Ya existe una solicitud o cuenta con ese correo');
  });

  let accountUrl = '';
  await test.step('Ventas puede rechazar pero no aprobar', async () => {
    await staffLogin(page, 'ventas');
    await page.goto('/admin/cuentas?estado=pendiente');
    await page.getByRole('link', { name: company }).click();
    await page.waitForURL(/\/admin\/cuentas\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('radio', { name: 'Rechazada' })).toHaveCount(1);
    await expect(page.getByRole('radio', { name: 'Aprobada' })).toHaveCount(0);
    await expectNoOverflow(page);
    accountUrl = page.url();
  });

  let link = '';
  await test.step('Gerencia aprueba y se genera el enlace de activación', async () => {
    await staffLogin(page, 'gerencia');
    await page.goto(accountUrl);
    await page.getByRole('radio', { name: 'Aprobada' }).check();
    await page.getByLabel('Nivel de precios').selectOption('instalador');
    await page.getByLabel(/Nota/).fill('RUC verificado en el SRI.');
    await page.getByRole('button', { name: 'Guardar revisión' }).click();
    link = await page.getByLabel('Enlace de activación').inputValue();
    expect(link).toMatch(/\/cuenta\/activar\?token_hash=.+&type=invite$/);
  });

  await test.step('activación: sin activar no entra; contraseña débil no gasta el enlace', async () => {
    await page.context().clearCookies();
    await page.goto('/cuenta/ingresar');
    await page.getByLabel('Correo').fill(EMAIL);
    await page.getByLabel('Contraseña').fill(PW);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(alertText(page)).toContainText('incorrectos');
    await expect(page.getByLabel('Correo')).toHaveValue(EMAIL);
    await page.goto(new URL(link).pathname + new URL(link).search);
    await page.getByLabel('Nueva contraseña').fill('corta');
    await page.getByLabel('Repite la contraseña').fill('corta');
    await page.getByRole('button', { name: 'Guardar y entrar' }).click();
    await expect(alertText(page)).toContainText('10 caracteres');
    await page.getByLabel('Nueva contraseña').fill(PW);
    await page.getByLabel('Repite la contraseña').fill(PW);
    await page.getByRole('button', { name: 'Guardar y entrar' }).click();
    await page.waitForURL('**/cuenta?activada=1');
    await expect(page.getByRole('heading', { name: company })).toBeVisible();
    await expectNoOverflow(page);
  });

  let orderNumber = '';
  await test.step('tienda, ficha y pedido con precios de instalador', async () => {
    await page.goto('/tienda');
    await expect(page.getByText(/Precios de instalador para Solar Andes/)).toBeVisible();
    const card = page.locator('.card').filter({ hasText: 'Panel monocristalino' }).first();
    await expect(card).toContainText('Tu precio · Instalador');
    await expect(card).toContainText('$160,00');
    await expect(page.locator('.card').filter({ hasText: 'Inversor híbrido' }).first()).toContainText('$1.000,00');
    await expectNoOverflow(page);
    await page.goto('/tienda/ejemplo-panel-580w');
    await expect(page.getByText('Precio cliente final: $200,00')).toBeVisible();
    await expect(page.locator('script[type="application/ld+json"]', { hasText: '"Product"' })).toHaveCount(0);
    await page.getByLabel('Cantidad').fill('2');
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.goto('/carrito');
    await expect(page.getByText('· precio instalador')).toBeVisible();
    await expect(page.getByText(/Pedido de Solar Andes .* con precios de instalador/)).toBeVisible();
    await expect(page.getByLabel('Correo *')).toHaveValue(EMAIL);
    await page.getByLabel('Dirección de entrega *').fill('Av. Amazonas N24-100');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await expectNoOverflow(page);
    const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/orders')), page.getByRole('button', { name: /Registrar pedido/ }).click()]);
    const order = await resp.json();
    expect(order.total).toBe(368); // 2 × 160 + IVA 15 %
    expect(decodeURIComponent(order.whatsappUrl)).toMatch(/Cuenta comercial: Solar Andes .* precios de instalador/);
    orderNumber = order.number;
    await page.goto('/cuenta');
    await expect(page.getByRole('cell', { name: orderNumber })).toBeVisible();
  });

  await test.step('sin cuenta, declararse distribuidor no da precio de nivel', async () => {
    const anon = await browser.newContext();
    const r = await anon.request.post('/api/orders', { data: { lines: [{ productId: 'prod-1', qty: 2 }], name: 'Pirata', email: 'x@example.com', phone: '0991234567', city: 'Quito', address: 'Calle 123', customerType: 'distribuidor', acceptPrivacy: true, website: '' } });
    const o = await r.json();
    expect(o.total).toBe(460);
    expect(decodeURIComponent(o.whatsappUrl)).toContain('Sin cuenta comercial aprobada');
    const cp = await (await anon.request.post('/api/cart/prices', { data: { ids: ['prod-1'] } })).json();
    expect(cp).toMatchObject({ tier: 'final', prices: { 'prod-1': { unitPrice: 200 } } });
    await anon.close();
  });

  await test.step('Gerencia suspende y el acceso a precios se corta al instante', async () => {
    const staff = await browser.newContext({ viewport: page.viewportSize()! });
    const sp = await staff.newPage();
    await staffLogin(sp, 'gerencia');
    await sp.goto(accountUrl);
    await sp.getByRole('link', { name: orderNumber }).click();
    await expect(sp.getByText('Precios: instalador')).toBeVisible();
    await sp.goto(accountUrl);
    await sp.getByRole('radio', { name: 'Suspendida' }).check();
    await sp.getByRole('button', { name: 'Guardar revisión' }).click();
    await expect(sp.locator('[role=alert].rounded-xl')).toContainText('Indica el motivo');
    await sp.getByLabel(/Nota/).fill('Prueba de suspensión');
    await sp.getByRole('button', { name: 'Guardar revisión' }).click();
    await expect(sp.getByText('Cambios guardados.')).toBeVisible();
    await expect(sp.locator('span.rounded-full', { hasText: 'Suspendida' })).toBeVisible();
    await staff.close();
    await page.goto('/tienda');
    await expect(page.getByText(/Precios de instalador/)).toHaveCount(0);
    await expect(page.locator('.card').filter({ hasText: 'Panel monocristalino' }).first()).toContainText('$200,00');
    await page.goto('/cuenta');
    await expect(page).toHaveURL(/\/cuenta\/ingresar/);
  });

  await test.step('recuperar acceso no revela si el correo existe', async () => {
    await page.goto('/cuenta/recuperar');
    await page.getByLabel('Correo de tu cuenta').fill('nadie@example.com');
    await page.getByRole('button', { name: 'Enviarme un enlace' }).click();
    await expect(page.getByText(/Si el correo corresponde a una cuenta comercial aprobada/)).toBeVisible();
    await expectNoOverflow(page);
  });

  await test.step('Marketing no ve cuentas comerciales', async () => {
    await staffLogin(page, 'marketing');
    await expect(navLink(page, 'Cuentas comerciales')).toHaveCount(0);
  });
});
