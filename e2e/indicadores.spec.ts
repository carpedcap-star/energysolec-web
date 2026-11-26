import { expect, staffLogin, test, isMobile } from './helpers';

test('indicadores: errores en la fila sin perder lo escrito, y lo verificado se publica en la portada', async ({ page }, info) => {
  test.skip(isMobile(info), 'escenario de datos de una sola vez: se prueba en escritorio');
  await staffLogin(page, 'gerencia');
  await page.goto('/admin/indicadores');
  const row = page.locator('form[aria-label^="Indicador"]').first();
  await row.getByLabel('Fuente del dato').fill('ok');
  await row.getByRole('button', { name: 'Guardar' }).click();
  await expect(row.getByRole('alert')).toHaveText('Indica la fuente del dato (al menos 5 caracteres).');
  await expect(row.getByLabel('Fuente del dato')).toHaveValue('ok');
  await row.getByLabel('Valor').fill('7,5');
  await row.getByLabel('Fuente del dato').fill('PENDIENTE: dato real');
  await row.getByLabel('Verificado').check();
  await row.getByRole('button', { name: 'Guardar' }).click();
  await expect(row.getByRole('alert')).toContainText('reemplaza «pendiente»');
  await row.getByLabel('Fuente del dato').fill('Registro interno de proyectos E2E');
  await row.getByRole('button', { name: 'Guardar' }).click();
  await expect(row.getByRole('status')).toHaveText('Guardado y publicado en la portada.');
  const label = await row.getByLabel('Indicador').inputValue();
  await page.goto('/');
  await expect(page.getByText(label).first()).toBeVisible();
});
