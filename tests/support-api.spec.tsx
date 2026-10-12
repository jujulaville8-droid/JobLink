// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const external = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: external.rpc }) }))
vi.mock('resend', () => ({ Resend: class { emails = { send: external.send } } }))
import { POST } from '../src/app/api/support/route'

const id = '11111111-1111-4111-8111-111111111111'
const draft = () => ({ id, created_at: Date.now(), name: 'Alex Example', email: 'alex@example.test', message: 'I need help signing in to my account.', consent: true, website: '' })
function send(body: unknown, headers: Record<string, string> = {}) {
  return POST(new NextRequest('https://joblinkantigua.com/api/support', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://joblinkantigua.com', 'x-forwarded-for': '192.0.2.1', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SUPPORT_RECIPIENT_EMAIL', 'support@joblinkantigua.com')
  vi.stubEnv('RESEND_API_KEY', 'test-only-never-send')
  external.rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 2, retry_after_seconds: 3600 }], error: null })
  external.send.mockResolvedValue({ data: { id: 'provider-accepted' }, error: null })
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

it('routes only to the configured support inbox with safe content and a stable retry key', async () => {
  const payload = { ...draft(), name: ' <b>Alex & Co</b> ', email: ' Alex@Example.Test ', message: 'Please help <script>alert("x")</script> & thank you.', to: 'attacker@example.test', cc: 'other@example.test' }
  const response = await send(payload)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, reference: id })
  const [email, options] = external.send.mock.calls[0]
  expect(email).toMatchObject({ from: 'JobLinks <notifications@joblinkantigua.com>', to: 'support@joblinkantigua.com', replyTo: 'alex@example.test', subject: 'Website support request — JobLinks' })
  expect(email.html).toContain('&lt;b&gt;Alex &amp; Co&lt;/b&gt;')
  expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; thank you.')
  expect(email.html).not.toContain('<script>')
  expect(email.text).toContain('Please help <script>')
  expect(email).not.toHaveProperty('cc')
  expect(email).not.toHaveProperty('attachments')
  expect(options).toEqual({ idempotencyKey: `website-support/${id}` })
  await send(payload)
  expect(external.send.mock.calls[1]).toEqual(external.send.mock.calls[0])
  expect(external.rpc.mock.calls.map(call => call[1].p_bucket).join(' ')).not.toMatch(/alex@|192\.0\.2/)
})

it.each([
  { name: ' ' }, { name: 'x'.repeat(101) }, { email: 'invalid' }, { email: 'alex@example.test\r\nBcc: other@example.test' },
  { email: `${'x'.repeat(250)}@example.test` }, { message: 'short' }, { message: 'x'.repeat(5001) }, { message: 'Help me\u0000please' },
  { consent: false }, { id: 'invalid' }, { website: 'spam' }, { name: 123 },
])('rejects invalid input before sending: %j', async invalid => {
  expect((await send({ ...draft(), ...invalid })).status).toBe(400)
  expect(external.send).not.toHaveBeenCalled()
})

it('rejects stale and future retry IDs rather than resending outside the deduplication window', async () => {
  expect((await send({ ...draft(), created_at: Date.now() - 24 * 3600000 })).status).toBe(409)
  expect((await send({ ...draft(), created_at: Date.now() + 120000 })).status).toBe(400)
  expect(external.send).not.toHaveBeenCalled()
})

it.each(['', 'invalid', 'hello@joblinkantigua.com'])('fails closed for unconfigured or unconfirmed routing: %s', async inbox => {
  vi.stubEnv('SUPPORT_RECIPIENT_EMAIL', inbox)
  expect((await send(draft())).status).toBe(503)
  expect(external.send).not.toHaveBeenCalled()
})
it('fails closed without the email provider key', async () => {
  vi.stubEnv('RESEND_API_KEY', '')
  expect((await send(draft())).status).toBe(503)
  expect(external.send).not.toHaveBeenCalled()
})

it('fails closed for missing, malformed, and thrown limiter results', async () => {
  for (const result of [{ data: null, error: { message: 'offline' } }, { data: [] }, { data: [{ allowed: 'yes' }] }]) {
    external.rpc.mockResolvedValue(result)
    expect((await send(draft())).status).toBe(503)
  }
  external.rpc.mockRejectedValue(new Error('private database error'))
  expect((await send(draft())).status).toBe(503)
  expect(external.send).not.toHaveBeenCalled()
})
it.each([0, 1])('enforces both hourly budgets and returns Retry-After (bucket %s)', async denied => {
  external.rpc.mockImplementation(async (_name, params) => ({ data: [{ allowed: !params.p_bucket.includes(denied === 0 ? ':ip:' : ':email:'), retry_after_seconds: 120 }] }))
  const response = await send(draft())
  expect(response.status).toBe(429)
  expect(response.headers.get('Retry-After')).toBe('120')
  expect(external.send).not.toHaveBeenCalled()
})

it('never treats rejection, missing provider receipt, or network uncertainty as success or logs personal data', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const result of [{ error: { message: 'secret alex@example.test' } }, { data: null, error: null }]) {
    external.send.mockResolvedValue(result)
    const response = await send(draft())
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('success', true)
  }
  external.send.mockRejectedValue(new Error('secret alex@example.test'))
  expect((await send(draft())).status).toBe(503)
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/secret|alex@/)
})

it('rejects cross-origin, missing origin, non-JSON, and broken JSON requests', async () => {
  expect((await send(draft(), { Origin: 'https://evil.example' })).status).toBe(403)
  expect((await send(draft(), { Origin: '' })).status).toBe(403)
  expect((await send(draft(), { 'Content-Type': 'text/plain' })).status).toBe(415)
  expect((await send('{broken')).status).toBe(400)
  expect(external.send).not.toHaveBeenCalled()
})
it.each([
  { host: '127.0.0.1:4358', protocol: 'http', origin: 'http://127.0.0.1:4358' },
  { host: 'joblinkantigua.com', protocol: 'https', origin: 'https://joblinkantigua.com' },
])('uses the browser host and proxy protocol when Next normalizes the internal request URL: %j', async ({ host, protocol, origin }) => {
  const response = await POST(new NextRequest('http://localhost:4358/api/support', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Host: host, 'x-forwarded-proto': protocol, Origin: origin }, body: JSON.stringify(draft()),
  }))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ success: true, reference: id })
})
it('bounds the actual body even without Content-Length', async () => {
  expect((await send({ ...draft(), message: 'x'.repeat(25000) })).status).toBe(413)
  expect(external.send).not.toHaveBeenCalled()
})
