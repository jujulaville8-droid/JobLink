import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  test: {
    // Keep PGlite and large synthetic query fixtures within shared CI resources.
    // True concurrent transaction behavior is tested separately against PostgreSQL.
    maxWorkers: 1,
    environment: 'happy-dom', include: ['tests/**/*.spec.tsx'],
    setupFiles: ['./tests/setup/motion.ts'],
    // Match Next's server import condition without adding a dependency.
    alias: { 'server-only': fileURLToPath(new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url)) },
  },
});
