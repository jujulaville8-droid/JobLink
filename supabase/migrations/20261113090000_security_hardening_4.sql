-- ============================================================================
-- Security hardening, round 4 (JobLink Verified build step 1)
-- ============================================================================
-- Groundwork that protects the site whether or not Verified launches:
--
--   1. Functions Supabase's linter flags for a role-mutable search_path.
--   2. SECURITY DEFINER functions that are callable through /rest/v1/rpc but
--      are never meant to be called by a browser.
--   3. Type and size limits on the CV bucket (previously any type, 50 MB).
--   4. "Delete listing" becomes close and hide, so applications (and later the
--      verified-document sharing records that hang off them) are kept.
--
-- Checked against production (hfcfuvbyqxkvnenfykex) on 2026-11-13.
-- Everything here is idempotent and safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Pin search_path
-- ----------------------------------------------------------------------------
-- Bodies are unchanged. Every object they touch is schema-qualified or lives
-- in pg_catalog, which is always searched.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.update_conversation_last_message()',
    'public.unarchive_on_new_message()',
    'public.update_updated_at()',
    'public.is_admin()',
    'public.is_employer()',
    'public.auth_user_role()'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public', fn);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Stop browsers calling functions that are not an API
-- ----------------------------------------------------------------------------
-- Trigger functions: Postgres checks EXECUTE when the trigger is created, not
-- when it fires, so revoking it changes nothing for the tables they guard.
--
-- prune_rate_limits: maintenance only; any signed-in user could previously
-- wipe rate-limit windows older than a day.
--
-- is_admin / is_employer / auth_user_role: legacy helpers that read the
-- client-influenced role. No policy, view or function references them (checked
-- in pg_policies, pg_views and pg_proc), so they are closed to browsers.
--
-- Deliberately left callable, because row-level policies evaluate them as the
-- querying role: is_admin_user() and is_employer_of_applicant(uuid, uuid).
-- The company_owners view also stays as it is: it is intentionally a
-- definer view exposing only (id, user_id) to signed-in users so applications
-- and messages can be routed for confidential employers (20261110010000).
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.protect_company_claim_fields()',
    'public.unarchive_on_new_message()',
    'public.update_conversation_last_message()',
    'public.prune_rate_limits()',
    'public.is_admin()',
    'public.is_employer()',
    'public.auth_user_role()'
  ] LOOP
    IF to_regprocedure(fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. CV bucket: allowed types and a 20 MB ceiling
-- ----------------------------------------------------------------------------
-- Mirrors CV_TYPES and MAX_CV_BYTES in src/lib/cv-upload.ts. The browser always
-- uploads with one of these content types, chosen by the server.
UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif'
    ]
WHERE id = 'cvs';

-- ----------------------------------------------------------------------------
-- 4. Close and hide instead of delete
-- ----------------------------------------------------------------------------
-- applications.job_id cascades, so deleting a listing permanently deleted its
-- applications, conversations and placements. Employers now close the listing
-- and hide it from their own list; the row and its applications remain.
ALTER TABLE public.job_listings
  ADD COLUMN IF NOT EXISTS employer_hidden_at timestamptz;

COMMENT ON COLUMN public.job_listings.employer_hidden_at IS
  'Set when the employer removes a listing that has applications. The listing is closed and hidden from My Listings; nothing is deleted.';

COMMIT;
