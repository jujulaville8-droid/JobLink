import { afterEach, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/email';
const boundary = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: boundary.send }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('reports provider acceptance and passes an idempotency key', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test');
  boundary.send.mockResolvedValue({ data: { id: 'message-1' }, error: null });
  const result = await sendEmail({ to: 'test@example.com', type: 'job_alert', data: { jobs: [] }, idempotencyKey: 'alert-job-person' });
  expect(result).toEqual({ success: true, id: 'message-1' });
  expect(boundary.send.mock.calls.at(-1)?.[1]).toEqual({ idempotencyKey: 'alert-job-person' });
});
it('reports provider rejection instead of pretending an email was sent', async () => {
  vi.stubEnv('RESEND_API_KEY', 'test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  boundary.send.mockResolvedValue({ data: null, error: { message: 'Rejected' } });
  expect(await sendEmail({ to: 'test@example.com', type: 'job_alert' })).toEqual({ success: false });
});
it('reports missing provider configuration as failure', async () => {
  vi.stubEnv('RESEND_API_KEY', '');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await sendEmail({ to: 'test@example.com', type: 'job_alert' })).toEqual({ success: false });
});
