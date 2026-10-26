// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const owner = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const application = '33333333-3333-4333-8333-333333333333'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${owner}'::uuid $$;
    CREATE TABLE users(id uuid PRIMARY KEY);
    CREATE TABLE companies(id uuid PRIMARY KEY, user_id uuid, company_name text);
    CREATE TABLE job_listings(id uuid PRIMARY KEY, company_id uuid, title text, status text);
    CREATE TABLE applications(id uuid PRIMARY KEY, job_id uuid);
    INSERT INTO users VALUES('${owner}'),('${other}');
    INSERT INTO companies VALUES('${owner}','${owner}','Island Employer');
    INSERT INTO job_listings VALUES('${owner}','${owner}','Cook','active');
    INSERT INTO applications VALUES('${application}','${owner}');
    GRANT ALL ON users, companies, job_listings, applications TO service_role;`)
  await db.exec(readFileSync('supabase/migrations/20260928_placement_testimonials.sql', 'utf8'))
  await db.exec(readFileSync('supabase/migrations/20261026091500_job_closure_notifications.sql', 'utf8'))
}, 30_000)
afterAll(async () => { await db.close() })

it('persists a unique job/user delivery claim that service-role workers cannot duplicate or delete', async () => {
  await db.exec('SET ROLE service_role')
  try {
    await db.query('INSERT INTO job_closure_notification_log(job_id,user_id) VALUES($1,$2)', [owner, other])
    await expect(db.query('INSERT INTO job_closure_notification_log(job_id,user_id) VALUES($1,$2)', [owner, other])).rejects.toThrow('duplicate key')
    expect((await db.query('SELECT status FROM job_closure_notification_log')).rows).toEqual([{ status: 'claimed' }])
    await db.exec("UPDATE job_closure_notification_log SET status='sent', message_id='provider-id', sent_at=now()")
    await expect(db.exec('DELETE FROM job_closure_notification_log')).rejects.toThrow('permission denied')
  } finally { await db.exec('RESET ROLE') }
})

it.each(['anon', 'authenticated'])('denies %s access to the log and hire wrapper', async role => {
  await db.exec(`SET ROLE ${role}`)
  try {
    await expect(db.query('SELECT * FROM job_closure_notification_log')).rejects.toThrow('permission denied')
    await expect(db.query('INSERT INTO job_closure_notification_log(job_id,user_id) VALUES($1,$2)', [owner, owner])).rejects.toThrow('permission denied')
    await expect(db.query('SELECT confirm_placement_with_closure($1,$2,true)', [application, owner])).rejects.toThrow('permission denied')
  } finally { await db.exec('RESET ROLE') }
})

it('enables RLS and exposes no browser policies on delivery claims', async () => {
  expect((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='job_closure_notification_log'::regclass")).rows).toEqual([{ relrowsecurity: true }])
  expect((await db.query("SELECT * FROM pg_policies WHERE tablename='job_closure_notification_log'")).rows).toEqual([])
})

it('reports an active close only once while preserving the atomic hire and its ID', async () => {
  await db.exec("UPDATE job_listings SET status='active'; SET ROLE service_role")
  try {
    const first = await db.query<{ result: { placement_id: string; closed_job_id: string | null } }>(
      'SELECT confirm_placement_with_closure($1,$2,true) AS result', [application, owner])
    const second = await db.query('SELECT confirm_placement_with_closure($1,$2,true) AS result', [application, owner])
    expect(first.rows[0].result.closed_job_id).toBe(owner)
    expect(second.rows).toEqual([{ result: { placement_id: first.rows[0].result.placement_id, closed_job_id: null } }])
    expect((await db.query('SELECT count(*)::int AS n FROM placements')).rows).toEqual([{ n: 1 }])
    expect((await db.query('SELECT status FROM job_listings')).rows).toEqual([{ status: 'closed' }])
  } finally { await db.exec('RESET ROLE') }
})

it('does not report a pending rejection as an applicant closure', async () => {
  await db.exec("UPDATE job_listings SET status='pending_approval'")
  const result = await db.query<{ result: { closed_job_id: string | null } }>(
    'SELECT confirm_placement_with_closure($1,$2,true) AS result', [application, owner])
  expect(result.rows[0].result.closed_job_id).toBeNull()
  expect((await db.query('SELECT status FROM job_listings')).rows).toEqual([{ status: 'closed' }])
})

it('leaves a job open when confirming a hire without closing it', async () => {
  await db.exec("UPDATE job_listings SET status='active'")
  const result = await db.query<{ result: { closed_job_id: string | null } }>(
    'SELECT confirm_placement_with_closure($1,$2,false) AS result', [application, owner])
  expect(result.rows[0].result.closed_job_id).toBeNull()
  expect((await db.query('SELECT status FROM job_listings')).rows).toEqual([{ status: 'active' }])
})

it('rejects another employer before any close', async () => {
  await expect(db.query('SELECT confirm_placement_with_closure($1,$2,true)', [application, other])).rejects.toThrow('not owned')
  expect((await db.query('SELECT status FROM job_listings')).rows).toEqual([{ status: 'active' }])
})
