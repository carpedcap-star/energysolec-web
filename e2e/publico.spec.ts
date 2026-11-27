import { db, expect, expectNoOverflow, isMobile, staffLogin, tag, test } from './helpers';

const PAGES = ['/', '/tienda', '/calculadora', '/proyectos', '/servicios', '/marcas', '/blog', '/nosotros', '/contacto', '/financiamiento', '/profesionales', '/cotizacion-industrial', '/privacidad'];

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
    await page.getByLabel('Factura mensual promedio (USD) *').fill('85');
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Calcular mi estudio' }).click();
    // Sin acceso a PVGIS/NASA el motor usa el respaldo regional: el flujo debe completarse igual.
    await expect(page.getByText('Tu estudio energético personalizado está listo.')).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('Nombre *').fill('Cliente E2E');
    await page.getByLabel('Correo electrónico *').fill(`calc-${tag(info)}@example.com`);
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await page.getByRole('button', { name: 'Ver mi estudio y recibirlo por correo' }).click();
    await page.waitForURL(/\/calculadora\/estudio\/ESE-\d{4}-\d{6}\?t=/);
    await expect(page.getByText(/kWp/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compara tus alternativas' })).toBeVisible();
    await expectNoOverflow(page);
  });

  test('desbloqueo con UTM guardadas: WhatsApp vacío, nacional e internacional y consentimiento comercial', async ({ page }, info) => {
    test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');
    // Llegar por un enlace de campaña guarda las UTM con una marca de tiempo numérica (`_at`).
    await page.goto('/calculadora?utm_source=e2e&utm_campaign=lanzamiento&gclid=abc123');
    for (const [i, phone, marketing] of [[0, '', false], [1, '099 123 4567', true], [2, '+593 99 123 4567', false]] as const) {
      await page.goto('/calculadora');
      await page.getByLabel('Factura mensual promedio (USD) *').fill('85');
      for (let k = 0; k < 3; k++) await page.getByRole('button', { name: 'Continuar' }).click();
      await page.getByRole('button', { name: 'Calcular mi estudio' }).click();
      const email = `utm${i}-${tag(info)}-${info.retry}@example.com`;
      await page.getByLabel('Nombre *').fill(`Cliente UTM ${i}`, { timeout: 60_000 });
      await page.getByLabel('Correo electrónico *').fill(email);
      if (phone) await page.getByRole('textbox', { name: 'WhatsApp' }).fill(phone);
      await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
      if (marketing) await page.getByRole('checkbox', { name: /Autorizo recibir información comercial/ }).check();
      await page.getByRole('button', { name: 'Ver mi estudio y recibirlo por correo' }).click();
      await page.waitForURL(/\/calculadora\/estudio\/ESE-\d{4}-\d{6}\?t=/);
      await expect(page.getByRole('heading', { name: 'Compara tus alternativas' })).toBeVisible();
      const code = page.url().match(/ESE-\d{4}-\d{6}/)![0];
      const pdf = await page.request.get(page.url().replace('/calculadora/estudio/', '/api/study/').replace('?t=', '/pdf?t='));
      expect(pdf.status()).toBe(200);
      const d = db();
      const lead = d.leads.find((l: { email: string }) => l.email === email);
      expect(lead.phone ?? '').toBe(phone);
      expect(lead.utm).toMatchObject({ utm_source: 'e2e', utm_campaign: 'lanzamiento', gclid: 'abc123' });
      expect(d.studies.find((s: { code: string }) => s.code === code)).toMatchObject({ unlocked: true, lead_id: lead.id });
      expect(d.consents.find((c: { email: string; purpose: string }) => c.email === email && c.purpose === 'comercial_marketing').granted).toBe(marketing);
    }
  });

  test('calculadora: superficies, respaldo y tres alternativas', async ({ page }, info) => {
    await page.goto('/calculadora?segmento=comercial');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /./ })).toContainText('factura');
    await page.getByRole('radio', { name: 'Consumo mensual (kWh)' }).click();
    await page.getByLabel('Consumo mensual promedio (kWh) *').fill('4000');
    await page.getByLabel('Tarifa de tu planilla').selectOption('COM-BV-D');
    await page.getByLabel('Demanda facturable (kW)').fill('25');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByLabel('Cantón o ciudad').fill('Guayaquil');
    await expect(page.getByLabel('Empresa distribuidora')).toContainText('Según mi ubicación: CNEL EP Guayaquil');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByLabel('Techo de metal').check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /./ })).toContainText('No conozco el área');
    await page.getByLabel('Área disponible (m²)').fill('150');
    await page.getByLabel('Terreno').check();
    await page.getByLabel('No conozco el área').nth(1).check();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByLabel('Respaldo en apagones').check();
    await page.getByRole('radio', { name: '4 h', exact: true }).click();
    await page.getByRole('button', { name: 'Calcular mi estudio' }).click();
    await page.getByLabel('Nombre *').fill('Cliente Alternativas', { timeout: 60_000 });
    await page.getByLabel('Correo electrónico *').fill(`alt-${tag(info)}@example.com`);
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await page.getByRole('button', { name: 'Ver mi estudio y recibirlo por correo' }).click();
    await page.waitForURL(/\/calculadora\/estudio\/ESE-\d{4}-\d{6}\?t=/);
    for (const n of ['Energy On Grid', 'Energy Hybrid', 'Energy Off Grid']) await expect(page.getByRole('heading', { name: n })).toBeVisible();
    await expect(page.getByText('Tu espacio disponible')).toBeVisible();
    await expect(page.getByText(/Techo de metal: 150 m²/)).toBeVisible();
    await expect(page.getByText(/Respaldo estimado/).first()).toBeVisible();
    await expectNoOverflow(page);
    // Informe PDF con la página de alternativas y ficha del lead en el CRM.
    const pdf = await page.request.get(page.url().replace('/calculadora/estudio/', '/api/study/').replace('?t=', '/pdf?t='));
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    if (isMobile(info)) return;
    await staffLogin(page, 'superadmin');
    await page.goto(`/admin/leads/${db().leads.find((l: { email: string }) => l.email === `alt-${tag(info)}@example.com`).id}`);
    await expect(page.getByRole('heading', { name: 'Estudios de la calculadora' })).toBeVisible();
    await expect(page.getByRole('rowheader', { name: /Energy Off Grid/ })).toBeVisible();
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
