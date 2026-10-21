/** Outcome-aware Resend boundary. No automatic retries, URL attachments or fallback sender. */
import { z } from 'zod'
import { readEmail, verifyAttachmentBytes, type AttachmentDescriptor, type SendOutcome, type Transport } from './index'

export type AttachmentReader = (descriptor: AttachmentDescriptor, signal: AbortSignal) => Promise<Uint8Array>
export type DeliveryConfig = {
  enabled: boolean
  apiKey: string | undefined
  readAttachment: AttachmentReader
  fetch?: typeof globalThis.fetch
}
const acceptedSchema = z.object({ id: z.string().min(1).max(255) })
const errorSchema = z.object({ name: z.string().max(100) })
/** Current provider docs: idempotency retained for 24h. Our durable window is 23h.
 * https://resend.com/docs/dashboard/emails/idempotency-keys
 * https://resend.com/docs/api-reference/errors
 * A request exception, server error, malformed acceptance or conflict is NOT not-sent. */
export function createResendTransport(config: DeliveryConfig): Transport {
  return async (input, key, parentSignal) => {
    if (!config.enabled || !config.apiKey || parentSignal?.aborted) return { kind: 'not_sent' }
    if (!/^application\/[a-zA-Z0-9_-]+\/employer$/.test(key) || key.length > 256) return { kind: 'payload_conflict' }
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    parentSignal?.addEventListener('abort', onAbort, { once: true })
    let dispatched = false
    try {
      const email = readEmail(input)
      if (email.from !== 'JobLink <notifications@joblinkantigua.com>') return { kind: 'payload_conflict' }
      const attachments: { filename: string; content: string; content_type: string }[] = []
      for (const descriptor of email.attachments) {
        if (controller.signal.aborted) return { kind: 'not_sent' }
        const bytes = await abortable(config.readAttachment(descriptor, controller.signal), controller.signal)
        try { verifyAttachmentBytes(descriptor, bytes) }
        catch { return { kind: 'payload_conflict' } }
        // Provider receives exact captured bytes, never a private storage URL.
        attachments.push({ filename: descriptor.filename, content: Buffer.from(bytes).toString('base64'), content_type: 'application/pdf' })
      }
      if (controller.signal.aborted) return { kind: 'not_sent' }
      const requestBody = JSON.stringify({
        from: email.from, to: [email.to], subject: email.subject, html: email.html,
        tags: [{ name: 'application_id', value: key.split('/')[1] }, { name: 'payload_sha256', value: email.payloadSha256 }],
        ...(email.replyTo !== null ? { reply_to: email.replyTo } : {}),
        ...(attachments.length ? { attachments } : {}),
      })
      dispatched = true
      const response = await (config.fetch ?? globalThis.fetch)('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: requestBody,
      })
      // Do not log provider bodies or retain private response content.
      if (response.status >= 500 || response.status >= 300 && response.status < 400) return { kind: 'uncertain' }
      const body = await readBoundedJson(response)
      if (response.ok) {
        const accepted = acceptedSchema.safeParse(body)
        return accepted.success ? { kind: 'accepted', providerId: accepted.data.id } : { kind: 'uncertain' }
      }
      const error = errorSchema.safeParse(body)
      if (response.status === 409) {
        if (error.success && error.data.name === 'invalid_idempotent_request') return { kind: 'payload_conflict' }
        return { kind: 'concurrent_conflict' }
      }
      if (response.status === 429 && error.success && error.data.name === 'rate_limit_exceeded') {
        const value = response.headers.get('retry-after')
        // Resend documents rate-limit rejection. Unknown quota semantics do not auto-retry.
        const seconds = value !== null && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : 30
        return { kind: 'rate_limited', retryAfterMs: Math.min(seconds * 1000, 24 * 60 * 60 * 1000) }
      }
      if ([400, 401, 403, 404, 405, 413, 422, 429].includes(response.status) && error.success) return { kind: 'rejected' }
      return { kind: 'uncertain' }
    } catch {
      return { kind: dispatched ? 'uncertain' : 'not_sent' } satisfies SendOutcome
    } finally { parentSignal?.removeEventListener('abort', onAbort); controller.abort() }
  }
}
async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0, text = ''
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 16_384) { await reader.cancel(); return null }
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } catch { return null }
  finally { reader.releaseLock() }
}

/** Cancelling preparation is definitively unsent, even if the storage SDK ignores abort. */
async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: (() => void) | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Cancelled'))
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })])
  } finally { if (onAbort) signal.removeEventListener('abort', onAbort) }
}
