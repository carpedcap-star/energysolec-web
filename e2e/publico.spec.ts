import { expect, expectNoOverflow, tag, test } from './helpers';

const PAGES = ['/', '/tienda', '/calculadora', '/proyectos', '/servicios', '/marcas', '/blog', '/nosotros', '/contacto', '/financiamiento', '/profesionales', '/privacidad'];

test.describe('sitio público', () => {
  for (const path of PAGES) {
    test(`${path} carga con título y sin desborde`, async ({ page }) => {
      const r = await page.goto(path, { waitUntil: 'networkidle' });
      expect(r?.status()).toBe(200);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoOverflow(page);
    });
  }

  test('la calculadora entrega el estudio tras el registro', async ({ page }, info) => {
    await page.goto('/calculadora');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('div').filter({ has: page.locator('p.label', { hasText: 'Factura mensual promedio (USD) *' }) }).last().locator('input').fill('85');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Calcular mi estudio' }).click();
    // Sin acceso a PVGIS/NASA el motor usa el respaldo regional: el flujo debe completarse igual.
    await expect(page.getByText('Tu estudio energético personalizado está listo.')).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('Nombre *').fill('Cliente E2E');
    await page.getByLabel('Correo electrónico *').fill(`calc-${tag(info)}@example.com`);
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await page.getByRole('button', { name: 'Ver mi estudio y recibirlo por correo' }).click();
    await page.waitForURL(/\/calculadora\/estudio\/ESE-\d{4}-\d{6}\?t=/);
    await expect(page.getByText(/kWp/).first()).toBeVisible();
    await expectNoOverflow(page);
  });

  test('pedido anónimo: precio recalculado en servidor y WhatsApp', async ({ page }, info) => {
    await page.goto('/tienda/ejemplo-panel-580w');
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.goto('/carrito');
    await page.getByLabel('Nombre *').fill('Comprador E2E');
    await page.getByLabel('Correo *').fill(`compra-${tag(info)}@example.com`);
    await page.getByLabel('Teléfono / WhatsApp *').fill('+593 99 111 2222');
    await page.getByLabel('Ciudad *').fill('Guayaquil');
    await page.getByLabel('Dirección de entrega *').fill('Av. 9 de Octubre 100');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await expectNoOverflow(page);
    const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/orders')), page.getByRole('button', { name: /Registrar pedido/ }).click()]);
    const order = await resp.json();
    expect(resp.ok()).toBe(true);
    expect(order.total).toBe(230); // 200 + IVA 15 %
    await expect(page.getByText(order.number)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Enviar pedido por WhatsApp' })).toHaveAttribute('href', /wa\.me/);
  });
});
