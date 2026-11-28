// Starts the JobLink preview gallery (http://localhost:3000/preview/verified)
// with made-up data: no Supabase, Stripe or email needed. Works on Windows,
// macOS and Linux. Run with: npm run preview
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const env = {
  ...process.env,
  VERIFIED_PREVIEW: 'true',
  VERIFICATION_ENABLED: 'true',
  EMPLOYER_BILLING_ENABLED: 'true',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'preview',
  SUPABASE_SERVICE_ROLE_KEY: 'preview',
}
console.log('\nOpen http://localhost:3000/preview/verified once it says Ready.\n')
const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-p', '3000'], { env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
