/** Verified provider acceptance receipts only. Never converts a failed webhook into a retry. */
import { Resend } from 'resend'
import { z } from 'zod'
import type { OutboxRpcClient } from './supabase-outbox-store'
const receiptSchema = z.object({
  type: z.enum(['email.sent', 'email.delivered']),
  data: z.object({ email_id: z.string().min(1).max(255),
    tags: z.object({ application_id: z.uuid(), payload_sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  }),
})
export async function recordEmployerReceipt(input: {
  payload: string; id: string; timestamp: string; signature: string; webhookSecret: string;
}, db: OutboxRpcClient): Promise<'accepted' | 'ignored' | 'unmatched'> {
  if (Buffer.byteLength(input.payload) > 65_536 || !/^msg_[a-zA-Z0-9_-]{1,200}$/.test(input.id)) throw new Error('Invalid receipt')
  // Verification is local; this SDK instance never makes an API request.
  const verified = new Resend('webhook-verification-only').webhooks.verify({
    payload: input.payload, headers: { id: input.id, timestamp: input.timestamp, signature: input.signature },
    webhookSecret: input.webhookSecret,
  })
  const parsed = receiptSchema.safeParse(verified)
  if (!parsed.success) return 'ignored'
  const { data, error } = await db.rpc('employer_outbox_record_receipt', {
    p_application_id: parsed.data.data.tags.application_id, p_digest: parsed.data.data.tags.payload_sha256,
    p_provider_id: parsed.data.data.email_id, p_evidence_id: input.id,
  })
  if (error) throw new Error('Receipt persistence unavailable')
  return z.boolean().parse(data) ? 'accepted' : 'unmatched'
}
