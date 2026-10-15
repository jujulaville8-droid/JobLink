import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  envDir: fileURLToPath(new URL('./support-no-env', import.meta.url)),
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1', port: 4357, strictPort: true },
})
