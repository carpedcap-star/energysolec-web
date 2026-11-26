import { db, expect, expectNoOverflow, isMobile, navLink, staffLogin, test } from './helpers';

const PDF = { name: 'planilla-octubre.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% planilla\n') };
const CSV = { name: 'curva de carga.csv', mimeType: 'text/csv', buffer: Buffer.from('fecha;hora;kW\n2026-10-01;00:15;412.5\n2026-10-01;00:30;398.1\n') };
const DWG = { name: 'implantacion nave 2.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('AC1032\u0000\u0000\u0000planos') };
const FAKE = { name: 'curva.csv', mimeType: 'text/csv', buffer: Buffer.from('<html><script>alert(1)</script></html>') };

test.describe('cotización industrial', () => {
  test('el cliente envía la solicitud con documentos e Ingeniería la evalúa', async ({ page, browser }, info) => {
    test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');
    test.setTimeout(180_000);
    const company = 'Camaronera El Faro S.A.';

    await test.step('validaciones y documentos', async () => {
      await page.goto('/cotizacion-industrial');
      await expectNoOverflow(page);
      await expect(page.getByLabel('Archivo')).toBeDisabled();
      await page.getByRole('button', { name: 'Enviar solicitud de cotización' }).click();
      await expect(page.locator('form > [role=alert]')).toContainText('al menos una solución');
      await page.getByLabel('Solar en cubierta industrial').check();
      await page.getByLabel('Almacenamiento BESS').check();
      await page.getByLabel('Razón social *').fill(company);
      await page.getByLabel('Sector *').selectOption('Camaronera');
      await page.getByLabel('Provincia *').selectOption('El Oro');
      await page.getByLabel('Ciudad o cantón').fill('Machala');
      await page.getByLabel('Nivel de tensión').selectOption('mt');
      await page.getByLabel('Horario de operación').selectOption('continuo');
      await page.getByLabel('Nombre *').fill('Luis Andrade');
      await page.getByLabel('Cargo').fill('Jefe de mantenimiento');
      await page.getByLabel('Correo *').fill('luis@elfaro.ec');
      await page.getByLabel('Teléfono / WhatsApp *').fill('+593 99 555 1234');
      await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
      await expect(page.getByLabel('Archivo')).toBeEnabled();

      await page.getByLabel('Archivo').setInputFiles(PDF);
      await expect(page.getByRole('list', { name: 'Documentos adjuntos' })).toContainText('planilla-octubre.pdf');
      await page.getByLabel('Tipo de documento').selectOption('curva_carga');
      await page.getByLabel('Archivo').setInputFiles(CSV);
      await expect(page.getByRole('list', { name: 'Documentos adjuntos' })).toContainText('curva de carga.csv');
      await page.getByLabel('Archivo').setInputFiles(FAKE);
      await expect(page.locator('fieldset [role=alert]')).toContainText('no es un tipo admitido');
      await page.getByLabel('Tipo de documento').selectOption('plano');
      await page.getByLabel('Archivo').setInputFiles(DWG);
      await expect(page.getByRole('list', { name: 'Documentos adjuntos' }).getByRole('listitem')).toHaveCount(3);
      await expectNoOverflow(page);
    });

    await test.step('envío: sin kWh es válido porque hay una planilla', async () => {
      const [resp] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/industrial')), page.getByRole('button', { name: 'Enviar solicitud de cotización' }).click()]);
      expect(resp.ok()).toBe(true);
      await expect(page.getByText('Gracias, ya la estamos revisando')).toBeVisible();
      const req = db().industrial.at(-1);
      expect(req).toMatchObject({ company, sector: 'Camaronera', solutions: ['cubierta', 'bess'], eval_status: 'pendiente' });
      const docs = db().industrial_docs.filter((d: { request_id: string }) => d.request_id === req.id);
      expect(docs.map((d: { kind: string }) => d.kind).sort()).toEqual(['curva_carga', 'planilla', 'plano']);
      // Un documento ya vinculado no se puede reutilizar en otra solicitud.
      const again = await page.request.post('/api/industrial', { data: { solutions: ['om'], company: 'Otra S.A.', sector: 'Otro', province: 'Guayas', monthlyKwh: 1000, name: 'X Y', email: 'x@y.ec', phone: '0991234567', acceptPrivacy: true, documents: [{ id: docs[0].id, kind: 'planilla' }] } });
      expect(again.status()).toBe(409);
    });

    await test.step('subidas inválidas', async () => {
      const noConsent = await page.request.post('/api/industrial/upload', { multipart: { file: PDF } });
      expect(noConsent.status()).toBe(400);
      const big = await page.request.post('/api/industrial/upload', { multipart: { consent: 'on', file: { ...PDF, buffer: Buffer.concat([PDF.buffer, Buffer.alloc(4.6 * 1024 * 1024)]) } } });
      expect(big.status()).toBe(413);
    });

    let leadUrl = '';
    await test.step('Ingeniería revisa documentos y evalúa', async () => {
      await staffLogin(page, 'ingenieria');
      await navLink(page, 'Cotizaciones industriales').click();
      await page.getByRole('link', { name: company }).click();
      await page.waitForURL(/\/admin\/leads\/[0-9a-f-]{36}$/);
      leadUrl = page.url();
      await expect(page.getByRole('heading', { name: 'Solicitud industrial' })).toBeVisible();
      await expect(page.getByText('Media tensión')).toBeVisible();
      const pdfLink = page.getByRole('link', { name: 'planilla-octubre.pdf' });
      const pdfRes = await page.request.get((await pdfLink.getAttribute('href'))!);
      expect(pdfRes.status()).toBe(200);
      expect(pdfRes.headers()['content-type']).toBe('application/pdf');
      expect(pdfRes.headers()['content-disposition']).toMatch(/^inline/);
      const csvRes = await page.request.get((await page.getByRole('link', { name: 'curva de carga.csv' }).getAttribute('href'))!);
      expect(csvRes.headers()['content-disposition']).toMatch(/^attachment/);
      expect(csvRes.headers()['x-content-type-options']).toBe('nosniff');
      await expectNoOverflow(page);

      await page.getByLabel('Estado').selectOption('evaluada');
      await page.getByLabel('Potencia estimada (kWp)').fill('850');
      await page.getByLabel(/Criterio y observaciones/).fill('ok');
      await page.getByRole('button', { name: 'Guardar evaluación' }).click();
      await expect(page.locator('section [role=alert]')).toContainText('Registra el criterio');
      await expect(page.getByLabel(/Criterio y observaciones/)).toHaveValue('ok');
      await page.getByLabel(/Criterio y observaciones/).fill('Cubierta apta: 4.200 m² útiles. Conexión en MT 13,8 kV. BESS para picos nocturnos.');
      await page.getByRole('button', { name: 'Guardar evaluación' }).click();
      await expect(page.getByText('Evaluación guardada.')).toBeVisible();
      await expect(page.getByText('Evaluación de ingeniería: Evaluada · 850 kWp estimados')).toBeVisible();
      expect(db().industrial.at(-1)).toMatchObject({ eval_status: 'evaluada', eval_kwp: 850 });
    });

    await test.step('permisos', async () => {
      const docHref = `/admin/industrial/documentos/${db().industrial_docs.find((d: { filename: string }) => d.filename === 'planilla-octubre.pdf').id}`;
      await staffLogin(page, 'ventas');
      await page.goto(leadUrl);
      await expect(page.getByRole('heading', { name: 'Solicitud industrial' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Guardar evaluación' })).toHaveCount(0);
      await staffLogin(page, 'marketing');
      await expect(navLink(page, 'Cotizaciones industriales')).toHaveCount(0);
      expect((await page.request.get(docHref)).status()).toBe(403);
      const anon = await browser.newContext();
      expect((await anon.request.get(docHref)).status()).toBe(401);
      await anon.close();
    });
  });

  test('pantallas sin desborde', async ({ page }) => {
    await page.goto('/cotizacion-industrial');
    await expectNoOverflow(page);
    await staffLogin(page, 'ingenieria');
    await page.goto('/admin/industrial');
    await expect(page.locator('h1')).toHaveText('Cotizaciones industriales');
    await expectNoOverflow(page);
  });
});
