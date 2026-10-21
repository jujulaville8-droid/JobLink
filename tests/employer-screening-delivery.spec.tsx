import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { captureEmail, readEmail, verifyAttachmentBytes, nextSendRetry, SEND_WINDOW_MS, type EmailContent, type SendOutcome } from '../src/lib/employer-screening'

const bytes = new TextEncoder().encode('%PDF-synthetic-only')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const content = (): EmailContent => ({
  from: 'applications@example.invalid', to: 'employer@example.invalid', replyTo: 'candidate@example.invalid',
  subject: 'Synthetic application', html: '<p>Synthetic application only.</p>',
  resumeVersionId: 'capture-v1', resumeSha256: sha256,
  attachments: [{ storagePath: 'private/application/capture-v1.pdf', filename: 'resume.pdf', sha256, bytes: bytes.byteLength }],
})

describe('offline immutable delivery envelope', () => {
  it('deep freezes a detached copy with deterministic digest and round-trip validation', () => {
    const input = content(), frozen = captureEmail(input)
    input.replyTo = 'changed@example.invalid'; input.attachments[0].storagePath = 'changed.pdf'
    expect(frozen.replyTo).toBe('candidate@example.invalid')
    expect(frozen.attachments[0].storagePath).toBe('private/application/capture-v1.pdf')
    expect(Object.isFrozen(frozen)).toBe(true)
    expect(Object.isFrozen(frozen.attachments)).toBe(true)
    expect(Object.isFrozen(frozen.attachments[0])).toBe(true)
    expect(readEmail(JSON.parse(JSON.stringify(frozen)))).toEqual(frozen)
    expect(captureEmail(content()).payloadSha256).toBe(frozen.payloadSha256)
  })
  it.each(['from', 'to', 'replyTo', 'subject', 'html', 'resumeVersionId'] as const)('detects persisted %s drift before sending', field => {
    const frozen = captureEmail(content())
    const value = ['from', 'to', 'replyTo'].includes(field) ? 'changed@example.invalid' : 'changed'
    expect(() => readEmail({ ...frozen, [field]: value })).toThrow('integrity')
  })
  it('detects descriptor drift and validates the actual fetched bytes independently', () => {
    const frozen = captureEmail(content())
    expect(() => readEmail({ ...frozen, attachments: [{ ...frozen.attachments[0], bytes: 1 }] })).toThrow('integrity')
    expect(() => verifyAttachmentBytes(frozen.attachments[0], bytes)).not.toThrow()
    expect(() => verifyAttachmentBytes(frozen.attachments[0], new Uint8Array(bytes.length))).toThrow('integrity')
    expect(() => verifyAttachmentBytes(frozen.attachments[0], bytes.slice(1))).toThrow('integrity')
  })
  it('represents missing CV explicitly without inventing résumé metadata', () => {
    const input = { ...content(), attachments: [], resumeVersionId: null, resumeSha256: null }
    const frozen = captureEmail(input)
    expect(readEmail(frozen)).toEqual(frozen)
    expect(frozen.attachments).toEqual([])
    expect(frozen.resumeVersionId).toBeNull()
    expect(frozen.resumeSha256).toBeNull()
    expect(frozen.payloadSha256).not.toBe(captureEmail(content()).payloadSha256)
    expect(() => captureEmail({ ...input, resumeVersionId: 'invented' })).toThrow('null résumé')
    expect(() => captureEmail({ ...content(), resumeVersionId: null })).toThrow('digest mismatch')
    expect(() => captureEmail({ ...content(), attachments: [content().attachments[0], content().attachments[0]] })).toThrow()
  })
  it('normalizes omitted Reply-To to null and includes that state in digest', () => {
    const { replyTo: _replyTo, ...input } = content(); void _replyTo
    const absent = captureEmail(input)
    expect(absent.replyTo).toBeNull()
    expect(absent).toEqual(captureEmail({ ...input, replyTo: null }))
    expect(readEmail(absent)).toEqual(absent)
    expect(absent.payloadSha256).not.toBe(captureEmail(content()).payloadSha256)
    expect(() => captureEmail({ ...input, replyTo: 'invalid' })).toThrow()
  })
  it('preserves valid legacy mailbox punctuation instead of rejecting durable baselines', () => {
    for (const address of ['hiring&hr@example.com', 'hiring!hr@example.com', 'a/b@example.com']) {
      const input = { ...content(), to: address, replyTo: address }
      expect(readEmail(captureEmail(input)).to).toBe(address)
    }
  })
  it('accepts the exact existing sender while rejecting display-name and header injection', () => {
    const from = 'JobLink <notifications@joblinkantigua.com>'
    expect(readEmail(captureEmail({ ...content(), from })).from).toBe(from)
    for (const bad of [from + '\r\nBcc: bad@example.invalid', 'JobLink <bad@example.invalid>', 'Other <notifications@joblinkantigua.com>', 'notifications@joblinkantigua.com\n']) {
      expect(() => captureEmail({ ...content(), from: bad })).toThrow()
    }
  })
  it('rejects mutable URLs, path traversal, header injection, inconsistent missing attachment metadata and mismatched resume', () => {
    for (const path of ['https://example.invalid/resume.pdf', '../resume.pdf', '/resume.pdf']) {
      const c = content(); c.attachments[0].storagePath = path
      expect(() => captureEmail(c)).toThrow()
    }
    expect(() => captureEmail({ ...content(), subject: 'test\r\nBcc: bad@example.invalid' })).toThrow()
    expect(() => captureEmail({ ...content(), attachments: [] })).toThrow()
    expect(() => captureEmail({ ...content(), resumeSha256: 'a'.repeat(64) })).toThrow('digest mismatch')
  })
})

describe('bounded outcome-aware retry policy', () => {
  it('retries only known unsent and explicit rate limiting, with bounded backoff', () => {
    expect(nextSendRetry({ kind: 'not_sent' }, 0, 100, 100)).toBe(30_100)
    expect(nextSendRetry({ kind: 'not_sent' }, 2, 100, 200)).toBe(120_200)
    expect(nextSendRetry({ kind: 'rate_limited', retryAfterMs: 180_000 }, 0, 100, 100)).toBe(180_100)
    expect(nextSendRetry({ kind: 'rate_limited', retryAfterMs: 0 }, 0, 100, 100)).toBe(30_100)
  })
  it.each<SendOutcome>([
    { kind: 'accepted', providerId: 'synthetic-id' }, { kind: 'uncertain' }, { kind: 'rejected' },
    { kind: 'concurrent_conflict' }, { kind: 'payload_conflict' },
  ])('never blindly retries $kind', outcome => expect(nextSendRetry(outcome, 0, 0, 1)).toBeNull())
  it('uses original persisted first-send time, never extends horizon with each attempt', () => {
    const now = SEND_WINDOW_MS - 30_000
    expect(nextSendRetry({ kind: 'not_sent' }, 0, 0, now)).toBeNull()
    expect(nextSendRetry({ kind: 'not_sent' }, 0, 0, now - 1)).toBe(SEND_WINDOW_MS - 1)
    expect(nextSendRetry({ kind: 'not_sent' }, 3, 0, 1)).toBeNull()
    expect(nextSendRetry({ kind: 'not_sent' }, 0, 100, 99)).toBeNull()
    for (const retryAfterMs of [NaN, Infinity, -1, SEND_WINDOW_MS]) {
      expect(nextSendRetry({ kind: 'rate_limited', retryAfterMs }, 0, 0, 0)).toBeNull()
    }
  })
})
