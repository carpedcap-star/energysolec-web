import type { Page, Request } from '@playwright/test';
// El widget vive en un shadow DOM cerrado: se comprueba que Turnstile montó su contenedor, no el iframe.
import { expect, expectNoOverflow, test } from '../e2e/helpers';
import { TS } from '../playwright.turnstile.config';

const PDF = { name: 'planilla.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% planilla\n') };
const CSV = { name: 'curva.csv', mimeType: 'text/csv', buffer: Buffer.from('fecha;hora;kW\n2026-10-01;00:15;412.5\n') };
const TURNSTILE_ERROR = /No pudimos comprobar que el envío lo hace una persona/;

/** Token que viajó en la petición (JSON o multipart). */
function sentToken(req: Request) {
  const ct = req.headers()['content-type'] ?? '';
  if (ct.includes('application/json')) return req.postDataJSON().turnstileToken;
  return /name="turnstileToken"\r\n\r\n([^\r]+)/.exec(req.postDataBuffer()?.toString('latin1') ?? '')?.[1];
}

async function submitAndCheck(page: Page, path: string, click: () => Promise<void>) {
  const [req] = await Promise.all([page.waitForRequest((r) => new URL(r.url()).pathname === path && r.method() === 'POST'), click()]);
  expect(sentToken(req), `token de Turnstile en ${path}`).toBe(TS.dummyToken);
  const res = await req.response();
  expect(res?.status(), `respuesta de ${path}`).toBeLessThan(300);
}

