// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
const companyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const companyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const jobA = '11111111-1111-4111-8111-111111111111';
const jobB = '22222222-2222-4222-8222-222222222222';
it('enforces actual role grants, immutable duplicates, scoped range/day aggregation and cascade', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.job_listings (id uuid PRIMARY KEY, company_id uuid NOT NULL);
      GRANT SELECT ON public.job_listings TO service_role;
      INSERT INTO job_listings VALUES ('${jobA}', '${companyA}'), ('${jobB}', '${companyB}');`);
    await db.exec(readFileSync('supabase/migrations/20261027013119_employer_job_views.sql', 'utf8'));
    await db.exec(readFileSync('supabase/tests/job_views_rls.sql', 'utf8'));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for (const sql of ['SELECT * FROM job_views', `INSERT INTO job_views VALUES (gen_random_uuid(), '${jobA}', now(), 'job_page')`, "UPDATE job_views SET surface = 'job_pane'", 'DELETE FROM job_views', `SELECT * FROM employer_job_view_counts('${companyA}', now() - interval '7 days', now())`]) {
        await expect(db.exec(sql)).rejects.toThrow(/permission denied/);
      }
      await db.exec('RESET ROLE');
    }
    await db.exec(`SET ROLE service_role;
      INSERT INTO job_views VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '${jobA}', '2026-10-26T03:59:59Z', 'job_page'),
      ('aaaaaaaa-0000-4000-8000-000000000002', '${jobA}', '2026-10-26T04:00:00Z', 'job_pane'),
      ('aaaaaaaa-0000-4000-8000-000000000003', '${jobB}', '2026-10-26T04:00:00Z', 'job_page');
      INSERT INTO job_views VALUES ('aaaaaaaa-0000-4000-8000-000000000001', '${jobA}', now(), 'job_pane') ON CONFLICT (event_id) DO NOTHING;`);
    expect((await db.query(`SELECT job_id, day::text, views::int FROM employer_job_view_counts('${companyA}', '2026-10-25T04:00:00Z', '2026-10-27T04:00:00Z') ORDER BY day`)).rows).toEqual([{ job_id: jobA, day: '2026-10-25', views: 1 }, { job_id: jobA, day: '2026-10-26', views: 1 }]);
    expect((await db.query(`SELECT views::int FROM employer_job_view_counts('${companyA}', '2026-10-26T04:00:00Z', '2026-10-27T04:00:00Z')`)).rows).toEqual([{ views: 1 }]);
    for (const range of ["'2026-01-01', '2026-12-01'", "'2026-10-27', '2026-10-26'"]) expect((await db.query(`SELECT * FROM employer_job_view_counts('${companyA}', ${range})`)).rows).toEqual([]);
    await expect(db.exec("UPDATE job_views SET surface = 'job_pane'")).rejects.toThrow(/permission denied/);
    await expect(db.exec('DELETE FROM job_views')).rejects.toThrow(/permission denied/);
    await expect(db.exec(`INSERT INTO job_views VALUES (gen_random_uuid(), '${jobA}', now(), 'card')`)).rejects.toThrow(/check constraint/);
    await db.exec(`RESET ROLE; DELETE FROM job_listings WHERE id = '${jobA}'; SET ROLE service_role;`);
    expect((await db.query('SELECT job_id FROM job_views')).rows).toEqual([{ job_id: jobB }]);
  } finally { await db.close(); }
}, 30_000);
it('maintenance batches remove expired events and abuse buckets without deleting recent data', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE job_views (event_id uuid primary key, viewed_at timestamptz);
      CREATE TABLE rate_limits (bucket text primary key, window_started_at timestamptz);
      INSERT INTO job_views VALUES (gen_random_uuid(), now() - interval '91 days'), (gen_random_uuid(), now() - interval '89 days');
      INSERT INTO rate_limits VALUES ('job-view:old', now() - interval '2 days'), ('job-view:new', now()), ('other:old', now() - interval '2 days');`);
    await db.exec(readFileSync('supabase/maintenance/prune_job_views.sql', 'utf8'));
    expect((await db.query('SELECT count(*)::int AS count FROM job_views')).rows).toEqual([{ count: 1 }]);
    expect((await db.query('SELECT bucket FROM rate_limits ORDER BY bucket')).rows).toEqual([{ bucket: 'job-view:new' }, { bucket: 'other:old' }]);
  } finally { await db.close(); }
}, 30_000);
