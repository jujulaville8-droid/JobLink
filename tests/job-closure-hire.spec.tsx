// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/applications/hire/route'

const state = vi.hoisted(() => ({ rpc: vi.fn(), notify: vi.fn(), testimonial: vi.fn(), queue: [] as (() => Promise<unknown>)[] }))
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), after: (fn: () => Promise<unknown>) => state.queue.push(fn) }))
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: async () => ({ user: { id: 'owner' } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: state.rpc }) }))
vi.mock('@/lib/job-closure-notifications', () => ({ notifyApplicantsOfJobClosure: state.notify }))
vi.mock('@/lib/testimonials', () => ({ requestTestimonial: state.testimonial }))
const application_id = '11111111-1111-4111-8111-111111111111'
const request = (close_job = true) => new NextRequest('http://localhost/api/applications/hire', {
  method: 'POST', body: JSON.stringify({ application_id, close_job }),
})
beforeEach(() => {
  vi.resetAllMocks(); state.queue = []
  state.rpc.mockResolvedValue({ data: { placement_id: 'placement', closed_job_id: 'job' }, error: null })
})

it('queues applicant email and the unchanged testimonial only after the atomic hire succeeds', async () => {
  const response = await POST(request())
  expect(await response.json()).toEqual({ success: true, placement_id: 'placement', closed: true })
  expect(state.rpc).toHaveBeenCalledWith('confirm_placement_with_closure', { p_application: application_id, p_employer: 'owner', p_close: true })
  expect(state.notify).not.toHaveBeenCalled()
  await state.queue[0]()
  expect(state.notify).toHaveBeenCalledExactlyOnceWith('job')
  expect(state.testimonial).toHaveBeenCalledExactlyOnceWith('placement')
})

it.each([true, false])('does not notify without a confirmed active transition (close_job=%s)', async close => {
  state.rpc.mockResolvedValue({ data: { placement_id: 'placement', closed_job_id: null }, error: null })
  expect((await POST(request(close))).status).toBe(200)
  await state.queue[0]()
  expect(state.notify).not.toHaveBeenCalled()
})

it('does not queue email on a rejected hire', async () => {
  state.rpc.mockResolvedValue({ data: null, error: { code: 'P0001' } })
  expect((await POST(request())).status).toBe(400)
  expect(state.queue).toHaveLength(0)
})

it('preserves the legacy hire without applicant emails when the migration is absent', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    state.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
      .mockResolvedValueOnce({ data: 'legacy-placement', error: null })
    expect((await POST(request())).status).toBe(200)
    expect(state.rpc).toHaveBeenLastCalledWith('confirm_placement', { p_application: application_id, p_employer: 'owner', p_close: true })
    await state.queue[0]()
    expect(state.testimonial).toHaveBeenCalledWith('legacy-placement')
    expect(state.notify).not.toHaveBeenCalled()
  } finally { warn.mockRestore() }
})

it('isolates testimonial failures from closure notification', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    state.testimonial.mockRejectedValue(new Error('provider unavailable'))
    await POST(request()); await state.queue[0]()
    expect(state.notify).toHaveBeenCalledExactlyOnceWith('job')
  } finally { error.mockRestore() }
})
