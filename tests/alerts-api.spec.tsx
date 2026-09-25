import { beforeEach, expect, it, vi } from 'vitest';
import * as route from '@/app/api/alerts/route';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({ user: { id: 'owner', email: 'owner@example.com', email_confirmed_at: '2026-01-01' } as Record<string, unknown> | null, rows: [] as Record<string, unknown>[], fail: false }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
  from: (table: string) => {
    const filters: [string, unknown][] = []; let op = 'read'; let payload: Record<string, unknown> = {};
    const execute = () => {
      if (state.fail) return { data: null, error: { message: 'offline' } };
      if (table === 'users') return { data: { email_verified: true, is_banned: false }, error: null };
      if (table === 'seeker_profiles') return { data: { id: 'profile' }, error: null };
      let data = state.rows.filter(r => filters.every(([k, v]) => r[k] === v));
      if (op === 'insert') { data = [{ ...payload, id: 'new-id', created_at: '2026-09-24' }]; state.rows.push(...data); }
      if (op === 'update') { data.forEach(r => Object.assign(r, payload)); }
      if (op === 'delete') state.rows = state.rows.filter(r => !data.includes(r));
      return { data, error: null };
    };
    const q = { select: () => q, order: () => q, eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
      is: (k: string, v: unknown) => { filters.push([k, v]); return q; }, contains: () => q,
      insert: (p: Record<string, unknown>) => { op = 'insert'; payload = p; return q; }, update: (p: Record<string, unknown>) => { op = 'update'; payload = p; return q; }, delete: () => { op = 'delete'; return q; },
      single: async () => { const r = execute(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; }, maybeSingle: async () => { const r = execute(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(execute()).then(resolve) };
    return q;
  }
}) }));
const req = (body: unknown, method = 'POST') => new NextRequest('http://localhost/api/alerts', { method, body: JSON.stringify(body) });
beforeEach(() => { state.user = { id: 'owner', email: 'owner@example.com', email_confirmed_at: '2026-01-01' }; state.rows = []; state.fail = false; });
it('rejects whitespace-only and malformed criteria', async () => {
  for (const body of [{ keywords: ['  '] }, { keywords: [12] }, { industry: 'invented' }, { job_type: {} }]) expect((await route.POST(req(body))).status).toBe(400);
});
it('returns normalized saved data and treats exact keyword sets as duplicates', async () => {
  const response = await route.POST(req({ keywords: [' Chef ', 'chef', 'Cook'] }));
  expect(response.status).toBe(201);
  expect((await response.json()).alert.keywords).toEqual(['chef', 'cook']);
  expect((await route.POST(req({ keywords: ['COOK', 'chef'] }))).status).toBe(409);
  expect((await route.POST(req({ keywords: ['chef'] }))).status).toBe(201);
});
it('protects reads and mutations from anonymous requests', async () => {
  state.user = null;
  expect((await route.GET()).status).toBe(401);
  expect((await route.POST(req({ keywords: ['chef'] }))).status).toBe(401);
  expect((await route.PATCH(req({}, 'PATCH'))).status).toBe(401);
  expect((await route.DELETE(req({}, 'DELETE'))).status).toBe(401);
});
it('does not update or delete another seeker’s alert', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  state.rows = [{ id, seeker_id: 'other', keywords: ['chef'] }];
  expect((await route.PATCH(req({ id, keywords: ['cook'] }, 'PATCH'))).status).toBe(404);
  expect((await route.DELETE(req({ id }, 'DELETE'))).status).toBe(404);
  expect(state.rows[0].keywords).toEqual(['chef']);
});
it('does not show database failures as an empty successful list', async () => {
  state.fail = true;
  expect((await route.GET()).status).toBe(503);
});