test.describe('Turnstile con las claves de prueba de Cloudflare', () => {
  test('la API rechaza envíos sin token o con un token inválido', async ({ request }) => {
    const lead = { source: 'contacto', name: 'Sin Token', email: 'sintoken@example.com', acceptPrivacy: true, acceptMarketing: false, website: '' };
    const r1 = await request.post('/api/leads', { data: lead });
    expect(r1.status()).toBe(400);
    expect((await r1.json()).error).toContain('No pudimos verificar');
    const r2 = await request.post('/api/trade/apply', { data: { company: 'X', ruc: '1790012345001', contact_name: 'X Y', email: 'x@example.com', phone: '0991234567', city: 'Quito', tier: 'instalador', acceptPrivacy: true } });
    expect(r2.status()).toBe(400);
    const r3 = await request.post('/api/industrial/upload', { multipart: { consent: 'on', file: PDF } });
    expect(r3.status()).toBe(400);
    const r4 = await request.post('/api/leads', { data: { ...lead, turnstileToken: 'x'.repeat(3000) } });
    expect(r4.status()).toBe(400);
  });

  test('contacto: el widget emite el token y el servidor lo valida con Cloudflare', async ({ page }) => {
    await page.goto('/contacto');
    await expect(page.locator('[data-turnstile=lead] > div')).toBeAttached();
    await page.getByLabel('Nombre *').fill('Cliente Turnstile');
    await page.getByLabel('Correo electrónico *').fill('turnstile-contacto@example.com');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await submitAndCheck(page, '/api/leads', () => page.getByRole('button', { name: 'Enviar solicitud' }).click());
    await expect(page.getByText('Gracias, recibimos tu solicitud.')).toBeVisible();
  });

  test('calculadora: el estudio se entrega con token', async ({ page }) => {
    await page.goto('/calculadora');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.locator('div').filter({ has: page.locator('p.label', { hasText: 'Factura mensual promedio (USD) *' }) }).last().locator('input').fill('85');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await page.getByRole('button', { name: 'Calcular mi estudio' }).click();
    await expect(page.getByText('Tu estudio energético personalizado está listo.')).toBeVisible({ timeout: 60_000 });
    await page.getByLabel('Nombre *').fill('Cliente Turnstile');
    await page.getByLabel('Correo electrónico *').fill('turnstile-calc@example.com');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await submitAndCheck(page, '/api/study/unlock', () => page.getByRole('button', { name: 'Ver mi estudio y recibirlo por correo' }).click());
    await page.waitForURL(/\/calculadora\/estudio\/ESE-\d{4}-\d{6}\?t=/);
  });

  test('pedido de la tienda con token', async ({ page }) => {
    await page.goto('/tienda/ejemplo-panel-580w');
    await page.getByRole('button', { name: 'Agregar al carrito' }).click();
    await page.goto('/carrito');
    await page.getByLabel('Nombre *').fill('Comprador Turnstile');
    await page.getByLabel('Correo *').fill('turnstile-pedido@example.com');
    await page.getByLabel('Teléfono / WhatsApp *').fill('+593 99 111 2222');
    await page.getByLabel('Ciudad *').fill('Guayaquil');
    await page.getByLabel('Dirección de entrega *').fill('Av. 9 de Octubre 100');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await submitAndCheck(page, '/api/orders', () => page.getByRole('button', { name: /Registrar pedido/ }).click());
    await expect(page.getByRole('link', { name: 'Enviar pedido por WhatsApp' })).toBeVisible();
  });

  test('cuenta comercial con token', async ({ page }) => {
    await page.goto('/profesionales');
    await page.getByLabel('Razón social o nombre comercial *').fill('Solar Turnstile S.A.S.');
    await page.getByLabel('RUC *').fill('1790012345001');
    await page.getByLabel('Ciudad *').fill('Quito');
    await page.getByLabel('Persona de contacto *').fill('Ana Pérez');
    await page.getByLabel('Teléfono / WhatsApp *').fill('+593 99 123 4567');
    await page.getByLabel('Correo de acceso *').fill('turnstile-cuenta@example.com');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await submitAndCheck(page, '/api/trade/apply', () => page.getByRole('button', { name: 'Enviar solicitud' }).click());
    await expect(page.getByText('Revisaremos tu solicitud')).toBeVisible();
  });

  test('cotización industrial: un token nuevo por documento y otro para la solicitud', async ({ page }) => {
    await page.goto('/cotizacion-industrial');
    await page.getByLabel('Solar en cubierta industrial').check();
    await page.getByLabel('Razón social *').fill('Industria Turnstile S.A.');
    await page.getByLabel('Sector *').selectOption('Camaronera');
    await page.getByLabel('Provincia *').selectOption('El Oro');
    await page.getByLabel('Nombre *').fill('Luis Andrade');
    await page.getByLabel('Correo *').fill('turnstile-industrial@example.com');
    await page.getByLabel('Teléfono / WhatsApp *').fill('+593 99 555 1234');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await submitAndCheck(page, '/api/industrial/upload', () => page.getByLabel('Archivo').setInputFiles(PDF));
    await expect(page.getByRole('list', { name: 'Documentos adjuntos' })).toContainText('planilla.pdf');
    await page.getByLabel('Tipo de documento').selectOption('curva_carga');
    await submitAndCheck(page, '/api/industrial/upload', () => page.getByLabel('Archivo').setInputFiles(CSV));
    await expect(page.getByRole('list', { name: 'Documentos adjuntos' }).getByRole('listitem')).toHaveCount(2);
    await submitAndCheck(page, '/api/industrial', () => page.getByRole('button', { name: 'Enviar solicitud de cotización' }).click());
    await expect(page.getByText('Gracias, ya la estamos revisando')).toBeVisible();
  });

  test('si Turnstile no carga, el formulario lo dice y no envía nada', async ({ page }) => {
    await page.route('https://challenges.cloudflare.com/**', (r) => r.abort());
    let sent = false;
    page.on('request', (r) => { if (r.url().endsWith('/api/leads')) sent = true; });
    await page.goto('/contacto');
    await page.getByLabel('Nombre *').fill('Cliente Sin Widget');
    await page.getByLabel('Correo electrónico *').fill('sinwidget@example.com');
    await page.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.locator('form [role=alert]')).toHaveText(TURNSTILE_ERROR);
    expect(sent).toBe(false);
  });

  test.describe('móvil', () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test('el widget no desborda la página a 390 px', async ({ page }) => {
      for (const path of ['/contacto', '/profesionales', '/cotizacion-industrial']) {
        await page.goto(path);
        await expect(page.locator('[data-turnstile] > div').first()).toBeAttached();
        await expectNoOverflow(page);
      }
    });
  });
});
