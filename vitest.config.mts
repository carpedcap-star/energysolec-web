import { defineConfig } from 'vitest/config';
import path from 'node:path';
// JSX automático para los .tsx: tsconfig usa "jsx: preserve" (lo exige Next) y Vite 8 transforma con oxc.
export default defineConfig({ oxc: { jsx: { runtime: 'automatic' } }, resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), 'server-only': path.resolve(import.meta.dirname, 'test/server-only-stub.ts') } }, test: { include: ['src/**/*.test.ts'] } });
