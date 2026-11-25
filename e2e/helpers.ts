import { readFileSync } from 'node:fs';
import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { E2E } from '../playwright.config';

/**
 * `test` con control automático de errores: cualquier error de JavaScript en la página o error de consola hace
 * fallar la prueba (salvo recursos que no cargan, p. ej. imágenes externas).
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  // Cada proyecto con su propia IP (TEST-NET, RFC 5737) para que los límites de solicitudes por IP no se mezclen.
  // Solo en las peticiones al servidor de prueba: a terceros (p. ej. Google Fonts) la cabecera rompería CORS.
  context: async ({ context }, use, info) => {
    const ip = info.project.name === 'movil' ? '203.0.113.20' : '203.0.113.10';
    await context.route(`http://localhost:${E2E.port}/**`, (r) => r.continue({ headers: { ...r.request().headers(), 'x-forwarded-for': ip } }));
    await use(context);
  },
  consoleErrors: [async ({ page }, use) => {
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await use(errs);
    expect(errs, 'errores de consola o de página').toEqual([]);
  }, { auto: true }],
});
export { expect };

export const isMobile = (t: TestInfo) => t.project.name === 'movil';
/** Sufijo por proyecto: escritorio y móvil comparten la base, así que los datos únicos no deben chocar. */
export const tag = (t: TestInfo) => (isMobile(t) ? 'mob' : 'desk');

export type Role = 'superadmin' | 'gerencia' | 'marketing' | 'ventas' | 'ingenieria' | 'compras';
export async function staffLogin(page: Page, role: Role) {
  await page.context().clearCookies();
  await page.goto('/admin/login');
  await page.getByLabel('Rol de prueba (solo desarrollo)').selectOption(role);
  await page.getByLabel('Contraseña').fill(E2E.adminPassword);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/admin');
}
export const navLink = (page: Page, name: string) => page.locator('aside nav').getByRole('link', { name, exact: true });

/** Sin desborde horizontal (regla del proyecto: 390 px). */
export async function expectNoOverflow(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(extra, 'desborde horizontal en px').toBeLessThanOrEqual(0);
}

/** Lee la base de prueba (la escribe el servidor de desarrollo). */
export const db = () => JSON.parse(readFileSync('.data/e2e-db.json', 'utf8'));
export const cronHeaders = { Authorization: `Bearer ${E2E.cronSecret}` };
