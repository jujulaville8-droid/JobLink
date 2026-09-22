import { PGlite } from '@electric-sql/pglite'
import { readFile, readdir } from 'node:fs/promises'

export async function testDatabase(restoredShape = false) {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,owner_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array($1,'/') $$;
    CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
    GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
  `)
  // Legacy baseline is only ever run in this fresh, in-memory database.
  await db.exec((await readFile('supabase/reset/legacy_fresh_schema.sql','utf8')).replace('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";', ''))
  const baseline = ['00004_fix_seeker_profiles_recursion.sql','20260312_add_is_admin_column.sql',
    '20260312_fix_admin_rls_final.sql','20260314_add_messaging.sql', '20260314_add_message_attachments.sql',
    '20260315_fix_candidate_visibility_rls.sql','20260315_messaging_enhancements.sql', '20260315_dialogue_gating.sql',
    '20260322_cv_builder.sql','20260322_fix_display_name_priority.sql','20260323_admin_posted_flag.sql',
    '20260325_signup_reminders.sql']
  await db.exec('ALTER TABLE public.seeker_profiles ADD COLUMN avatar_url text;')
  for (const name of baseline) {
    const sql=(await readFile(`supabase/migrations/${name}`, 'utf8')).replace(/^ALTER PUBLICATION.*;$/gm,'')
    try { await db.exec(sql) } catch (e) { throw new Error(`Baseline ${name}: ${e}`) }
  }
  if (restoredShape) await db.exec(`
    CREATE TABLE public.subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid REFERENCES companies(id),stripe_subscription_id text UNIQUE,stripe_customer_id text,status text,current_period_end timestamptz,created_at timestamptz DEFAULT now());
    CREATE TABLE public.ai_purchases(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),feature text NOT NULL,stripe_session_id text,purchased_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.ai_usage(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),feature text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.ai_resume_previews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES users(id),preview_data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE public.cv_projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cv_profile_id uuid NOT NULL REFERENCES cv_profiles(id),title text NOT NULL,role text,url text,description text,start_date text,end_date text,sort_order integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now());
    CREATE TABLE public.cv_volunteer(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cv_profile_id uuid NOT NULL REFERENCES cv_profiles(id),organization text NOT NULL,role text,description text,start_date text,end_date text,is_current boolean,sort_order integer NOT NULL DEFAULT 0,created_at timestamptz DEFAULT now());
  `)
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public,storage,auth TO service_role; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated; GRANT SELECT ON public.job_listings,public.companies TO anon;')
  for (const name of (await readdir('supabase/migrations')).filter(n=>n.startsWith('20260922')).sort()) {
    try { await db.exec(await readFile(`supabase/migrations/${name}`,'utf8')) } catch(e) { throw new Error(`Migration ${name}: ${e}`) }
  }
  return db
}
export async function asUser(db: PGlite, id: string, role = 'authenticated') {
  await db.exec(`RESET ROLE; SET ROLE ${role};`)
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role])
}
export async function system(db: PGlite) { await asUser(db, '', 'service_role') }
export const ids = { seeker:'00000000-0000-4000-8000-000000000001', employer:'00000000-0000-4000-8000-000000000002', stranger:'00000000-0000-4000-8000-000000000003', company:'00000000-0000-4000-8000-000000000004', profile:'00000000-0000-4000-8000-000000000005', job:'00000000-0000-4000-8000-000000000006', application:'00000000-0000-4000-8000-000000000007', conversation:'00000000-0000-4000-8000-000000000008' }
export async function seed(db:PGlite) {
 await system(db)
 for(const [id,role] of [[ids.seeker,'seeker'],[ids.employer,'employer'],[ids.stranger,'seeker']]) {
  await db.query('INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,$3)',[id,`${role}-${id}@example.test`,JSON.stringify({role})])
 }
 await db.query("INSERT INTO public.companies(id,user_id,company_name) VALUES($1,$2,'Test employer')",[ids.company,ids.employer])
 await db.query("INSERT INTO public.seeker_profiles(id,user_id,first_name,visibility) VALUES($1,$2,'Test candidate','open')",[ids.profile,ids.seeker])
 await db.query("INSERT INTO public.job_listings(id,company_id,title,description,status) VALUES($1,$2,'Test job','Description','active')",[ids.job,ids.company])
}
