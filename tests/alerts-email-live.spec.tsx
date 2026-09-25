// @vitest-environment node
// Explicit opt-in only. Sends ONE real email to the user-authorized address.
// All job/profile/alert rows are private fixtures; no public vacancy is created.
import { expect, it, vi } from 'vitest';
import { processJobAlerts } from '@/lib/job-alert-matcher';
import { Resend } from 'resend';

const fixture = vi.hoisted(() => ({ logged: false }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  const row: Record<string, unknown> = {
    job_listings: { id: 'private-alert-delivery-check', title: '[TEST ONLY] Job alert delivery check, not a vacancy', description: 'Private integration test', category: 'Technology', job_type: 'full_time', status: 'active', expires_at: null, companies: { company_name: 'JobLinks test. No action needed.' } },
    seeker_profiles: { user_id: 'private-test-user' },
    users: { email: 'julianlaville@gmail.com', email_verified: true, is_banned: false },
  };
  const data = () => table === 'job_alerts' ? [{ id: 'private-alert', seeker_id: 'private-profile', keywords: ['delivery check'], industry: 'Technology', job_type: 'full_time' }] : table === 'job_alert_log' ? (fixture.logged ? [{ alert_id: 'private-alert' }] : []) : row[table];
  const q = { select: () => q, order: () => q, range: () => q, eq: () => q, in: () => q, upsert: () => { fixture.logged = true; return q; }, single: async () => ({ data: data(), error: null }), maybeSingle: async () => ({ data: data(), error: null }), then: (fn: (value: unknown) => unknown) => Promise.resolve({ data: data(), error: null }).then(fn) };
  return q;
} }) }));

it.skipIf(process.env.ALERT_LIVE_TEST !== 'julianlaville@gmail.com')('sends one real matched alert and checks provider status', async () => {
  const result = await processJobAlerts('private-alert-delivery-check', { seekerId: 'private-profile' });
  expect(result.failed).toBe(0);
  expect(result.sent).toBe(1);
  expect(fixture.logged).toBe(true);
  const repeated = await processJobAlerts('private-alert-delivery-check', { seekerId: 'private-profile' });
  expect(repeated.sent).toBe(0);
  const provider = new Resend(process.env.RESEND_API_KEY);
  const status = await provider.emails.get(result.messageIds[0]);
  console.log(JSON.stringify({ recipient: 'julianlaville@gmail.com', messageId: result.messageIds[0], repeatEmails: repeated.sent, providerEvent: status.data?.last_event || null, statusReadable: !status.error }));
}, 30000);
