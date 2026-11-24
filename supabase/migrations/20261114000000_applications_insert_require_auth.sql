-- ============================================================================
-- Migration 20261114000000: applications_insert_require_auth
-- Addresses: Bionic security report 2026-11-12, finding #6
--   "applications RLS is permissive for anonymous INSERT (LOW)"
-- Prepared as joblink-security-prep/01-applications-rls.sql; applied to
-- production 2026-11-13 (package log: APPLY-LOG-2026-11-13.md). The
-- conclusion below was corrected at apply time per REVIEW-2026-11-13.md.
-- ============================================================================
-- What the report found: an anonymous INSERT into public.applications passes
-- RLS and only fails later at a trigger (OUTBOX_IDENTITY_MISSING). The row is
-- blocked in practice, but the policy layer itself is too loose.
--
-- What the repo shows (checked 2026-11-13 in the joblink-notif clone,
-- supabase/migrations/): the ONLY insert policy defined for applications in
-- the migration history is "Seekers can insert applications"
-- (00002_fresh_schema.sql), which is already owner-scoped:
--   WITH CHECK (EXISTS (SELECT 1 FROM public.seeker_profiles
--               WHERE seeker_profiles.id = applications.seeker_id
--                 AND seeker_profiles.user_id = auth.uid()))
-- No permissive anon insert policy exists anywhere in the repo migrations.
--
-- CONCLUSION (CORRECTED 2026-11-13 at apply time, per
-- REVIEW-2026-11-13.md — the original draft of this paragraph claimed a
-- permissive INSERT policy exists in production; the live pre-checks run
-- for the post-merge review disproved that): NO permissive INSERT policy
-- exists in the live database. PC1 shows exactly one INSERT policy,
-- "Seekers can insert applications", on roles {public}, with the
-- canonical owner-scoped WITH CHECK referencing auth.uid(). PC3 shows
-- the anon role holds an INSERT table grant on applications (wide
-- Supabase default). The scan's observation (an anon insert reaching the
-- OUTBOX_IDENTITY_MISSING trigger) is fully explained without a
-- permissive policy: Postgres evaluates BEFORE INSERT triggers before
-- the RLS WITH CHECK, so the trigger error surfaces first and masks the
-- RLS denial behind it. What this migration therefore does in practice:
-- the step-1 sweep drops nothing (the canonical policy's check
-- references auth., so it survives), step 2 restates the policy
-- TO authenticated with the explicit (select auth.uid()) is not null
-- check, and step 3 revokes the anon INSERT grant — a real change, not
-- a no-op (PC3 verified the grant is present). The migration is still
-- written defensively: the pre-checks below MUST be run first and read,
-- and if the pre-check output differs from what is described here, STOP
-- and reconcile by hand before applying.
-- ============================================================================


-- ============================================================================
-- PRE-CHECKS — run these first, in the Supabase SQL editor, and read the
-- output before applying anything below.
-- ============================================================================

-- PC1. Every current policy on public.applications. Look for any INSERT
--      policy other than "Seekers can insert applications", especially one
--      whose with_check is "true", empty, or has roles {anon} or {public}.
-- select policyname, roles, cmd, qual, with_check
--   from pg_policies
--  where schemaname = 'public' and tablename = 'applications'
--  order by cmd, policyname;

-- PC2. Is RLS actually enabled on the table?
-- select relname, relrowsecurity, relforcerowsecurity
--   from pg_class
--  where relname = 'applications' and relnamespace = 'public'::regnamespace;
-- Expected: relrowsecurity = true.

-- PC3. Table-level grants. Note whether anon holds INSERT on applications.
-- select grantee, privilege_type
--   from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'applications'
--    and privilege_type in ('INSERT', 'SELECT', 'UPDATE', 'DELETE')
--  order by grantee, privilege_type;

