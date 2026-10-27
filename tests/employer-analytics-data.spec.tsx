import { beforeEach, expect, it, vi } from 'vitest';
import { analyticsDb } from './helpers/analytics-db';
import { analyticsPeriod, summarize, readAll, getEmployerAnalytics, type Listing } from '@/lib/employer-analytics';
const mocks = vi.hoisted(() => ({ create: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.create }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv('JOB_VIEWS_LAUNCH_AT', ''); });
const listing = (id: string, status = 'active'): Listing => ({ id, status, title: id, company_id: 'company-a', created_at: '2026-01-01', applications: [{ count: 2 }] });
it.each([7, 30] as const)('uses exact Antigua boundaries and zero fills %s calendar days', days => {
  const p = analyticsPeriod(days, new Date('2026-10-26T05:00:00Z'));
  expect(p.dates).toHaveLength(days);
  expect(p.start).toBe(days === 7 ? '2026-10-20T04:00:00.000Z' : '2026-09-27T04:00:00.000Z');
  const data = summarize([listing('a'), listing('b', 'draft')], [
    { id: '1', job_id: 'a', applied_at: p.start, status: 'interview' },
    { id: '2', job_id: 'b', applied_at: '2026-10-26T04:00:00+00:00', status: 'hired' },
    { id: '3', job_id: 'a', applied_at: new Date(Date.parse(p.start) - 1).toISOString(), status: 'applied' },
    { id: '4', job_id: 'a', applied_at: p.end, status: 'applied' },
  ], p);
  expect(data.applications).toBe(2); // applications on two listings, regardless of seeker identity
  expect(Object.values(data.daily).reduce((a, b) => a + b)).toBe(2);
  expect(data.statuses).toMatchObject({ interview: 1, unknown: 1, hold: 0 });
  expect(data.inventory).toMatchObject({ active: 1, draft: 1 });
  expect(data.rows.map(r => r.periodApplications)).toEqual([1, 1]);
});
it('handles midnight before UTC day rollover and effective closures', () => {
  const p = analyticsPeriod(7, new Date('2026-10-26T03:59:59Z'));
  expect(p.dates.at(-1)).toBe('2026-10-25');
  const job = { ...listing('e03a2b8c-f69b-42bb-bc43-13a5d0917291'), company_id: '362300b7-c0c5-4c2e-a9f6-6fe79f187e71' };
  expect(summarize([job, listing('pending', 'pending_approval')], [], p).inventory).toMatchObject({ active: 0, closed: 1, pending: 1 });
});
it('reads past 1,000 rows even with a lower API cap; errors are not zeros', async () => {
  const rows = Array.from({ length: 1211 }, (_, i) => ({ id: String(i).padStart(5, '0') }));
  const data = await readAll(async after => ({ data: rows.filter(r => !after || r.id > after).slice(0, 317), error: null }));
  expect(data).toHaveLength(1211);
  await expect(readAll(async () => ({ data: null, error: new Error() }))).rejects.toThrow();
});
it('uses scoped exact totals and paginated cohort; listing conversations count each ID once', async () => {
  const db = analyticsDb(); mocks.create.mockResolvedValue(db);
  db.rows.job_listings = [listing('a')];
  const now = new Date(Date.now() - 1000).toISOString();
  db.rows.applications = Array.from({ length: 1211 }, (_, i) => ({ id: String(i).padStart(5, '0'), job_id: 'a', status: 'applied', applied_at: now, 'job_listings.company_id': 'company-a' }));
  const message = { id: 'm', sender_id: 'owner', created_at: now, 'conversations.applications.job_listings.company_id': 'company-a', 'conversations.conversation_participants.user_id': 'owner' };
  db.rows.messages = [message, { ...message }, { ...message, id: 'n', sender_id: 'seeker' }, { ...message, id: 'foreign', 'conversations.applications.job_listings.company_id': 'company-b' }];
  const data = await getEmployerAnalytics();
  expect(data).toMatchObject({ state: 'available', applications: 1211, allApplications: 1211, messages: { sent: 1, received: 1 }, views: null });
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(db.calls.filter(c => c.table === 'messages').every(c => !c.filters.some(([, f]) => f.includes('archiv')))).toBe(true);
  db.failures.add('messages');
  expect(await getEmployerAnalytics()).toMatchObject({ state: 'available', messages: { state: 'error' } });
  db.failures.add('applications');
  expect(await getEmployerAnalytics()).toEqual({ state: 'error' });
});

it('rejects an application whose day has no period bucket', () => {
  const period = analyticsPeriod(7, new Date('2026-10-26T12:00:00Z'));
  period.dates = period.dates.slice(1);
  expect(() => summarize([], [{ id: '1', job_id: 'a', applied_at: period.start, status: 'applied' }], period)).toThrow('Application outside period');
});
