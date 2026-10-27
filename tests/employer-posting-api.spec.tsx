// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { EMPTY_POSTING } from '@/lib/job-posting';
const state = vi.hoisted(() => ({ auth: vi.fn(), existing: null as null | { id: string; status: string }, writes: [] as Record<string, unknown>[], filters: [] as unknown[][], queued: [] as (() => Promise<void>)[], mail: vi.fn(), fail: false, company: true, noRow: false }));
vi.mock('@/lib/api-auth', () => ({ requireUser: state.auth, requireVerifiedUser: state.auth }));
vi.mock('@/lib/email', () => ({ sendEmail: state.mail }));
vi.mock('next/server', async original => ({ ...await original<object>(), after: (fn: () => Promise<void>) => state.queued.push(fn) }));
import { GET, POST } from '@/app/api/employer/listings/route';
const id = 'aa778811-1111-4111-8111-123456789012';
const form = { ...EMPTY_POSTING, title: 'Chef', description: 'Prepare meals.', location: 'St Johns', category: 'Food & Beverage' };
const send = (action: string, values = form) => POST(new NextRequest('https://joblinkantigua.com/api/employer/listings', { method: 'POST', body: JSON.stringify({ id, action, step: 2, form: values }) }));
beforeEach(() => {
  state.existing = null; state.writes = []; state.filters = []; state.queued = []; state.fail = false; state.company = true; state.noRow = false; state.mail.mockReset();
  state.auth.mockResolvedValue({ user: { id: 'owner', email: 'owner@example.com' }, supabase: { from: (table: string) => {
    let write: Record<string, unknown> | null = null;
    const query = {
      select: () => query, eq: (...args: unknown[]) => { state.filters.push(args); return query; }, in: () => query, order: () => query, limit: () => query,
      update: (value: Record<string, unknown>) => { write = value; state.writes.push(value); return query; },
      insert: (value: Record<string, unknown>) => { write = value; state.writes.push(value); return query; },
      single: async () => ({ data: state.company ? { id: 'company', company_name: 'Island Kitchen', contact_email: 'hiring@example.com' } : null }),
      maybeSingle: async () => {
        if (table === 'companies') return { data: state.company ? { id: 'company' } : null };
        if (write) return { data: state.noRow ? null : { id, status: write.status || state.existing?.status, title: 'Chef' }, error: state.fail ? {} : null };
        return { data: state.existing, error: null };
      },
    }; return query;
  } } });
});
it('saves incomplete drafts without emails and keeps draft descriptions private in draft_data', async () => {
  expect((await send('draft', { ...EMPTY_POSTING, description: 'Work in progress' })).status).toBe(200);
  expect(state.writes[0]).toMatchObject({ status: 'draft', description: '', draft_data: { form: { description: 'Work in progress' }, step: 2 }, company_id: 'company' });
  expect(state.queued).toHaveLength(0);
});
it('transitions draft to pending review and schedules employer and admin emails exactly once', async () => {
  state.existing = { id, status: 'draft' };
  expect((await send('submit')).status).toBe(200);
  expect(state.writes[0]).toMatchObject({ status: 'pending_approval', expires_at: null, title: 'Chef', description: 'Prepare meals.' });
  expect(state.filters).toContainEqual(['status', 'draft']);
  await state.queued[0]();
  expect(state.mail).toHaveBeenCalledTimes(2);
  expect(state.mail).toHaveBeenCalledWith(expect.objectContaining({ to: 'hiring@example.com', type: 'listing_submitted', idempotencyKey: `listing-submitted/${id}/employer` }));
  expect(state.mail).toHaveBeenCalledWith(expect.objectContaining({ to: 'julianlaville@gmail.com', type: 'listing_submitted_admin' }));
  state.existing = { id, status: 'pending_approval' };
  expect((await send('submit')).status).toBe(200);
  expect(state.queued).toHaveLength(1);
});
it('creates a new pending listing if submit precedes the autosave timer', async () => {
  expect((await send('submit')).status).toBe(200);
  expect(state.writes[0]).toMatchObject({ company_id: 'company', status: 'pending_approval', requires_work_permit: false, expires_at: null });
});
it('keeps edit moderation in the database and never sends submission emails on edits', async () => {
  state.existing = { id, status: 'active' };
  expect((await send('edit')).status).toBe(200);
  expect(state.writes[0]).not.toHaveProperty('status');
  expect(state.filters).toContainEqual(['company_id', 'company']);
  expect(state.queued).toHaveLength(0);
});
it('rejects missing required fields, invalid pay and unsupported enums', async () => {
  expect((await send('submit', EMPTY_POSTING)).status).toBe(400);
  expect((await send('submit', { ...form, salary_min: '100', salary_max: '25' })).status).toBe(400);
  expect((await send('draft', { ...form, salary_min: '-1' })).status).toBe(400);
  expect(state.writes).toHaveLength(0);
});
it('rejects unauthenticated requests before reading or writing', async () => {
  state.auth.mockResolvedValue({ error: NextResponse.json({}, { status: 401 }) });
  expect((await send('submit')).status).toBe(401);
  expect(state.writes).toHaveLength(0);
});
it('does not notify on database failure or a lost conditional update', async () => {
  state.fail = true;
  expect((await send('submit')).status).toBe(409);
  state.fail = false; state.noRow = true; state.existing = { id, status: 'draft' };
  expect((await send('submit')).status).toBe(409);
  expect(state.queued).toHaveLength(0);
});
it('cannot overwrite submitted listings with a late autosave or edit someone else’s listing', async () => {
  state.existing = { id, status: 'pending_approval' };
  expect((await send('draft')).status).toBe(409);
  state.existing = null;
  expect((await send('edit')).status).toBe(409);
  expect(state.writes).toHaveLength(0);
});
it('loads only the owner’s draft and returns setup for a missing company', async () => {
  state.existing = { id, status: 'draft' };
  const result = await GET(new NextRequest('https://joblinkantigua.com/api/employer/listings'));
  expect((await result.json()).listing.status).toBe('draft');
  expect(state.filters).toContainEqual(['company_id', 'company']);
  expect(state.filters).toContainEqual(['status', 'draft']);
  state.company = false;
  expect(await (await GET(new NextRequest('https://joblinkantigua.com/api/employer/listings'))).json()).toEqual({ setup: true });
});
