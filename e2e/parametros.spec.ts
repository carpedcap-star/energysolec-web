import { expect, expectNoOverflow, isMobile, staffLogin, test } from './helpers';

test('parámetros: precios por sistema, implantación y baterías; el pliego solo lo marca Gerencia', async ({ page }, info) => {
  await staffLogin(page, 'ingenieria');
  await page.goto('/admin/parametros');
  for (const t of ['Sistema conectado a la red (On Grid)', 'Sistema híbrido (sin baterías)', 'Sistema aislado Off Grid (sin baterías)', 'Baterías por capacidad instalada'])
    await expect(page.getByText(t, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Adicional: terreno con estructura hincada (USD/kWp)')).toBeVisible();
  await expect(page.getByLabel('Autonomía Off Grid (h)')).toHaveValue('48');
  await expect(page.getByRole('checkbox', { name: /Pliego tarifario oficial revisado/ })).toBeDisabled();
  await expectNoOverflow(page);
  test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');

  await page.getByRole('button', { name: 'Agregar tramo (Baterías por capacidad instalada)' }).click();
  await page.getByLabel('Baterías por capacidad instalada: Tramo 1: hasta kWh').fill('10');
  await page.getByLabel('Baterías por capacidad instalada: Tramo 1: USD/kWh').fill('0');
  await page.getByRole('button', { name: 'Guardar como nueva versión' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toContainText('Baterías por capacidad instalada, tramo 1: el precio debe ser mayor a 0.');
  await expect(page.getByLabel('Baterías por capacidad instalada: Tramo 1: hasta kWh')).toHaveValue('10');
  await page.getByLabel('Baterías por capacidad instalada: Tramo 1: USD/kWh').fill('480');
  await page.getByRole('button', { name: 'Guardar como nueva versión' }).click();
  await expect(page.getByRole('status')).toContainText('Quedó pendiente de validación por Gerencia');
  await expect(page.getByLabel('Baterías por capacidad instalada: Tramo 2: USD/kWh')).toHaveValue('480');
});
