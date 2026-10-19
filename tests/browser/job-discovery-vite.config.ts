import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
const stubs = fileURLToPath(new URL('./job-discovery-stubs.tsx', import.meta.url));
export default defineConfig({
  envDir: fileURLToPath(new URL('./job-discovery-no-env', import.meta.url)),
  resolve: { alias: {
    '@/lib/supabase/client': stubs, '@/lib/supabase/server': stubs,
    '@/components/AuthProvider': stubs, 'next/navigation': stubs, 'next/link': stubs,
    '@': fileURLToPath(new URL('../../src', import.meta.url)),
  } },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { entries: ['tests/browser/job-discovery.html'] },
  plugins: [{ name: 'job-discovery-fixture-routes', configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (/^\/(jobs(?:\/[^/]+)?|login|signup)$/.test(req.url?.split('?')[0] ?? '')) req.url = '/tests/browser/job-discovery.html';
      next();
    });
  } }],
  server: { host: '127.0.0.1', port: 4198, strictPort: true },
});
