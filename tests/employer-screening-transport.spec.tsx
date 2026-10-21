import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { captureEmail } from '../src/lib/employer-screening'
import { createResendTransport } from '../src/lib/employer-screening/transport'
const bytes = new TextEncoder().encode('%PDF-synthetic-only')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const email = (withCv = true) => captureEmail({
  from: 'JobLink <notifications@joblinkantigua.com>', to: 'employer@example.test', replyTo: null,
  subject: 'Synthetic application', html: '<p>Application</p>',
  resumeVersionId: withCv ? 'v1' : null, resumeSha256: withCv ? sha256 : null,
  attachments: withCv ? [{ storagePath: 'owner/app/v1.pdf', filename: 'resume.pdf', sha256, bytes: bytes.length }] : [],
})
const key = 'application/synthetic-app/employer'
const response = (status: number, body: unknown, headers?: Record<string,string>) => new Response(JSON.stringify(body), { status, headers })
describe('outcome-aware frozen email transport', () => {
  it('performs no reads or request when disabled or key absent', async () => {
    const readAttachment = vi.fn(), fetch = vi.fn()
    for (const config of [{ enabled: false, apiKey: 'synthetic' }, { enabled: true, apiKey: undefined }]) {
      expect(await createResendTransport({ ...config, readAttachment, fetch })(email(), key)).toEqual({ kind: 'not_sent' })
    }
    expect(readAttachment).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
  })
  it('uses exact content and idempotency key, omits nullable Reply-To and never gives provider URLs', async () => {
    const fetch = vi.fn(async () => response(200, { id: 'accepted' }))
    const send = createResendTransport({ enabled: true, apiKey: 'synthetic-only', readAttachment: async () => bytes, fetch })
    expect(await send(email(), key)).toEqual({ kind: 'accepted', providerId: 'accepted' })
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect(options.redirect).toBe('error')
    expect(options.headers).toMatchObject({ 'Idempotency-Key': key })
    const body = JSON.parse(options.body as string)
    expect(body.reply_to).toBeUndefined()
    expect(body.attachments).toEqual([{ filename: 'resume.pdf', content: Buffer.from(bytes).toString('base64'), content_type: 'application/pdf' }])
    expect(options.body).not.toContain('storagePath')
  })
  it.each([
    [500, { name: 'application_error' }, 'uncertain'], [503, {}, 'uncertain'],
    [200, {}, 'uncertain'], [409, { name: 'concurrent_idempotent_requests' }, 'concurrent_conflict'],
    [409, { name: 'invalid_idempotent_request' }, 'payload_conflict'],
    [422, { name: 'invalid_attachment' }, 'rejected'], [429, { name: 'daily_quota_exceeded' }, 'rejected'],
    [429, { name: 'rate_limit_exceeded' }, 'rate_limited'], [400, {}, 'uncertain'],
  ])('classifies status %s without retrying', async (status, body, kind) => {
    const fetch = vi.fn(async () => response(status as number, body))
    const result = await createResendTransport({ enabled: true, apiKey: 'synthetic', readAttachment: async () => bytes, fetch })(email(false), key)
    expect(result.kind).toBe(kind); expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('keeps network exceptions uncertain and storage failures known unsent', async () => {
    const fetch = vi.fn(async () => { throw new Error('network') })
    const common = { enabled: true, apiKey: 'synthetic', fetch }
    expect(await createResendTransport({ ...common, readAttachment: async () => bytes })(email(), key)).toEqual({ kind: 'uncertain' })
    expect(await createResendTransport({ ...common, readAttachment: async () => { throw new Error('storage') } })(email(), key)).toEqual({ kind: 'not_sent' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('never dispatches changed bytes, invalid sender or cancelled preparation', async () => {
    const fetch = vi.fn(), controller = new AbortController()
    const send = createResendTransport({ enabled: true, apiKey: 'synthetic', readAttachment: async () => new Uint8Array(bytes.length), fetch })
    expect(await send(email(), key)).toEqual({ kind: 'payload_conflict' })
    controller.abort()
    expect(await send(email(), key, controller.signal)).toEqual({ kind: 'not_sent' })
    expect(fetch).not.toHaveBeenCalled()
  })
  it('an excessively large or malformed provider body is uncertain, never accepted or retried', async () => {
    const fetch = vi.fn(async () => new Response(' '.repeat(20000), { status: 200 }))
    expect(await createResendTransport({ enabled: true, apiKey: 'synthetic', readAttachment: async () => bytes, fetch })(email(), key)).toEqual({ kind: 'uncertain' })
  })
})
