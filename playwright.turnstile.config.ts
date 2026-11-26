import { defineConfig } from '@playwright/test';

/**
 * Turnstile de punta a punta con las claves de PRUEBA oficiales de Cloudflare (siempre aprueban; son públicas y
 * no protegen nada): el navegador carga el widget real desde challenges.cloudflare.com y el servidor valida el
 * token con siteverify. Necesita salida a ese host. Base propia: .data/e2e-turnstile-db.json.
 *
 *   npm run e2e:turnstile
 */
const PORT = 3300;
export const TS = { siteKey: '1x00000000000000000000AA', secret: '1x0000000000000000000000000000000AA', dummyToken: 'XXXX.DUMMY.TOKEN.XXXX' };

export default defineConfig({
  testDir: 'e2e-turnstile',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report-turnstile' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 900 }, trace: 'on-first-retry', screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `node -e "require('fs').copyFileSync('.data/dev-db.json', '.data/e2e-turnstile-db.json')" && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      DEV_DB_FILE: '.data/e2e-turnstile-db.json',
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: TS.siteKey,
      TURNSTILE_SECRET_KEY: TS.secret,
      APP_SECRET: 'e2e-turnstile-secret',
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: '--max-old-space-size=4096',
      // Detrás de un proxy (p. ej. una sesión en la nube), fetch de Node solo lo usa con esta variable.
      NODE_USE_ENV_PROXY: '1',
    },
  },
});
