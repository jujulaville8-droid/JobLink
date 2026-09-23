import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { Resend } from 'resend'

// Load .env.local manually (same pattern as scripts/discover-businesses.ts)
const envPath = resolve(process.cwd(), '.env.local')
if (!existsSync(envPath)) {
  console.error('[send-feedback] .env.local not found — aborting')
  process.exit(1)
}

for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '')
}

async function main() {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('RESEND_API_KEY not set in .env.local')
    process.exit(1)
  }

  const resend = new Resend(apiKey)

  const { data, error } = await resend.emails.send({
    from: 'JobLinks <notifications@joblinkantigua.com>',
    to: 'contact@casaroots-antigua.com',
    replyTo: 'jujulaville8@gmail.com',
    subject: 'Quick feedback on JobLinks?',
    text: `Hi there,

Julian from JobLinks here. I'd love your honest opinion on how the site has been working for you.

In particular:
- What could be improved?
- Any bugs you've run into?

Even one short reply would help me prioritize what to build next. Thanks.

Julian
JobLinks Antigua`,
  })

  if (error) {
    console.error('Failed to send:', error)
    process.exit(1)
  }

  console.log('Sent. Resend ID:', data?.id)
}

main()
