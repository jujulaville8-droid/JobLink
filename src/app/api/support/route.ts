import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp } from '@/lib/rate-limit'
import { escapeHtml } from '@/lib/testimonial-content'
import { supportSchema, SUPPORT_RETRY_WINDOW_MS } from '@/lib/support'

const BODY_LIMIT = 24000
const unavailable = "Support messages are temporarily unavailable. Your draft is still here. Please try again later."
const uncertain = "We couldn't confirm sending your message. Your draft is still here. Retry the same message to avoid duplicates."

function fail(error: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

/** Stop reading oversized chunked bodies, rather than buffering them in full. */
async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > BODY_LIMIT) { await reader.cancel(); return null }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { reader.releaseLock() }
}

export async function POST(request: NextRequest) {
  // Browser-only intake. No permissive CORS or third-party form posting.
  // Next may normalize its internal URL to localhost or an internal proxy host.
  // Host is the browser-facing authority; Vercel sets the proxy protocol header.
  const host = request.headers.get('host') ?? request.nextUrl.host
  const protocol = request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol.slice(0, -1)
  if (!['http', 'https'].includes(protocol) || request.headers.get('origin') !== `${protocol}://${host}`) return fail('Please send your message from the JobLinks website.', 403)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return fail('Please use the support form.', 415)
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) return fail('Your message is too long.', 413)

  try {
    const text = await readBody(request)
    if (text === null) return fail('Your message is too long.', 413)
    let json: unknown
    try { json = JSON.parse(text) } catch { return fail('Please check the form and try again.', 400) }
    const parsed = supportSchema.safeParse(json)
    if (!parsed.success || parsed.data.website) return fail('Please check your name, reply email, message (10–5,000 characters), and consent.', 400)
    const fields = parsed.data
    const age = Date.now() - fields.created_at
    if (age < -60000) return fail('Please check your device clock and try again.', 400)
    if (age > SUPPORT_RETRY_WINDOW_MS) return fail(`This attempt has expired. Keep your draft and ask support to check reference ${fields.id} before sending it again.`, 409)

    // The confirmed inbox is explicit server-only configuration. No fallback to
    // the old hello@ address, owner forwarding inbox, or any submitted recipient.
    const recipient = process.env.SUPPORT_RECIPIENT_EMAIL?.trim().toLowerCase()
    const apiKey = process.env.RESEND_API_KEY
    if (recipient !== 'support@joblinkantigua.com' || !apiKey) return fail(unavailable, 503)

    const db = createAdminClient()
    // Reuse the existing shared Postgres limiter, but fail closed for public mail.
    // Vercel overwrites these IP forwarding headers at its edge.
    for (const [kind, value, limit] of [['ip', clientIp(request), 5], ['email', fields.email, 3]] as const) {
      const hash = createHash('sha256').update(value).digest('hex')
      const { data, error } = await db.rpc('consume_rate_limit', { p_bucket: `website-support:${kind}:${hash}`, p_limit: limit, p_window_seconds: 3600 })
      const result = Array.isArray(data) ? data[0] : data
      if (error || typeof result?.allowed !== 'boolean') return fail(unavailable, 503)
      if (!result.allowed) {
        const seconds = Number(result.retry_after_seconds)
        const retryAfter = Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 3600
        return fail('Too many support requests. Your draft is still here. Please try again later.', 429, { 'Retry-After': String(retryAfter) })
      }
    }

    const { data, error } = await new Resend(apiKey).emails.send({
      from: 'JobLinks <notifications@joblinkantigua.com>',
      to: recipient,
      replyTo: fields.email,
      subject: 'Website support request — JobLinks',
      text: `Website support request\nReference: ${fields.id}\nName: ${fields.name}\nReply email: ${fields.email}\n\n${fields.message}\n\nThe sender agreed to share these details with JobLinks support and be contacted about this request.`,
      html: `<h1>Website support request</h1><p>Reference: ${fields.id}</p><p>Name: ${escapeHtml(fields.name)}</p><p>Reply email: ${escapeHtml(fields.email)}</p><p style="white-space:pre-wrap">${escapeHtml(fields.message)}</p><p>The sender agreed to share these details with JobLinks support and be contacted about this request.</p>`,
    }, { idempotencyKey: `website-support/${fields.id}` })
    if (error || !data?.id) return fail(uncertain, 503)
    // Provider acceptance only; no claim that the inbox or support bot received it.
    return NextResponse.json({ success: true, reference: fields.id }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    // Never log user content, reply addresses, credentials, or provider errors.
    return fail(uncertain, 503)
  }
}
