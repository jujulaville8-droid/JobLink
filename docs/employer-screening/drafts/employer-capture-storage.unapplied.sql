-- UNAPPLIED REVIEW DRAFT. No live changes, provisioning, or activation.
-- Keep outside supabase/migrations. Execute only in a disposable synthetic database
-- until storage deployment and the wider employer-screening rollout are approved.
-- Prerequisite: the standard Supabase storage schema, roles, grants, and RLS exist.
-- This draft changes no global grants, bucket settings, or feature gates.
BEGIN;

-- A policy is ineffective when RLS is disabled. Refuse that state rather than
-- enabling RLS globally here and changing behavior for unrelated buckets.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage' AND c.relname = 'objects' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'EMPLOYER_CAPTURE_STORAGE_RLS_REQUIRED';
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employer-screening-captures', 'employer-screening-captures', false,
  5242880, ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Never silently repair or loosen an existing bucket. Unknown/null metadata and
-- every mismatch require separate review. Lock the row through this transaction.
DO $$
DECLARE capture_bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO STRICT capture_bucket FROM storage.buckets
    WHERE id = 'employer-screening-captures' FOR UPDATE;
  IF capture_bucket.name IS DISTINCT FROM 'employer-screening-captures'
    OR capture_bucket.public IS DISTINCT FROM false
    OR capture_bucket.file_size_limit IS DISTINCT FROM 5242880::bigint
    OR capture_bucket.allowed_mime_types IS DISTINCT FROM ARRAY['application/pdf']::text[]
  THEN
    RAISE EXCEPTION 'EMPLOYER_CAPTURE_BUCKET_METADATA_CONFLICT';
  END IF;
END $$;

-- Like resume_writing_no_browser_objects, this is RESTRICTIVE, so unrelated
-- permissive policies cannot grant browser access to captures. USING protects
-- existing rows; WITH CHECK also prevents writes/moves into the capture bucket.
-- It adds no permissions and leaves other buckets' existing policies unchanged.
-- Trusted server storage operations retain the existing service_role RLS bypass.
CREATE POLICY employer_screening_no_browser_captures ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated
USING (bucket_id <> 'employer-screening-captures')
WITH CHECK (bucket_id <> 'employer-screening-captures');

COMMIT;
