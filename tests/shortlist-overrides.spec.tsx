// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { NextRequest, NextResponse } from 'next/server';
import { DELETE, POST } from '@/app/api/shortlist/overrides/route';

type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ requireVerifiedUser: mocks.auth }));

function fakeDb() {
  const rows: Record<string, Row[]> = {
    applications: [{ id: 'app-1', job_id: 'job-1' }, { id: 'app-2', job_id: 'job-2' }],
    job_listings: [{ id: 'job-1', company_id: 'co-1' }, { id: 'job-2', company_id: 'co-2' }],
    companies: [{ id: 'co-1', user_id: 'owner' }, { id: 'co-2', user_id: 'someone-else' }],
  };
  type DbError = null | { code: string; message: string };
  const upsert = vi.fn<(row: Row, options: unknown) => Promise<{ error: DbError }>>(async () => ({ error: null }));
  const deleted: [string, unknown][][] = [];
  const deleteResult = { error: null as null | { code: string; message: string } };
  const from = vi.fn((table: string) => {
    const filters: [string, unknown][] = [];
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { filters.push([field, value]); return query; },
      single: async () => {
        const row = (rows[table] ?? []).find(r => filters.every(([f, v]) => r[f] === v));
        return row ? { data: row, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      },
      upsert,
      delete: () => {
        const del = {
          eq: (field: string, value: unknown) => { filters.push([field, value]); return del; },
          then: (resolve: (r: unknown) => unknown) => { deleted.push([...filters]); return Promise.resolve(deleteResult).then(resolve); },
        };
        return del;
      },
    };
    return query;
  });
  return { from, upsert, deleted, deleteResult };
}

let db: ReturnType<typeof fakeDb>;
beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb();
  mocks.auth.mockResolvedValue({ user: { id: 'owner' }, supabase: db, isAdmin: false });
});

const req = (method: string, body: unknown) =>
  new NextRequest('https://example.test/api/shortlist/overrides', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

it('requires a verified user', async () => {
  mocks.auth.mockResolvedValue({ error: NextResponse.json({ error: 'Please verify your email first' }, { status: 403 }) });
  const res = await POST(req('POST', { applicationId: 'app-1', action: 'pin' }));
  expect(res.status).toBe(403);
  expect(db.from).not.toHaveBeenCalled();
});

it('rejects invalid payloads', async () => {
  expect((await POST(req('POST', { applicationId: 'app-1', action: 'promote' }))).status).toBe(400);
  expect((await POST(req('POST', { action: 'pin' }))).status).toBe(400);
  expect(db.upsert).not.toHaveBeenCalled();
});

it('refuses applications to another company and unknown applications', async () => {
  const foreign = await POST(req('POST', { applicationId: 'app-2', action: 'remove' }));
  expect(foreign.status).toBe(403);
  const missing = await POST(req('POST', { applicationId: 'nope', action: 'remove' }));
  expect(missing.status).toBe(404);
  expect(db.upsert).not.toHaveBeenCalled();
  const foreignDelete = await DELETE(req('DELETE', { applicationId: 'app-2', action: 'remove' }));
  expect(foreignDelete.status).toBe(403);
  expect(db.deleted).toHaveLength(0);
});

it('inserts an override for the owning employer', async () => {
  const res = await POST(req('POST', { applicationId: 'app-1', action: 'pin' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ success: true, persisted: true });
  expect(db.upsert).toHaveBeenCalledWith(
    { application_id: 'app-1', employer_id: 'owner', action: 'pin' },
    { onConflict: 'application_id,action', ignoreDuplicates: true },
  );
  expect(db.from).toHaveBeenCalledWith('shortlist_overrides');
});

it('deletes only the employer\'s own override row', async () => {
  const res = await DELETE(req('DELETE', { applicationId: 'app-1', action: 'remove' }));
  expect(res.status).toBe(200);
  expect(db.deleted).toEqual([[['application_id', 'app-1'], ['employer_id', 'owner'], ['action', 'remove']]]);
});

it('returns persisted:false when the table is not installed yet', async () => {
  db.upsert.mockResolvedValueOnce({ error: { code: '42P01', message: 'relation "shortlist_overrides" does not exist' } });
  const res = await POST(req('POST', { applicationId: 'app-1', action: 'interview' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ persisted: false });
  db.deleteResult.error = { code: 'PGRST205', message: "Could not find the table 'public.shortlist_overrides'" };
  const del = await DELETE(req('DELETE', { applicationId: 'app-1', action: 'pin' }));
  expect(del.status).toBe(200);
  expect(await del.json()).toMatchObject({ persisted: false });
});

it('migration: RLS limits overrides and opens to the owning employer', async () => {
  const db = new PGlite();
  const owner = '00000000-0000-4000-8000-000000000002';
  const other = '00000000-0000-4000-8000-000000000005';
  const appId = '00000000-0000-4000-8000-000000000004';
  const jobId = '00000000-0000-4000-8000-000000000003';
  const insertOverride = (employer: string, action = 'pin') =>
    db.exec(`insert into shortlist_overrides(application_id, employer_id, action) values ('${appId}', '${employer}', '${action}')`);
  const upsertOpen = (employer: string) =>
    db.exec(`insert into shortlist_opens(employer_id, job_id) values ('${employer}', '${jobId}') on conflict (employer_id, job_id) do update set opened_at = now()`);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
      create table public.companies(id uuid primary key, user_id uuid);
      create table public.job_listings(id uuid primary key, company_id uuid);
      create table public.applications(id uuid primary key, job_id uuid);
      grant usage on schema auth to authenticated;
      grant select on companies, job_listings, applications to authenticated;
      insert into companies values ('00000000-0000-4000-8000-000000000001', '${owner}');
      insert into job_listings values ('${jobId}', '00000000-0000-4000-8000-000000000001');
      insert into applications values ('${appId}', '${jobId}');`);
    await db.exec(readFileSync('supabase/migrations/20261119000000_shortlist_overrides.sql', 'utf8'));

    await db.exec(`set role authenticated; set test.uid = '${other}'`);
    await expect(insertOverride(other)).rejects.toThrow(/row-level security/);
    await expect(insertOverride(owner)).rejects.toThrow(/row-level security/);
    await expect(upsertOpen(other)).rejects.toThrow(/row-level security/);

    await db.exec(`set test.uid = '${owner}'`);
    await insertOverride(owner);
    await upsertOpen(owner);
    await upsertOpen(owner);
    await expect(insertOverride(owner, 'promote')).rejects.toThrow(/check constraint/);
    expect((await db.query('select * from shortlist_overrides')).rows).toHaveLength(1);
    expect((await db.query('select * from shortlist_opens')).rows).toHaveLength(1);

    await db.exec(`set test.uid = '${other}'`);
    expect((await db.query('select * from shortlist_overrides')).rows).toHaveLength(0);
    await db.exec('delete from shortlist_overrides');
    await db.exec(`set test.uid = '${owner}'`);
    expect((await db.query('select * from shortlist_overrides')).rows).toHaveLength(1);

    await db.exec('reset role; set role anon');
    await expect(db.query('select * from shortlist_overrides')).rejects.toThrow('permission denied');
  } finally {
    await db.close();
  }
}, 20000);