-- PC4. Sanity: how do real applications get created? If any server route or
--      edge function inserts applications with the anon key while signed out
--      (it should not — applying requires an account), this change breaks it.
--      Check the codebase for service-role vs anon inserts into
--      applications, and confirm the apply flow runs authenticated.
--      (Grep the merged repo for: from('applications').insert )


-- ============================================================================
-- MIGRATION BODY — only after the pre-checks above have been read.
-- Idempotent and safe to re-run, matching project migration style.
-- ============================================================================

BEGIN;

-- 1. Drop every INSERT policy on applications whose check does not depend
--    on the caller's identity at all (no reference to auth.uid() or to the
--    current JWT). Policies like that are the hole the scan walked through:
--    they evaluate identically for a signed-out caller. The canonical
--    owner-scoped policy references auth.uid() inside its EXISTS subquery,
--    so it survives this sweep; it is restated explicitly in step 2 anyway.
--    If PC1 showed a permissive policy whose text DOES mention auth but is
--    still wrong, drop it by name here before running this file.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'applications'
       AND cmd = 'INSERT'
  LOOP
    IF pol.with_check IS NULL
       OR pol.with_check = 'true'
       OR pol.with_check NOT ILIKE '%auth.%' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.applications', pol.policyname);
      RAISE NOTICE 'Dropped permissive applications INSERT policy: %', pol.policyname;
    END IF;
  END LOOP;
END $$;

-- 2. Restate the canonical insert policy, tightened two ways versus the
--    00002 original: it applies TO authenticated only (the anon role cannot
--    satisfy it at all), and the authenticated check is explicit, up front,
--    as the report recommended — (select auth.uid()) is not null — before
--    the owner-scope EXISTS. A seeker can still only insert applications
--    whose seeker_id is their own seeker profile.
DROP POLICY IF EXISTS "Seekers can insert applications" ON public.applications;
CREATE POLICY "Seekers can insert applications"
  ON public.applications FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.seeker_profiles
      WHERE seeker_profiles.id = applications.seeker_id
        AND seeker_profiles.user_id = (select auth.uid())
    )
  );

-- 3. Belt and braces: the anon role never needs to write applications.
--    Revoking the table privilege means PostgREST refuses anon inserts
--    before RLS is even consulted. Authenticated keeps its grant (RLS still
--    decides row by row). SELECT/UPDATE/DELETE grants are untouched.
--    NOTE: if PC3 showed anon INSERT was already absent, this is a no-op.
REVOKE INSERT ON public.applications FROM anon;

COMMIT;


-- ============================================================================
-- POST-CHECKS — run after applying.
-- ============================================================================

-- V1. Re-run PC1. Expected afterwards, for cmd = 'INSERT': exactly one
--     policy, "Seekers can insert applications", roles {authenticated},
--     with_check mentioning auth.uid() and seeker_profiles.

-- V2. Behaviour test from the site (signed OUT, e.g. a private window with
--     the public anon key): attempt an insert into applications from the
--     DevTools console:
--       const { error } = await supabase.from('applications')
--         .insert({ job_id: '<any real job id>', seeker_id: '<any profile id>' });
--       console.log(error);
--     Expected NOW: a row-level security / permission error (Postgres
--     42501, "new row violates row-level security policy" or "permission
--     denied"). Before this fix the same call reached the
--     OUTBOX_IDENTITY_MISSING trigger instead — that difference is the
--     proof the fix landed.

-- V3. Behaviour test signed IN as a real seeker: apply to a live job
--     through the normal UI and confirm the application is created and
--     appears in the seeker's dashboard. Also confirm the employer sees
--     the application (employer forward flow unaffected).

-- ROLLBACK (if V3 fails): re-apply the 00002 definition —
--   DROP POLICY IF EXISTS "Seekers can insert applications" ON public.applications;
--   CREATE POLICY "Seekers can insert applications" ON public.applications
--     FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.seeker_profiles
--       WHERE seeker_profiles.id = applications.seeker_id
--         AND seeker_profiles.user_id = auth.uid()));
--   GRANT INSERT ON public.applications TO anon;
-- and investigate before re-applying.
