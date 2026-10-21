import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { recordEmployerReceipt } from '../src/lib/employer-screening/receipts'
const secret = Buffer.from('synthetic-webhook-secret-only-1234')
const make = (change: Record<string, unknown> = {}) => {
  const payload = JSON.stringify({ type: 'email.sent', data: { email_id: 'provider-1', tags: {
    application_id: '12345678-1234-4234-8234-123456789012', payload_sha256: 'a'.repeat(64),
  } }, ...change })
  const id = 'msg_synthetic1', timestamp = String(Math.floor(Date.now() / 1000))
  const signature = 'v1,' + createHmac('sha256', secret).update(`${id}.${timestamp}.${payload}`).digest('base64')
  return { payload, id, timestamp, signature, webhookSecret: 'whsec_' + secret.toString('base64') }
}
describe('signed acceptance reconciliation', () => {
  it('verifies raw signed body before recording a receipt bound to app and payload', async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }))
    expect(await recordEmployerReceipt(make(), { rpc })).toBe('accepted')
    expect(rpc).toHaveBeenCalledWith('employer_outbox_record_receipt', { p_application_id: '12345678-1234-4234-8234-123456789012', p_digest: 'a'.repeat(64), p_provider_id: 'provider-1', p_evidence_id: 'msg_synthetic1' })
  })
  it('rejects tampering and missing signature without any DB action', async () => {
    const rpc = vi.fn(), valid = make()
    for (const input of [{ ...valid, payload: valid.payload + ' ' }, { ...valid, signature: '' }]) {
      await expect(recordEmployerReceipt(input, { rpc })).rejects.toThrow()
    }
    expect(rpc).not.toHaveBeenCalled()
  })
  it('does not infer known-unsent or authorize resend from failure events', async () => {
    const rpc = vi.fn()
    expect(await recordEmployerReceipt(make({ type: 'email.failed' }), { rpc })).toBe('ignored')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('keeps unmatched receipts retryable and hides database detail on failure', async () => {
    expect(await recordEmployerReceipt(make(), { rpc: async () => ({ data: false, error: null }) })).toBe('unmatched')
    await expect(recordEmployerReceipt(make(), { rpc: async () => ({ data: null, error: 'private-data' }) })).rejects.toThrow('Receipt persistence unavailable')
  })
})
