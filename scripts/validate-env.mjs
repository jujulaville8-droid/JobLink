const required = ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID', 'STRIPE_SMART_RESUME_PRICE_ID', 'RESEND_API_KEY', 'CRON_SECRET', 'ANTHROPIC_API_KEY']
const errors = required.filter(k => !process.env[k]).map(k => `${k} is required`)
for (const key of ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL']) {
  if (process.env[key]) {
    try { if (new URL(process.env[key]).protocol !== 'https:') errors.push(`${key} must use HTTPS`) }
    catch { errors.push(`${key} must be a valid URL`) }
  }
}
if (process.env.NEXT_PUBLIC_SITE_URL !== process.env.NEXT_PUBLIC_APP_URL) errors.push('Public application URLs must use the same canonical origin')
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
else console.log('Required deployment environment is configured (values not displayed).')
