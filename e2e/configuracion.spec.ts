import { expect, expectNoOverflow, isMobile, staffLogin, test } from './helpers';

test.describe('contacto e integraciones', () => {
  test('marketing edita el contacto y se publica en todo el sitio', async ({ page }, info) => {
    test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');
    await staffLogin(page, 'marketing');
    await page.goto('/admin/configuracion');
    await expectNoOverflow(page);

    // Un ID con código inyectado se rechaza y no se pierde lo escrito.
    await page.getByLabel('WhatsApp comercial *').fill('0991112222');
    await page.getByLabel('Instagram').fill('https://www.instagram.com/energysolec');
    await page.getByLabel('Google Analytics 4').fill("G-X');alert(1);//");
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.locator('form [role=alert]')).toContainText('Google Analytics 4: formato esperado');
    await expect(page.getByLabel('WhatsApp comercial *')).toHaveValue('0991112222');

    await page.getByLabel('Google Analytics 4').fill('G-TEST12345');
    await page.getByLabel('Horario de atención').fill('Lunes a viernes, 8:30 a 17:30');
    await page.getByLabel('Correo de avisos comerciales').fill('avisos@energysolec.test');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados y publicados.')).toBeVisible();
    await expect(page.getByLabel('WhatsApp comercial *')).toHaveValue('+593991112222');

    await page.goto('/contacto');
    await expect(page.locator('main').getByRole('link', { name: 'WhatsApp +593 99 111 2222' })).toHaveAttribute('href', /wa\.me\/593991112222/);
    await expect(page.locator('footer').getByRole('link', { name: 'WhatsApp +593 99 111 2222' })).toHaveAttribute('href', 'https://wa.me/593991112222');
    await expect(page.getByText('Horario: Lunes a viernes, 8:30 a 17:30')).toBeVisible();
    await expect(page.locator('footer').getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/energysolec');
    await expect(page.getByRole('link', { name: /Escríbenos por WhatsApp al \+593 99 111 2222/ })).toHaveAttribute('href', /wa\.me\/593991112222/);
    const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(JSON.parse(ld!)).toMatchObject({ contactPoint: [{ telephone: '+593991112222' }], sameAs: ['https://www.instagram.com/energysolec'] });
    await expect(page.locator('script[src*="gtag/js?id=G-TEST12345"]')).toHaveCount(1);
    await expectNoOverflow(page);
  });

  test('integraciones del servidor: solo estado, nunca las claves', async ({ page }) => {
    await staffLogin(page, 'superadmin');
    await page.goto('/admin/configuracion');
    await expect(page.getByText(/Correo transaccional \(Resend\)/)).toBeVisible();
    await expect(page.getByText('no configurada').first()).toBeVisible();
    await expectNoOverflow(page);
  });
});
