// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/jobs/[id]/view/route';
import { analyticsDb } from './helpers/analytics-db';
const mocks = vi.hoisted(() => ({ create: vi.fn(), admin: vi.fn(), rpc: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
const id = '11111111-1111-4111-8111-111111111111';
const eventId = '22222222-2222-4222-8222-222222222222';
let db: ReturnType<typeof analyticsDb>;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('JOB_VIEWS_LAUNCH_AT', '2026-01-01T00:00:00Z'); vi.stubEnv('JOB_VIEWS_RATE_LIMIT_SECRET', 'test-secret');
  db = analyticsDb(); db.rows.job_listings = [{ id, company_id: 'company-a', status: 'active' }];
  db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null }); mocks.create.mockResolvedValue(db);
  mocks.rpc.mockResolvedValue({ data: [{ allowed: true }], error: null }); mocks.upsert.mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: () => ({ upsert: mocks.upsert }) });
});
async function send(body: unknown = { eventId, surface: 'job_page' }, origin = 'https://example.test', job = id) {
  return POST(new Request(`https://example.test/api/jobs/${job}/view`, { method: 'POST', headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': '192.0.2.1' }, body: typeof body === 'string' ? body : JSON.stringify(body) }), { params: Promise.resolve({ id: job }) });
}
it('records anonymous events with server time and conflict-ignore; returns no event data', async () => {
  const response = await send(); expect(response.status).toBe(204); expect(await response.text()).toBe('');
  expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ event_id: eventId, job_id: id, surface: 'job_page', viewed_at: expect.any(String) }), { onConflict: 'event_id', ignoreDuplicates: true });
  await send(); expect(mocks.upsert.mock.calls[1][0].event_id).toBe(eventId);
  expect(mocks.rpc).toHaveBeenCalledWith('consume_rate_limit', { p_bucket: expect.stringMatching(new RegExp(`^job-view:[a-f0-9]{64}:${id}$`)), p_limit: 10, p_window_seconds: 3600 });
  expect(mocks.rpc.mock.calls[0][1].p_bucket).not.toContain('192.0.2.1');
  expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty('user_id');
});
it.each(['owner', 'admin', 'admin-flag', 'identity-error'])('excludes %s previews', async type => {
  db.auth.getUser.mockResolvedValue({ data: { user: db.user }, error: null });
  if (type === 'admin') { db.rows.users[0].role = 'admin'; db.rows.companies[0].user_id = 'other'; }
  if (type === 'admin-flag') { db.rows.users[0].is_admin = true; db.rows.companies[0].user_id = 'other'; }
  if (type === 'identity-error') db.failures.add('users');
  expect((await send()).status).toBe(204); expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('accepts seekers', async () => {
  db.auth.getUser.mockResolvedValue({ data: { user: db.user }, error: null }); db.rows.users[0].role = 'seeker'; db.rows.companies[0].user_id = 'other';
  await send(); expect(mocks.upsert).toHaveBeenCalledOnce();
});
it.each(['missing', 'draft', 'pending_approval', 'closed', 'override'])('ignores unavailable %s listing', async status => {
  let job = id;
  if (status === 'missing') db.rows.job_listings = [];
  else if (status === 'override') { job = 'e03a2b8c-f69b-42bb-bc43-13a5d0917291'; db.rows.job_listings = [{ id: job, company_id: '362300b7-c0c5-4c2e-a9f6-6fe79f187e71', status: 'active' }]; }
  else db.rows.job_listings[0].status = status;
  await send(undefined, undefined, job); expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([{ eventId: 'bad', surface: 'job_page' }, { eventId, surface: 'card' }, { eventId, surface: 'job_page', viewed_at: '2000-01-01' }, { eventId, surface: 'job_page', company_id: 'foreign' }, 'not-json', 'x'.repeat(257)])('rejects malformed/spoofed payload %j', async body => {
  expect((await send(body)).status).toBe(204); expect(mocks.upsert).not.toHaveBeenCalled();
});
it('rejects hostile/missing origins and invalid listing UUID', async () => {
  await send(undefined, 'https://evil.test'); await send(undefined, ''); await send(undefined, undefined, 'bad');
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it.each(['error', 'empty', 'denied', 'throw', 'secret', 'off'])('fails closed for limiter/config %s', async mode => {
  if (mode === 'error') mocks.rpc.mockResolvedValue({ data: [{ allowed: true }], error: new Error() });
  if (mode === 'empty') mocks.rpc.mockResolvedValue({ data: [], error: null });
  if (mode === 'denied') mocks.rpc.mockResolvedValue({ data: [{ allowed: false }], error: null });
  if (mode === 'throw') mocks.rpc.mockRejectedValue(new Error());
  if (mode === 'secret') vi.stubEnv('JOB_VIEWS_RATE_LIMIT_SECRET', '');
  if (mode === 'off') vi.stubEnv('JOB_VIEWS_LAUNCH_AT', '');
  expect((await send()).status).toBe(204); expect(mocks.upsert).not.toHaveBeenCalled();
});
it('swallows recording failures', async () => {
  mocks.upsert.mockRejectedValue(new Error('database unavailable'));
  expect((await send()).status).toBe(204);
});
