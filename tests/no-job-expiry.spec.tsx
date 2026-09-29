import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/expire-listings/route';
const db = vi.hoisted(() => ({ writes: 0 }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => {
  const q = { update: () => { db.writes++; return q; }, eq: () => q, not: () => q, lte: () => q, select: async () => ({ data: [], error: null }) };
  return q;
} }) }));
afterEach(() => { vi.unstubAllEnvs(); db.writes = 0; });
it('never closes jobs when a legacy expiry scheduler calls the endpoint', async () => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  const response = await GET(new NextRequest('http://localhost/api/cron/expire-listings', { headers: { authorization: 'Bearer test-secret' } }));
  expect(response.status).toBe(200);
  expect(db.writes).toBe(0);
  expect(await response.json()).toMatchObject({ closed_count: 0, disabled: true });
});
it('keeps the retired scheduler endpoint protected', async () => {
  vi.stubEnv('CRON_SECRET', 'test-secret');
  expect((await GET(new NextRequest('http://localhost/api/cron/expire-listings'))).status).toBe(401);
  expect(db.writes).toBe(0);
});
