import { readFileSync } from 'node:fs';

export const loadSql = path => readFileSync(path, 'utf8')
  .replace(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp";/g, '')
  .replace(/uuid_generate_v4\(\)/g, 'gen_random_uuid()');

// Fixture-only Supabase auth/storage surface. No network or real accounts.
// Works with PGlite and a dedicated empty PostgreSQL test database.
export async function setupClaimsDb(db) {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb,
      email_confirmed_at timestamptz, banned_until timestamptz);
    CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users);
    CREATE TABLE auth.refresh_tokens (id bigint GENERATED ALWAYS AS IDENTITY, user_id varchar);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
    CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
    CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
  `);
  await db.exec(loadSql('schema-clean.sql'));
  await db.exec(`ALTER TABLE public.users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
    ALTER TABLE public.job_listings ADD COLUMN posted_by_admin boolean DEFAULT false;`);
  await db.exec(loadSql('supabase/migrations/20260312_fix_admin_rls_final.sql'));
  await db.exec(loadSql('supabase/migrations/00004_fix_seeker_profiles_recursion.sql'));
  await db.exec(loadSql('supabase/migrations/20260601_security_hardening.sql'));
  await db.exec(loadSql('supabase/migrations/20260925_security_hardening_2.sql'));
  await db.exec(loadSql('supabase/migrations/20260930_company_claims.sql'));
  await db.exec(`GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.users, public.companies, public.job_listings TO authenticated;
    GRANT SELECT ON public.companies, public.job_listings TO anon;`);
}

export async function actAs(db, uid = '', role = 'service_role', sqlRole = 'postgres') {
  // IDs and roles here are fixed local fixtures, never user input.
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${uid}'; SET request.jwt.claim.role = '${role}'; SET ROLE ${sqlRole};`);
}

let sequence = 0;
export function uuid() { return `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`; }
export async function user(db, role = 'employer', email) {
  const id = uuid();
  await db.query(`INSERT INTO auth.users(id, email, raw_user_meta_data, email_confirmed_at)
    VALUES ($1, $2, $3, now())`, [id, email ?? `fixture-${id}@example.test`, JSON.stringify({ role })]);
  await db.query('UPDATE public.users SET email_verified = true WHERE id = $1', [id]);
  return id;
}
export async function fixture(db, name = 'Fixture Company') {
  await actAs(db);
  const employer = await user(db);
  const placeholder = await user(db, 'employer', `admin-company-${uuid()}@joblinkantigua.com`);
  const admin = await user(db);
  await db.query('UPDATE public.users SET is_admin = true WHERE id = $1', [admin]);
  const company = uuid();
  await db.query('INSERT INTO public.companies(id, user_id, company_name) VALUES ($1, $2, $3)', [company, placeholder, name]);
  const job = uuid();
  await db.query(`INSERT INTO public.job_listings(id, company_id, title, description, status, posted_by_admin)
    VALUES ($1, $2, 'Fixture Job', 'Test vacancy', 'active', true)`, [job, company]);
  // Deterministic test-only value, never used against a live service.
  const token = String(sequence).padStart(43, 'T');
  await db.query('SELECT public.create_company_claim($1, $2, $3)', [company, admin, token]);
  await db.query('INSERT INTO auth.sessions(user_id) VALUES ($1)', [placeholder]);
  await db.query('INSERT INTO auth.refresh_tokens(user_id) VALUES ($1)', [placeholder]);
  return { employer, placeholder, admin, company, job, token };
}
