import { expect, expectNoOverflow, navLink, staffLogin, test, type Role } from './helpers';

/** Secciones del panel y roles que las ven: espejo de PERMS en src/lib/auth.ts (y de la RLS). */
const SECTIONS: [string, string, Role[]][] = [
  ['/admin/leads', 'CRM · Leads', ['superadmin', 'gerencia', 'marketing', 'ventas', 'ingenieria']],
  ['/admin/pedidos', 'Pedidos', ['superadmin', 'gerencia', 'ventas', 'compras']],
  ['/admin/cuentas', 'Cuentas comerciales', ['superadmin', 'gerencia', 'ventas']],
  ['/admin/industrial', 'Cotizaciones industriales', ['superadmin', 'gerencia', 'ventas', 'ingenieria']],
  ['/admin/productos', 'Productos', ['superadmin', 'compras']],
  ['/admin/proyectos', 'Proyectos', ['superadmin', 'marketing', 'ingenieria']],
  ['/admin/contenido', 'Contenido del sitio', ['superadmin', 'marketing']],
  ['/admin/marcas', 'Marcas', ['superadmin', 'marketing', 'compras']],
  ['/admin/servicios', 'Servicios', ['superadmin', 'marketing']],
  ['/admin/blog', 'Blog', ['superadmin', 'marketing']],
  ['/admin/usuarios', 'Usuarios', ['superadmin', 'gerencia']],
  ['/admin/identidad', 'Identidad gráfica', ['superadmin', 'marketing']],
  ['/admin/configuracion', 'Contacto e integraciones', ['superadmin', 'marketing']],
  ['/admin/parametros', 'Parámetros de cálculo', ['superadmin', 'gerencia', 'ingenieria']],
  ['/admin/tarifas', 'Tarifas eléctricas', ['superadmin', 'gerencia', 'ingenieria']],
  ['/admin/recurso-solar', 'Recurso solar', ['superadmin', 'gerencia', 'ingenieria']],
  ['/admin/indicadores', 'Indicadores de inicio', ['superadmin', 'gerencia']],
  ['/admin/mensajes', 'Mensajes y tareas', ['superadmin', 'gerencia']],
];
const ROLES: Role[] = ['superadmin', 'gerencia', 'marketing', 'ventas', 'ingenieria', 'compras'];

test.describe('panel', () => {
  test('sin sesión, el panel pide ingresar', async ({ page }) => {
    await page.goto('/admin/leads');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  for (const role of ROLES) {
    test(`${role}: ve solo sus secciones y no entra a las demás`, async ({ page }, info) => {
      await staffLogin(page, role);
      for (const [, label, roles] of SECTIONS)
        await expect(navLink(page, label), `${role} → ${label}`).toHaveCount(roles.includes(role) ? 1 : 0);
      // El acceso directo a una sección ajena redirige (la comprobación en escritorio basta: es lógica de servidor).
      if (info.project.name !== 'escritorio') return;
      for (const [href, label, roles] of SECTIONS.filter(([, , r]) => !r.includes(role))) {
        await page.goto(href);
        await expect(page, `${role} → ${label}`).not.toHaveURL(new RegExp(`${href}$`));
      }
    });
  }

  test('todas las secciones cargan sin desborde (superadmin)', async ({ page }) => {
    await staffLogin(page, 'superadmin');
    for (const [href] of SECTIONS) {
      await page.goto(href, { waitUntil: 'networkidle' });
      await expect(page.locator('h1').first(), href).toBeVisible();
      await expectNoOverflow(page);
    }
  });
});
