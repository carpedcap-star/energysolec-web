import { defineConfig } from 'vitest/config';
import path from 'node:path';
// Evaluaciones con servicios reales (gastan dinero): fuera de `npm test`. Ver evals/planillas/lectura.eval.ts.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), 'server-only': path.resolve(import.meta.dirname, 'test/server-only-stub.ts') } },
  test: { include: ['evals/**/*.eval.ts'], testTimeout: 1_800_000 },
});
