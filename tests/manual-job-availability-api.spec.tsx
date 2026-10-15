// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  job: {} as Row,
  writes: [] as { table: string; value: unknown }[],
  email: vi.fn(),
  notify: vi.fn(),
}));
const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const ENQUIRY_ID = '33333333-3333-4333-8333-333333333333';

function client() {
  return {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let payload: unknown;
      let write = false;
      const execute = () => {
        if (write) {
          if (table === 'job_listings') throw new Error('Availability checks must never write job state');
          state.writes.push({ table, value: payload });
          return { data: [{ id: `${table}-id` }], error: null };
        }
        const rows: Record<string, Row[]> = {
          users: [{ id: 'employer', role: 'employer' }, { id: 'candidate', role: 'seeker', email: 'candidate@example.test' }],
          companies: [{ id: COMPANY_ID, user_id: 'employer', company_name: 'Example Company' }],
          job_listings: [state.job],
          conversation_participants: [],
        };
        return { data: (rows[table] ?? []).filter(row => filters.every(filter => filter(row))), error: null };
      };
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        insert: (value: unknown) => { write = true; payload = value; return query; },
        update: (value: unknown) => { write = true; payload = value; return query; },
        single: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
        maybeSingle: async () => { const result = execute(); return { ...result, data: result.data[0] ?? null }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
  };
}
vi.mock('@/lib/api-auth', () => ({
  requireVerifiedUser: async () => ({ user: { id: 'employer' }, supabase: client() }),
  requireAdmin: async () => ({ user: { id: 'admin' }, supabase: client() }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client() }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: async () => null, RateLimits: { conversation: {} } }));
vi.mock('@/lib/email', () => ({ sendEmail: state.email, BASE_URL: 'https://joblinkantigua.com' }));
vi.mock('@/lib/messaging-notifications', () => ({ sendMessageNotification: state.notify }));

import { POST as invite } from '@/app/api/messages/invite/route';
import { PATCH as associate } from '@/app/api/admin/employer-enquiries/[id]/route';
const inviteRequest = () => new NextRequest('https://joblinkantigua.com/api/messages/invite', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ recipient_user_id: 'candidate', listing_id: JOB_ID, body: 'Please apply for this role.' }),
});
const associateRequest = () => new NextRequest(`https://joblinkantigua.com/api/admin/employer-enquiries/${ENQUIRY_ID}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ status: 'live', notes: '', listing_id: JOB_ID, updated_at: '2026-10-09T00:00:00Z' }),
});

beforeEach(() => {
  vi.clearAllMocks();
  state.writes = [];
  state.job = { id: JOB_ID, company_id: COMPANY_ID, title: 'Legacy active role', status: 'active', expires_at: '2020-01-01T00:00:00Z' };
});

it('allows an invite for the employer’s active past-deadline job without updating it', async () => {
  const before = structuredClone(state.job);
  expect((await invite(inviteRequest())).status).toBe(200);
  expect(state.writes.map(write => write.table)).toEqual(['conversations', 'conversation_participants', 'messages']);
  expect(state.job).toEqual(before);
});

it.each(['closed', 'pending_approval', 'expired'])('rejects invites to %s jobs without any writes or notifications', async status => {
  state.job.status = status;
  const before = structuredClone(state.job);
  expect((await invite(inviteRequest())).status).toBe(400);
  expect(state.writes).toEqual([]);
  expect(state.email).not.toHaveBeenCalled();
  expect(state.notify).not.toHaveBeenCalled();
  expect(state.job).toEqual(before);
});

it('still rejects invites to another company’s active job', async () => {
  state.job.company_id = 'another-company';
  expect((await invite(inviteRequest())).status).toBe(400);
  expect(state.writes).toEqual([]);
});

it('allows a live enquiry association with an active past-deadline job without updating the job', async () => {
  const before = structuredClone(state.job);
  const response = await associate(associateRequest(), { params: Promise.resolve({ id: ENQUIRY_ID }) });
  expect(response.status).toBe(200);
  expect(state.writes).toEqual([{ table: 'employer_enquiries', value: expect.objectContaining({ listing_id: JOB_ID, status: 'live' }) }]);
  expect(state.job).toEqual(before);
});

it.each(['closed', 'pending_approval', 'expired'])('rejects live enquiry associations with %s jobs without changing state', async status => {
  state.job.status = status;
  const before = structuredClone(state.job);
  const response = await associate(associateRequest(), { params: Promise.resolve({ id: ENQUIRY_ID }) });
  expect(response.status).toBe(400);
  expect(state.writes).toEqual([]);
  expect(state.job).toEqual(before);
});
