// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ send: vi.fn(), from: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send } } }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from }) }))
import { requestTestimonial, outreachProof } from '../src/lib/testimonials'

const placement = {
  id: 'placement', employer_id: 'employer', job_title: 'Cook', company_name: 'Local <Cafe>',
  request_started_at: null as string | null, request_sent_at: null as string | null,
  request_email: null as string | null, feedback: null as string | null,
}
function result(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'is', 'gte', 'order', 'limit', 'update']) builder[method] = vi.fn(() => builder)
  builder.single = builder.maybeSingle = vi.fn(async () => ({ data, error }))
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve)
  return builder
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('RESEND_API_KEY', 'test-only')
  mocks.send.mockResolvedValue({ data: { id: 'email' }, error: null })
})

describe('testimonial delivery', () => {
  it('claims a request before sending and uses a stable provider idempotency key', async () => {
    const claim = result({ id: 'placement' })
    const saved = result(null)
    mocks.from.mockReturnValueOnce(result({ ...placement })).mockReturnValueOnce(result({ email: 'owner@example.test', is_banned: false })).mockReturnValueOnce(claim).mockReturnValueOnce(saved)
    expect(await requestTestimonial('placement')).toBe(true)
    expect(claim.update).toHaveBeenCalledWith(expect.objectContaining({ request_email: 'owner@example.test' }))
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', html: expect.stringContaining('Local &lt;Cafe&gt;') }), { idempotencyKey: 'placement-testimonial/placement' })
    expect(saved.update).toHaveBeenCalledWith(expect.objectContaining({ request_sent_at: expect.any(String) }))
  })
  it('does not send when another invocation already claimed the request', async () => {
    mocks.from.mockReturnValueOnce(result({ ...placement })).mockReturnValueOnce(result({ email: 'owner@example.test' })).mockReturnValueOnce(result(null))
    expect(await requestTestimonial('placement')).toBe(false)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('skips completed requests and stops retries before idempotency expires', async () => {
    mocks.from.mockReturnValueOnce(result({ ...placement, request_sent_at: new Date().toISOString() }))
    expect(await requestTestimonial('placement')).toBe(true)
    mocks.from.mockReturnValueOnce(result({ ...placement, request_started_at: new Date(Date.now() - 24 * 3600000).toISOString() }))
    expect(await requestTestimonial('placement')).toBe(false)
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('retries provider failures with the original recipient and leaves them unsent', async () => {
    mocks.from.mockReturnValueOnce(result({ ...placement, request_started_at: new Date().toISOString(), request_email: 'original@example.test' }))
    mocks.send.mockResolvedValue({ error: { message: 'Unavailable' } })
    expect(await requestTestimonial('placement')).toBe(false)
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'original@example.test' }), { idempotencyKey: 'placement-testimonial/placement' })
    expect(mocks.from).toHaveBeenCalledTimes(1)
  })
})

describe('outreach eligibility', () => {
  it('only queries approved, consented, highly rated stories', async () => {
    const query = result([{ company_name: 'Cafe', job_title: 'Cook', feedback: '<Great help>' }])
    mocks.from.mockReturnValue(query)
    expect(await outreachProof()).toContain('&lt;Great help&gt;')
    expect(query.eq).toHaveBeenCalledWith('review_status', 'approved')
    expect(query.eq).toHaveBeenCalledWith('consent', true)
    expect(query.gte).toHaveBeenCalledWith('rating', 4)
  })
  it('adds nothing before a testimonial is approved', async () => {
    mocks.from.mockReturnValue(result([]))
    expect(await outreachProof()).toBe('')
  })
})
