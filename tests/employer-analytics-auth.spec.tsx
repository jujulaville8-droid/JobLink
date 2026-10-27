import { beforeEach, expect, it, vi } from 'vitest';
import { analyticsDb } from './helpers/analytics-db';
import { getEmployerAnalytics } from '@/lib/employer-analytics';
const mocks = vi.hoisted(() => ({ create: vi.fn(), admin: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('JOB_VIEWS_LAUNCH_AT', '2026-01-01T00:00:00Z');
  mocks.rpc.mockReturnValue({ order: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }) });
  mocks.admin.mockReturnValue({ rpc: mocks.rpc });
});
it.each(['logged-out', 'auth-error', 'seeker', 'unverified', 'auth-unverified', 'missing-role', 'missing-company', 'company-error'])('fails closed for %s before service access', async scenario => {
  const db = analyticsDb(); mocks.create.mockResolvedValue(db);
  if (scenario === 'logged-out') db.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
  if (scenario === 'auth-error') db.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Temporary auth failure') });
  if (scenario === 'seeker') db.rows.users[0].role = 'seeker';
  if (scenario === 'unverified') db.rows.users[0].email_verified = false;
  if (scenario === 'auth-unverified') db.user.email_confirmed_at = '';
  if (scenario === 'missing-role') db.rows.users = []; // user_metadata must never authorize
  if (scenario === 'missing-company') db.rows.companies = [];
  if (scenario === 'company-error') db.failures.add('companies');
  const data = await getEmployerAnalytics();
  expect(data.state).toBe(({ 'logged-out': 'unauthenticated', 'auth-error': 'error', seeker: 'denied', unverified: 'unverified', 'auth-unverified': 'unverified', 'missing-role': 'denied', 'missing-company': 'setup', 'company-error': 'error' })[scenario]);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('derives privileged company scope afresh and ignores forged company/listing arguments', async () => {
  for (const company of ['company-a', 'company-b']) {
    const db = analyticsDb(); db.rows.companies[0].id = company; mocks.create.mockResolvedValue(db);
    // JS callers cannot smuggle authority through runtime values or extra arguments.
    await Reflect.apply(getEmployerAnalytics, null, [{ companyId: 'foreign', listingId: 'foreign' }]);
    expect(mocks.rpc).toHaveBeenLastCalledWith('employer_job_view_counts', expect.objectContaining({ p_company_id: company }));
    expect(db.calls.find(c => c.table === 'companies')?.filters).toContainEqual(['eq', 'user_id', 'owner']);
  }
});
it('isolates a failed privileged aggregate from applications', async () => {
  mocks.create.mockResolvedValue(analyticsDb()); mocks.admin.mockImplementation(() => { throw new Error(); });
  expect(await getEmployerAnalytics()).toMatchObject({ state: 'available', applications: 0, views: { state: 'error' } });
});
it('paginates privileged daily groups and marks pre-launch days unavailable', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
  try {
    vi.stubEnv('JOB_VIEWS_LAUNCH_AT', '2026-10-25T12:00:00Z');
    mocks.create.mockResolvedValue(analyticsDb());
    const rows = Array.from({ length: 1101 }, (_, i) => ({ job_id: `job-${i}`, day: '2026-10-25', views: '1' }));
    mocks.rpc.mockReturnValue({ order: () => ({ order: () => ({ range: async (offset: number) => ({ data: rows.slice(offset, offset + 317), error: null }) }) }) });
    const data = await getEmployerAnalytics(7);
    expect(data).toMatchObject({ state: 'available', views: { state: 'available', total: 1101, partialDays: ['2026-10-25'], daily: { '2026-10-24': null, '2026-10-25': 1101, '2026-10-26': 0 } } });
    expect(mocks.rpc).toHaveBeenCalledWith('employer_job_view_counts', expect.objectContaining({ p_start: '2026-10-25T12:00:00.000Z', p_end: '2026-10-26T12:00:00.000Z' }));
  } finally { vi.useRealTimers(); }
});
it.each(['', 'invalid', '2999-01-01T00:00:00Z'])('keeps collection/display off for inactive launch value %s', async value => {
  vi.stubEnv('JOB_VIEWS_LAUNCH_AT', value); mocks.create.mockResolvedValue(analyticsDb());
  expect(await getEmployerAnalytics()).toMatchObject({ state: 'available', views: null });
  expect(mocks.admin).not.toHaveBeenCalled();
});

it.each([0, -1, 31 * 86400000 + 1])('rejects an invalid views span of %s without querying aggregates', async span => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
  const parse = Date.parse;
  // Simulate a malformed period at the private adapter's parsing boundary.
  const parsing = vi.spyOn(Date, 'parse').mockImplementation(value =>
    value === '2026-10-20T04:00:00.000Z' ? parse('2026-10-26T12:00:00Z') - span : parse(value));
  try {
    mocks.create.mockResolvedValue(analyticsDb());
    expect(await getEmployerAnalytics(7)).toMatchObject({ state: 'available', views: { state: 'error' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  } finally { parsing.mockRestore(); vi.useRealTimers(); }
});
it('rejects a view aggregate day outside the window', async () => {
  mocks.create.mockResolvedValue(analyticsDb());
  mocks.rpc.mockReturnValue({ order: () => ({ order: () => ({ range: async () => ({ data: [{ job_id: 'job-a', day: '1900-01-01', views: 1 }], error: null }) }) }) });
  expect(await getEmployerAnalytics(7)).toMatchObject({ state: 'available', views: { state: 'error' } });
});
