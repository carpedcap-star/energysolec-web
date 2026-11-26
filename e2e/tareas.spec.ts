import { existsSync } from 'node:fs';
import { cronHeaders, db, expect, expectNoOverflow, isMobile, navLink, staffLogin, test } from './helpers';

type Msg = { id: string; template: string; status: string; to_address: string; payload: { html?: string } };

test.describe('tareas programadas y seguimiento', () => {
  test('ruta /api/cron protegida y tareas: recordatorios, depuración, cola', async ({ request }, info) => {
    test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');
    expect((await request.get('/api/cron')).status()).toBe(401);
    expect((await request.get('/api/cron', { headers: { Authorization: 'Bearer otra-clave-cualquiera-xx' } })).status()).toBe(401);
    expect((await request.get('/api/cron?tareas=nada', { headers: cronHeaders })).status()).toBe(400);

    const r = await request.get('/api/cron?tareas=mensajes,recordatorios,depuracion', { headers: cronHeaders });
    const j = await r.json();
    expect(r.ok() && j.ok).toBe(true);
    expect(j.summary.mensajes.omitido).toBe('sin proveedor de correo');
    // Un resumen para la asesora y otro (leads sin asesor) para el correo comercial.
    expect(j.summary.recordatorios).toMatchObject({ resumenes: 2, sin_destinatario: 0 });
    expect(j.summary.recordatorios.actividades).toBeGreaterThanOrEqual(1);
    expect(j.summary.depuracion.planillas_borradas).toBe(1);
    expect(JSON.stringify(j)).not.toContain('@');

    const d = db();
    expect(d.bills.map((b: { id: string }) => b.id)).not.toContain('33333333-3333-4333-8333-333333333333');
    expect(existsSync('.data/private/bills/33333333-3333-4333-8333-333333333333.pdf')).toBe(false);
    const rem = (d.messages as Msg[]).filter((m) => m.template === 'recordatorio_seguimiento');
    expect(rem).toHaveLength(2);
    expect(rem.every((m) => m.status === 'pendiente' && m.payload.html)).toBe(true);
    const adv = rem.find((m) => m.to_address === 'asesora@energysolec.test')!;
    expect(adv.payload.html).toContain('Lead Vencido');
    expect(adv.payload.html).toContain('vencida');
    expect(adv.payload.html).not.toContain('Lead Futuro');
    // Leads sin asesor: al correo de avisos configurado en el panel (si no hay, SALES_NOTIFY_EMAIL del servidor).
    const salesTo = d.settings?.notifications?.salesEmail ?? 'ventas@energysolec.test';
    expect(rem.find((m) => m.to_address === salesTo)?.payload.html).toContain('Lead Sin Contactar');

    const again = await (await request.get('/api/cron?tareas=recordatorios', { headers: cronHeaders })).json();
    expect(again.summary.recordatorios.resumenes).toBe(0);
  });

  test('panel de mensajes: permisos, ejecutar ahora y reintento manual', async ({ page }, info) => {
    for (const role of ['marketing', 'ventas'] as const) {
      await staffLogin(page, role);
      await expect(navLink(page, 'Mensajes y tareas')).toHaveCount(0);
    }
    await page.goto('/admin/mensajes');
    await expect(page).not.toHaveURL(/\/admin\/mensajes$/);
    await staffLogin(page, 'gerencia');
    await page.goto('/admin/mensajes');
    await expect(page.getByText(/RESEND_API_KEY\): falta/)).toBeVisible();
    await expectNoOverflow(page);
    if (isMobile(info)) return;
    await page.getByRole('button', { name: 'Ejecutar tareas ahora' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Listo.' })).toBeVisible({ timeout: 60_000 });
    await page.goto('/admin/mensajes?estado=error');
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
    expect((db().messages as Msg[]).find((m) => m.id.startsWith('e0000000'))!.status).toBe('pendiente');
  });

  test('ficha del lead: asignación con aviso, hora de Ecuador y actividad realizada', async ({ page }, info) => {
    test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');
    await staffLogin(page, 'gerencia');
    await page.goto('/admin/leads/c0000000-0000-4000-8000-000000000002');
    await page.getByLabel('Asesor').selectOption({ label: 'Carla Asesora' });
    await page.getByLabel('Próxima actividad (hora de Ecuador)').fill('2026-12-01T09:30');
    await page.getByLabel('Qué hay que hacer').fill('Visita técnica');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Asignado a Carla Asesora')).toBeVisible();
    await expect(page.getByText(/1 dic 2026, 9:30.*Visita técnica/)).toBeVisible();
    const lead = () => db().leads.find((l: { id: string }) => l.id.endsWith('0002'));
    expect(lead().next_activity_at).toBe('2026-12-01T14:30:00.000Z');
    expect((db().messages as Msg[]).some((m) => m.template === 'lead_asignado' && m.to_address === 'asesora@energysolec.test')).toBe(true);
    await expectNoOverflow(page);
    await page.getByLabel('Actividad realizada (quitar recordatorio)').check();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect.poll(() => lead().next_activity_at ?? null).toBeNull();
  });

  test('los enlaces de acceso nunca quedan guardados en la cola', async ({ page }, info) => {
    test.skip(isMobile(info), 'se prueba en escritorio');
    await staffLogin(page, 'superadmin');
    await page.goto('/admin/usuarios/nuevo');
    await page.getByLabel('Nombre completo *').fill('Usuario Prueba Cola');
    await page.getByLabel('Correo *').fill('cola-e2e@energysolec.test');
    await page.getByRole('button', { name: 'Crear e invitar' }).click();
    await expect(page.getByLabel('Enlace de activación')).toBeVisible();
    const inv = (db().messages as Msg[]).find((m) => m.template === 'invitacion_panel');
    expect(inv?.status).toBe('error');
    expect(inv?.payload.html).toBeUndefined();
    expect(JSON.stringify(inv)).not.toContain('token_hash');
  });
});
