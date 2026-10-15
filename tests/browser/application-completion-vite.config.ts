import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const stubs = fileURLToPath(new URL('./application-completion-stubs.tsx', import.meta.url));

export default defineConfig({
  envDir: fileURLToPath(new URL('./application-completion-no-env', import.meta.url)),
  resolve: { alias: {
    '@/lib/supabase/client': stubs,
    '@/components/AuthProvider': stubs,
    'next/navigation': stubs,
    'next/link': stubs,
    'next/image': fileURLToPath(new URL('./application-completion-image.tsx', import.meta.url)),
    '@': fileURLToPath(new URL('../../src', import.meta.url)),
  } },
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'application-completion-fixture-routes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = req.url?.split('?')[0] ?? '';
        if (/^\/(?:profile(?:\/cv)?|jobs(?:\/[^/]+(?:\/apply)?)?|dashboard)?$/.test(pathname)) {
          req.url = '/tests/browser/application-completion.html';
        }
        next();
      });
    },
  }],
  server: { host: '127.0.0.1', port: 4196, strictPort: true },
});
