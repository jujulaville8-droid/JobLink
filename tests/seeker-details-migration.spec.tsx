// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const seekerUser = '11111111-1111-4111-8111-111111111111'
const otherSeekerUser = '22222222-2222-4222-8222-222222222222'
const employerUser = '33333333-3333-4333-8333-333333333333'
const adminUser = '44444444-4444-4444-8444-444444444444'
const seekerProfile = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const otherProfile = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const migration = readFileSync('supabase/migrations/20261015190000_seeker_profile_details.sql', 'utf8')
let db: PGlite

async function as<T>(role: 'anon' | 'authenticated', uid: string | null, action: () => Promise<T>): Promise<T> {
  await db.exec(`SELECT set_config('test.uid', '${uid ?? ''}', false); SET ROLE ${role}`)
  try { return await action() } finally { await db.exec('RESET ROLE') }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
    CREATE TABLE public.users (id uuid PRIMARY KEY, role text, is_admin boolean NOT NULL DEFAULT false);
    CREATE FUNCTION public.is_admin_user() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
      SELECT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false) $$;
    CREATE TABLE public.seeker_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL, first_name text);
    ALTER TABLE public.seeker_profiles ENABLE ROW LEVEL SECURITY;
    -- Employers can read seeker profiles (mirrors production browse/applicant policies).
    CREATE POLICY read_all ON public.seeker_profiles FOR SELECT USING (true);
    CREATE POLICY own_update ON public.seeker_profiles FOR UPDATE USING (user_id = auth.uid());
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.seeker_profiles TO anon, authenticated;
    INSERT INTO public.users VALUES ('${seekerUser}', 'seeker', false), ('${otherSeekerUser}', 'seeker', false),
      ('${employerUser}', 'employer', false), ('${adminUser}', 'seeker', true);
    INSERT INTO public.seeker_profiles VALUES ('${seekerProfile}', '${seekerUser}', 'Ada'), ('${otherProfile}', '${otherSeekerUser}', 'Ben');`)
  await db.exec(migration)
  await db.exec(migration) // idempotent
}, 20000)
afterAll(async () => { await db.close() })

describe('seeker profile details migration', () => {
  it('lets seekers save practical details on their own profile, validated by constraints', async () => {
    await as('authenticated', seekerUser, () => db.exec(`UPDATE public.seeker_profiles SET currently_employed = false,
      availability = ARRAY['part_time','weekends'], languages = ARRAY['English'], notice_period = 'two_weeks',
      earliest_start_date = '2026-11-01' WHERE id = '${seekerProfile}'`))
    const { rows } = await as('authenticated', employerUser, () => db.query<{ currently_employed: boolean }>(
      `SELECT currently_employed FROM public.seeker_profiles WHERE id = '${seekerProfile}'`))
    expect(rows).toEqual([{ currently_employed: false }])
    await expect(db.exec(`UPDATE public.seeker_profiles SET availability = ARRAY['nights'] WHERE id = '${seekerProfile}'`)).rejects.toThrow()
    await expect(db.exec(`UPDATE public.seeker_profiles SET notice_period = 'forever' WHERE id = '${seekerProfile}'`)).rejects.toThrow()
  })

  it('lets only the owner write sensitive details', async () => {
    await as('authenticated', seekerUser, () => db.exec(
      `INSERT INTO public.seeker_sensitive_details (seeker_id, marital_status, children_count) VALUES ('${seekerProfile}', 'married', 2)`))
    await expect(as('authenticated', otherSeekerUser, () => db.exec(
      `INSERT INTO public.seeker_sensitive_details (seeker_id, marital_status) VALUES ('${otherProfile}', 'single'), ('${seekerProfile}', 'single')`))).rejects.toThrow()
    await expect(as('authenticated', employerUser, () => db.exec(
      `INSERT INTO public.seeker_sensitive_details (seeker_id, marital_status) VALUES ('${otherProfile}', 'single')`))).rejects.toThrow()
    await as('authenticated', otherSeekerUser, () => db.exec(`UPDATE public.seeker_sensitive_details SET children_count = 9`))
    expect((await db.query('SELECT children_count FROM public.seeker_sensitive_details')).rows).toEqual([{ children_count: 2 }])
  })

  it('hides sensitive details from employers, other seekers and anon; admins and the owner can read them', async () => {
    const read = 'SELECT marital_status, children_count FROM public.seeker_sensitive_details'
    expect((await as('authenticated', employerUser, () => db.query(read))).rows).toEqual([])
    expect((await as('authenticated', otherSeekerUser, () => db.query(read))).rows).toEqual([])
    await expect(as('anon', null, () => db.query(read))).rejects.toThrow('permission denied')
    expect((await as('authenticated', adminUser, () => db.query(read))).rows).toEqual([{ marital_status: 'married', children_count: 2 }])
    expect((await as('authenticated', seekerUser, () => db.query(read))).rows).toEqual([{ marital_status: 'married', children_count: 2 }])
  })

  it('rejects out-of-range sensitive values and cascades on profile deletion', async () => {
    await expect(db.exec(`UPDATE public.seeker_sensitive_details SET children_count = 21`)).rejects.toThrow()
    await expect(db.exec(`UPDATE public.seeker_sensitive_details SET marital_status = 'complicated'`)).rejects.toThrow()
    await db.exec(`DELETE FROM public.seeker_profiles WHERE id = '${seekerProfile}'`)
    expect((await db.query('SELECT count(*)::int AS n FROM public.seeker_sensitive_details')).rows).toEqual([{ n: 0 }])
  })
})
