import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const stubs = fileURLToPath(new URL('./admin-company-settings-stubs.tsx', import.meta.url));
export default defineConfig({
  resolve: { alias: {
    '@/lib/supabase/client': stubs,
    'next/navigation': stubs,
    'next/link': stubs,
    '@': fileURLToPath(new URL('../../src', import.meta.url)),
  } },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 4194, strictPort: true },
});
