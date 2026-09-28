// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn(), from: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send } } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
import { notifyEmployerEnquiry } from '../src/lib/employer-enquiry-notifications'

function result(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'update']) chain[method] = vi.fn(() => chain)
  chain.single = chain.maybeSingle = async () => ({ data, error })
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve)
  return chain
}
const request = { id: 'request', company_name: '<Cafe>', contact_name: 'Owner', email: 'owner@example.test', job_title: 'Cook', details: '<script>bad()</script>', phone: '', notification_sent_at: null, notification_started_at: null }
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('RESEND_API_KEY', 'test-only'); mocks.send.mockResolvedValue({ data: { id: 'provider-id' } }) })
it('sends escaped intake only to the internal inbox with a stable idempotency key', async () => {
  const saved = result(null)
  mocks.from.mockReturnValueOnce(result({ ...request })).mockReturnValueOnce(result({ id: request.id })).mockReturnValueOnce(saved)
  expect(await notifyEmployerEnquiry(request.id)).toBe(true)
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'jujulaville8@gmail.com', replyTo: 'owner@example.test', html: expect.stringContaining('&lt;script&gt;') }), { idempotencyKey: 'employer-enquiry/request' })
  expect(saved.update).toHaveBeenCalledWith(expect.objectContaining({ notification_sent_at: expect.any(String) }))
})
it('does not mark provider failures as sent', async () => {
  mocks.from.mockReturnValueOnce(result({ ...request, notification_started_at: new Date().toISOString() }))
  mocks.send.mockResolvedValue({ error: { message: 'Unavailable' } })
  expect(await notifyEmployerEnquiry(request.id)).toBe(false)
  expect(mocks.from).toHaveBeenCalledTimes(1)
})
it('does not send after losing the claim or exceeding the retry window', async () => {
  mocks.from.mockReturnValueOnce(result({ ...request })).mockReturnValueOnce(result(null))
  expect(await notifyEmployerEnquiry(request.id)).toBe(false)
  mocks.from.mockReturnValueOnce(result({ ...request, notification_started_at: new Date(Date.now() - 24 * 3600000).toISOString() }))
  expect(await notifyEmployerEnquiry(request.id)).toBe(false)
  expect(mocks.send).not.toHaveBeenCalled()
})
