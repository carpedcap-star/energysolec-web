import { defineConfig } from '@playwright/test';

/**
 * Pruebas de extremo a extremo. Levantan `next dev` con una base propia (.data/e2e-db.json, sembrada por
 * e2e/seed.mjs a partir de .data/dev-db.json): nunca tocan el archivo versionado ni servicios con credenciales
 * (sin Supabase, Resend ni Anthropic). Se ejecutan en serie porque comparten esa base.
 *
 *   npm run e2e              # escritorio (1440 px) y móvil (390 px)
 *   npm run e2e -- --project=escritorio
 */
const PORT = 3100;
export const E2E = { adminPassword: 'e2e-dev-pass', cronSecret: 'e2e-cron-secret-0123456789', port: PORT };

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // En CI, «github» publica cada falla como anotación visible en la ejecución.
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Si el entorno trae su propio Chromium (p. ej. una sesión en la nube), se usa ese.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'escritorio', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'movil', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `node e2e/seed.mjs && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      DEV_DB_FILE: '.data/e2e-db.json',
      DEV_ADMIN_PASSWORD: E2E.adminPassword,
      CRON_SECRET: E2E.cronSecret,
      SALES_NOTIFY_EMAIL: 'ventas@energysolec.test',
      APP_SECRET: 'e2e-app-secret',
      NEXT_TELEMETRY_DISABLED: '1',
      // La suite compila más de 60 rutas en `next dev`; con el límite por defecto el servidor se cayó una vez al final.
      NODE_OPTIONS: '--max-old-space-size=4096',
    },
  },
});
