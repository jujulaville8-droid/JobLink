import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const stubs = fileURLToPath(new URL('./admin-applications-stubs.tsx', import.meta.url));
const badge = fileURLToPath(new URL('./admin-applications-badge.tsx', import.meta.url));
const fontFiles: Record<string, string> = {
  heading: '0c8f209abc35ee02-s.p.0c0g8ifvh7k7-.woff2',
  body: 'fba5a26ea33df6a3-s.p.18rizl4rsrl42.woff2',
};
export default defineConfig({
  envDir: fileURLToPath(new URL('./admin-applications-no-env', import.meta.url)),
  resolve: { alias: {
    '@/lib/supabase/client': stubs, '@/components/AuthProvider': stubs,
    '@/components/messaging/UnreadBadge': badge, '@/components/PendingApprovalsBadge': badge,
    'next/navigation': stubs, 'next/link': stubs,
    'next/image': fileURLToPath(new URL('./admin-applications-image.tsx', import.meta.url)),
    '@': fileURLToPath(new URL('../../src', import.meta.url)),
  } },
  esbuild: { jsx: 'automatic' },
  optimizeDeps: { entries: ['tests/browser/admin-applications.html'] },
  plugins: [{ name: 'admin-applications-synthetic-browser-fixture', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = req.url?.split('?')[0] || '';
      const font = pathname.match(/^\/__admin_fixture_fonts\/(heading|body)\.woff2$/);
      if (font) {
        res.setHeader('Content-Type', 'font/woff2');
        res.end(readFileSync(fileURLToPath(new URL(`../../.next/static/media/${fontFiles[font[1]]}`, import.meta.url))));
        return;
      }
      if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
        res.statusCode = 405; res.end('Only the synthetic client GET adapter may handle API calls.'); return;
      }
      if (pathname.startsWith('/admin/applications')) req.url = '/tests/browser/admin-applications.html';
      next();
    });
  } }],
  server: { host: '127.0.0.1', port: 4212, strictPort: true },
});
