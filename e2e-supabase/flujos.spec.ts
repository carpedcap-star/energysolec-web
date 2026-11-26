import { test, expect, type Page } from '@playwright/test';
import { SB } from '../playwright.supabase.config';

/**
 * Flujos principales contra Supabase real: Auth (panel y clientes comerciales), Storage (público y privado), RLS,
 * disparadores (pago verificado por Gerencia, autoría) y tareas programadas. Datos únicos por corrida.
 */
const PW = 'Panel-Prueba-2026';
const U = Date.now().toString(36).slice(-5);
// PNG 1×1 válido y PDF mínimo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n% prueba\n');

async function login(p: Page, role: string) {
  await p.context().clearCookies();
  await p.goto('/admin/login');
  await p.getByLabel(/^Correo/).fill(`${role}@sb.test`);
  await p.getByLabel('Contraseña').fill(PW);
  await p.getByRole('button', { name: 'Ingresar' }).click();
  await p.waitForURL('**/admin');
}

test('flujos principales contra Supabase', async ({ page: p, browser }) => {
  const errs: string[] = [];
  const watch = (pg: Page) => { pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); }); };
  watch(p);
  const anon = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  watch(anon);
  let productUrl = '';

  await test.step('panel con Supabase Auth: todas las secciones', async () => {
    await login(p, 'superadmin');
    for (const s of ['leads', 'pedidos', 'cuentas', 'industrial', 'productos', 'proyectos', 'contenido', 'marcas', 'servicios', 'blog', 'usuarios', 'identidad', 'configuracion', 'parametros', 'tarifas', 'recurso-solar', 'indicadores', 'mensajes']) {
      const r = await p.goto(`/admin/${s}`);
      expect(r?.status(), s).toBe(200);
      await expect(p.locator('h1').first(), s).toBeVisible();
    }
  });

  await test.step('producto con imagen y ficha en Storage', async () => {
    await login(p, 'compras');
    await p.goto('/admin/productos/nuevo');
    await p.getByLabel('Nombre *').fill(`Panel SB ${U} 580 W`);
    await p.getByLabel('SKU *').fill(`SB-${U}`);
    await p.getByLabel('Categoría *').selectOption('paneles-solares');
    await p.locator('[name=price_final]').fill('200');
    await p.locator('[name=price_instalador]').fill('160');
    await p.getByLabel('Disponibilidad *').selectOption('disponible');
    await p.getByLabel('Stock (unidades) *').fill('10');
    await p.getByLabel('Agregar imágenes').setInputFiles({ name: 'panel.png', mimeType: 'image/png', buffer: PNG });
    await p.getByLabel('Cargar PDF').setInputFiles({ name: 'ficha.pdf', mimeType: 'application/pdf', buffer: PDF });
    await p.getByRole('checkbox', { name: /^Publicado en la tienda/ }).check();
    await p.getByRole('button', { name: 'Crear producto' }).click();
    await p.waitForURL(/\/admin\/productos\/[^/]+\?guardado=1/);
    await p.goto('/tienda');
    await p.getByRole('link', { name: `Panel SB ${U} 580 W` }).last().click();
    await p.waitForURL(/\/tienda\/panel-sb-/);
    productUrl = p.url();
    const img = (await p.locator('main img').first().getAttribute('src'))!;
    expect(img).toMatch(/storage\/v1\/object\/public\/public-media\//);
    expect((await p.request.get(img)).status()).toBe(200);
    expect((await p.request.get((await p.getByRole('link', { name: 'Descargar ficha técnica' }).getAttribute('href'))!)).status()).toBe(200);
  });

  await test.step('pedido anónimo y pago verificado por Gerencia', async () => {
    await anon.goto(productUrl);
    await anon.getByRole('button', { name: 'Agregar al carrito' }).click();
    await anon.goto('/carrito');
    await anon.getByLabel('Nombre *').fill('Comprador SB');
    await anon.getByLabel('Correo *').fill(`compra-${U}@sb.test`);
    await anon.getByLabel('Teléfono / WhatsApp *').fill('+593 99 111 2222');
    await anon.getByLabel('Ciudad *').fill('Guayaquil');
    await anon.getByLabel('Dirección de entrega *').fill('Av. 9 de Octubre 100');
    await anon.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    const [or] = await Promise.all([anon.waitForResponse((r) => r.url().endsWith('/api/orders')), anon.getByRole('button', { name: /Registrar pedido/ }).click()]);
    const order = await or.json();
    expect(order.total).toBe(230);
    await login(p, 'gerencia');
    await p.goto('/admin/pedidos');
    await p.getByRole('link', { name: order.number }).click();
    await p.waitForURL(/\/admin\/pedidos\/[0-9a-f-]{36}$/);
    await p.getByLabel('Estado del pedido').selectOption('pagado');
    await p.getByLabel(/Referencia/).fill(`TRX-${U}`);
    await p.getByRole('button', { name: 'Guardar' }).click();
    await expect(p.getByRole('status').filter({ hasText: 'Actualizado.' })).toBeVisible();
    await p.reload();
    await expect(p.getByText(`TRX-${U}`)).toBeVisible();
  });

  await test.step('calculadora: estudio, lead y desbloqueo', async () => {
    await anon.goto('/calculadora');
    await anon.getByLabel('Factura mensual promedio (USD) *').fill('85');
    for (let i = 0; i < 3; i++) await anon.getByRole('button', { name: 'Continuar' }).click();
    await anon.getByRole('button', { name: 'Calcular mi estudio' }).click();
    await expect(anon.getByText('Tu estudio energético personalizado está listo.')).toBeVisible({ timeout: 60_000 });
    await anon.getByLabel('Nombre *').fill('Cliente SB');
    await anon.getByLabel('Correo electrónico *').fill(`calc-${U}@sb.test`);
    await anon.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await anon.getByRole('button', { name: 'Ver mi estudio y recibirlo por correo' }).click();
    await anon.waitForURL(/\/calculadora\/estudio\/ESE-\d{4}-\d{6}\?t=/, { timeout: 60_000 });
  });

  await test.step('cuenta comercial: aprobación, activación (verifyOtp), precio de nivel y sesiones separadas', async () => {
    await anon.goto('/profesionales');
    await anon.getByLabel('Razón social o nombre comercial *').fill(`Solar SB ${U}`);
    await anon.getByLabel('RUC *').fill(`17${String(Date.now()).slice(-8)}001`);
    await anon.getByLabel('Ciudad *').fill('Quito');
    await anon.getByLabel('Persona de contacto *').fill('Ana SB');
    await anon.getByLabel('Teléfono / WhatsApp *').fill('+593 99 123 4567');
    await anon.getByLabel('Correo de acceso *').fill(`trade-${U}@sb.test`);
    await anon.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await anon.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(anon.getByText('Revisaremos tu solicitud')).toBeVisible();
    await p.goto('/admin/cuentas?estado=pendiente');
    await p.getByRole('link', { name: `Solar SB ${U}` }).click();
    await p.waitForURL(/\/admin\/cuentas\/[0-9a-f-]{36}$/);
    await p.getByRole('radio', { name: 'Aprobada' }).check();
    await p.getByRole('button', { name: 'Guardar revisión' }).click();
    const link = await p.getByLabel('Enlace de activación').inputValue();
    await anon.context().clearCookies();
    await anon.goto(link);
    await anon.getByLabel('Nueva contraseña').fill('Instalador2026');
    await anon.getByLabel('Repite la contraseña').fill('Instalador2026');
    await anon.getByRole('button', { name: 'Guardar y entrar' }).click();
    await anon.waitForURL('**/cuenta?activada=1');
    await anon.goto(productUrl);
    await expect(anon.getByText('Precio cliente final: $200,00')).toBeVisible();
    // Un usuario del panel no entra como cliente, ni un cliente al panel.
    const x = await (await browser.newContext()).newPage();
    await x.goto('/cuenta/ingresar');
    await x.getByLabel('Correo').fill('ventas@sb.test');
    await x.getByLabel('Contraseña').fill(PW);
    await x.getByRole('button', { name: 'Ingresar' }).click();
    await expect(x.locator('p[role=alert]')).toContainText('no está activa');
    await x.goto('/admin/login');
    await x.getByLabel(/^Correo/).fill(`trade-${U}@sb.test`);
    await x.getByLabel('Contraseña').fill('Instalador2026');
    await x.getByRole('button', { name: 'Ingresar' }).click();
    await expect(x.locator('form [role=alert]')).toContainText('perfil activo');
    await x.context().close();
  });

  await test.step('configuración publicada en el sitio', async () => {
    await login(p, 'marketing');
    await p.goto('/admin/configuracion');
    await p.getByLabel('WhatsApp comercial *').fill('0991112222');
    await p.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(p.getByText('Cambios guardados y publicados.')).toBeVisible();
    await anon.goto('/contacto');
    await expect(anon.locator('main').getByRole('link', { name: 'WhatsApp +593 99 111 2222' })).toBeVisible();
  });

  await test.step('cotización industrial: documento privado y evaluación', async () => {
    await anon.goto('/cotizacion-industrial');
    await anon.getByLabel('Solar en cubierta industrial').check();
    await anon.getByLabel('Razón social *').fill(`Industria SB ${U}`);
    await anon.getByLabel('Sector *').selectOption('Agroindustria');
    await anon.getByLabel('Nombre *').fill('Luis SB');
    await anon.getByLabel('Correo *').fill(`ind-${U}@sb.test`);
    await anon.getByLabel('Teléfono / WhatsApp *').fill('+593 99 555 1234');
    await anon.getByRole('checkbox', { name: /Acepto la política de privacidad/ }).check();
    await anon.getByLabel('Archivo').setInputFiles({ name: 'planilla.pdf', mimeType: 'application/pdf', buffer: PDF });
    await expect(anon.getByRole('list', { name: 'Documentos adjuntos' })).toBeVisible();
    await anon.getByRole('button', { name: 'Enviar solicitud de cotización' }).click();
    await expect(anon.getByText('Gracias, ya la estamos revisando')).toBeVisible();
    await login(p, 'ingenieria');
    await p.goto('/admin/industrial');
    await p.getByRole('link', { name: `Industria SB ${U}` }).click();
    await p.waitForURL(/\/admin\/leads\//);
    const doc = await p.request.get((await p.getByRole('link', { name: 'planilla.pdf' }).getAttribute('href'))!);
    expect(doc.status()).toBe(200);
    expect((await doc.body()).toString()).toMatch(/^%PDF/);
    await p.getByLabel('Estado').selectOption('evaluada');
    await p.getByLabel(/Criterio y observaciones/).fill('Cubierta apta; conexión en media tensión.');
    await p.getByRole('button', { name: 'Guardar evaluación' }).click();
    await expect(p.getByText('Evaluación guardada.')).toBeVisible();
  });

  await test.step('invitación de un usuario del panel', async () => {
    await login(p, 'superadmin');
    await p.goto('/admin/usuarios/nuevo');
    await p.getByLabel('Nombre completo *').fill(`Nuevo SB ${U}`);
    await p.getByLabel('Correo *').fill(`nuevo-${U}@sb.test`);
    await p.getByRole('button', { name: 'Crear e invitar' }).click();
    const inv = await p.getByLabel('Enlace de activación').inputValue();
    const q = await (await browser.newContext()).newPage();
    await q.goto(inv);
    await q.getByLabel('Nueva contraseña').fill('Nuevo-Usuario-2026');
    await q.getByLabel('Repite la contraseña').fill('Nuevo-Usuario-2026');
    await q.getByRole('button', { name: 'Guardar y entrar' }).click();
    await q.waitForURL('**/admin');
    await q.context().close();
  });

  await test.step('tareas programadas', async () => {
    const r = await p.request.get('/api/cron?tareas=mensajes,recordatorios,depuracion', { headers: { Authorization: `Bearer ${SB.cronSecret}` } });
    expect((await r.json()).ok).toBe(true);
  });

  expect(errs, 'errores de consola').toEqual([]);
});
