import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/admin/listings/[id]/route';
import { POST } from '@/app/api/admin/post-job/route';
const s = vi.hoisted(() => ({ previous: 'pending_approval', queue: [] as (() => Promise<unknown>)[], processed: [] as string[] }));
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: (fn: () => Promise<unknown>) => s.queue.push(fn) }));
vi.mock('@/lib/job-alert-matcher', () => ({ processJobAlerts: async (id: string) => { s.processed.push(id); } }));
vi.mock('@/lib/email', () => ({ sendEmail: async () => {}, BASE_URL: 'https://joblinkantigua.com' }));
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: async () => ({ user: { id: 'admin' } }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let write = false;
  const q = { select: () => q, eq: () => q, update: () => { write = true; return q; }, insert: () => { write = true; return q; }, single: async () => ({ error: null, data: table === 'users' ? { is_admin: true } : write ? { id: 'job', status: 'active' } : { status: s.previous, companies: null } }) };
  return q;
} }) }));
beforeEach(() => { s.previous = 'pending_approval'; s.queue = []; s.processed = []; });
it('queues matching only on a transition to active, not edits to an already active listing', async () => {
  const req = () => new NextRequest('http://localhost/api/admin/listings/job', { method: 'PATCH', body: JSON.stringify({ status: 'active' }) });
  expect((await PATCH(req(), { params: Promise.resolve({ id: 'job' }) })).status).toBe(200);
  expect(s.processed).toEqual([]);
  expect(s.queue).toHaveLength(1);
  await s.queue[0](); expect(s.processed).toEqual(['job']);
  s.previous = 'active'; s.queue = [];
  await PATCH(req(), { params: Promise.resolve({ id: 'job' }) });
  expect(s.queue).toHaveLength(0);
});
it('queues matching for an admin-published job without broadcasting to all seekers', async () => {
  const response = await POST(new NextRequest('http://localhost/api/admin/post-job', { method: 'POST', body: JSON.stringify({ company_id: 'company', title: 'Chef', description: 'Kitchen', category: 'Food & Beverage', job_type: 'full_time' }) }));
  expect(response?.status).toBe(200); expect(s.queue).toHaveLength(1);
  await s.queue[0](); expect(s.processed).toEqual(['job']);
});
