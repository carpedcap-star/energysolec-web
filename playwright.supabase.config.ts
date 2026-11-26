import { defineConfig } from '@playwright/test';

/**
 * Recorrido de extremo a extremo contra un Supabase REAL local (`supabase start`): Auth, Storage, RLS y disparadores.
 * Requiere NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY de la pila local
 * (ver docs/SUPABASE.md). e2e-supabase/setup.mjs se niega a correr contra otra URL.
 *
 *   npm run e2e:supabase
 */
const PORT = 3200;
export const SB = { cronSecret: 'sb-cron-secret-0123456789', port: PORT };

export default defineConfig({
  testDir: 'e2e-supabase',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: 'playwright-report-supabase' }]] : 'list',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 900 }, trace: 'on-first-retry', screenshot: 'only-on-failure' },
  webServer: {
    command: `node e2e-supabase/setup.mjs && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      CRON_SECRET: SB.cronSecret,
      SALES_NOTIFY_EMAIL: 'ventas@sb.test',
      APP_SECRET: 'sb-app-secret',
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: '--max-old-space-size=4096',
    },
  },
});
