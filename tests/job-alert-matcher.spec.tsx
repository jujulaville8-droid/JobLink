import { beforeEach, expect, it, vi } from 'vitest';
import { processJobAlerts } from '@/lib/job-alert-matcher';
const s = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, sent: [] as string[], reject: false, logError: false }));
vi.mock('@/lib/email', () => ({ BASE_URL: 'https://joblinkantigua.com', sendEmail: async ({ to }: { to: string }) => { s.sent.push(to); return s.reject ? { success: false } : { success: true, id: 'email-1' }; } }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const filters: ((r: Record<string, unknown>) => boolean)[] = []; let range = [0, 999]; let payload: Record<string, unknown>[] | null = null;
  const execute = () => {
    if (table === 'job_alert_log' && s.logError) return { data: null, error: { message: 'unavailable' } };
    if (payload) s.tables[table].push(...payload.filter(row => !s.tables[table].some(old => old.alert_id === row.alert_id && old.job_id === row.job_id)));
    return { data: s.tables[table].filter(r => filters.every(fn => fn(r))).slice(range[0], range[1] + 1), error: null };
  };
  const q = { select: () => q, order: () => q, eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; }, in: (k: string, values: unknown[]) => { filters.push(r => values.includes(r[k])); return q; }, range: (a: number, b: number) => { range = [a, b]; return q; }, upsert: (rows: Record<string, unknown>[]) => { payload = rows; return q; }, single: async () => { const r = execute(); return { ...r, data: r.data?.[0] }; }, maybeSingle: async () => { const r = execute(); return { ...r, data: r.data?.[0] }; }, then: (resolve: (v: unknown) => unknown) => Promise.resolve(execute()).then(resolve) };
  return q;
} }) }));
beforeEach(() => {
  s.sent = []; s.reject = false; s.logError = false;
  s.tables = {
    job_listings: [{ id: 'job', title: 'Chef', description: 'Kitchen', category: 'Food & Beverage', job_type: 'full_time', status: 'active', expires_at: null, companies: { company_name: 'Restaurant' } }],
    job_alerts: [{ id: 'a', seeker_id: 'p', keywords: ['chef'], industry: 'Food & Beverage', job_type: null }, { id: 'b', seeker_id: 'p', keywords: ['kitchen'], industry: null, job_type: 'full_time' }, { id: 'c', seeker_id: 'other', keywords: ['accountant'], industry: null, job_type: null }],
    seeker_profiles: [{ id: 'p', user_id: 'u' }, { id: 'other', user_id: 'other-u' }],
    users: [{ id: 'u', email: 'allowed@example.com', email_verified: true, is_banned: false }, { id: 'other-u', email: 'other@example.com', email_verified: true, is_banned: false }], job_alert_log: [],
  };
});
it('sends one matching email per seeker, records accepted sends, and deduplicates a repeat', async () => {
  await processJobAlerts('job'); await processJobAlerts('job');
  expect(s.sent).toEqual(['allowed@example.com']);
  expect(s.tables.job_alert_log.map(r => r.alert_id).sort()).toEqual(['a', 'b']);
});
it('does not log rejected sends and allows a later retry', async () => {
  s.reject = true; await processJobAlerts('job');
  expect(s.tables.job_alert_log).toHaveLength(0);
  s.reject = false; await processJobAlerts('job');
  expect(s.tables.job_alert_log).toHaveLength(2);
});
it('never emails for closed or expired jobs', async () => {
  s.tables.job_listings[0].status = 'closed'; await processJobAlerts('job');
  s.tables.job_listings[0].status = 'active'; s.tables.job_listings[0].expires_at = '2020-01-01'; await processJobAlerts('job');
  expect(s.sent).toHaveLength(0);
});
it('does not email banned or unverified accounts', async () => {
  s.tables.users[0].is_banned = true; await processJobAlerts('job');
  s.tables.users[0].is_banned = false; s.tables.users[0].email_verified = false; await processJobAlerts('job');
  expect(s.sent).toHaveLength(0);
});
it('fails closed when duplicate-send history cannot be read', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  s.logError = true; await processJobAlerts('job');
  expect(s.sent).toHaveLength(0);
  vi.restoreAllMocks();
});
it('allows a targeted retry without notifying other matching seekers', async () => {
  s.tables.job_alerts[2].keywords = ['chef'];
  await processJobAlerts('job', { seekerId: 'p' });
  expect(s.sent).toEqual(['allowed@example.com']);
});
