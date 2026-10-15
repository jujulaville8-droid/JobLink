// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send } } }))
import { sendEmail } from '../src/lib/email'

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('RESEND_API_KEY', 'test-only'); mocks.send.mockResolvedValue({ data: { id: 'accepted' }, error: null }) })
it('passes attachment bytes, applicant reply-to and idempotency through to the provider', async () => {
  const attachments = [{ filename: 'Applicant-CV.pdf', content: Buffer.from('%PDF-fixture'), contentType: 'application/pdf' }]
  expect(await sendEmail({ to: 'owner@example.test', type: 'new_applicant', replyTo: 'applicant@example.test', attachments, data: { applicant_name: 'Name', cv_attached: true }, idempotencyKey: 'application/id/employer' })).toEqual({ success: true, id: 'accepted' })
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@example.test', replyTo: 'applicant@example.test', attachments, html: expect.stringContaining('CV is attached') }), { idempotencyKey: 'application/id/employer' })
  expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('cc')
})
it('never logs private provider errors or recipient addresses', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.send.mockResolvedValue({ error: { message: 'owner@example.test token=secret' } })
  expect(await sendEmail({ to: 'owner@example.test', type: 'new_applicant' })).toEqual({ success: false })
  mocks.send.mockRejectedValue(new Error('private CV content token=secret'))
  expect(await sendEmail({ to: 'owner@example.test', type: 'new_applicant' })).toEqual({ success: false })
  vi.stubEnv('RESEND_API_KEY', '')
  expect(await sendEmail({ to: 'owner@example.test', type: 'new_applicant' })).toEqual({ success: false })
  expect(JSON.stringify([...error.mock.calls, ...warn.mock.calls])).not.toMatch(/secret|owner@example/)
  error.mockRestore(); warn.mockRestore()
})
