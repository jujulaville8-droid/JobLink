-- ============================================================================
-- JobLink Verified: free right-to-work check
-- ============================================================================
-- DO NOT APPLY to production until the Labour Department has confirmed the
-- accepted documents. Nothing reads these tables while VERIFICATION_ENABLED
-- is off.
--
-- A job seeker uploads one right-to-work document (ID, passport, residency
-- document, Skills Certificate or work permit). A JobLink reviewer checks it is
-- genuine, current and theirs. The image is deleted at the decision; only the
-- result is kept: the right-to-work group, the type of document, its expiry and
-- when the check was done. There is no fee and no police record.
--
--   seeker_verifications   one row per check
--   verification_shares    which application carried the confirmation
--   verification_views     each time an employer opens a confirmation
--   verification_events    the audit log
--   verification_settings  a single row holding the upload switch
--   storage bucket verification-private (encrypted ID images, no browser access)
--
-- Rules enforced here rather than in application code:
--   * browsers cannot write any of it; only the server can
--   * a check only moves along the allowed status path, and every move is
--     written to the audit log in the same transaction
--   * one open check and one approved check per job seeker
--   * no decided check ever points at a stored image
--
-- Idempotent and safe to re-run.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.seeker_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id uuid NOT NULL REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- draft: started, image not yet sent for review.
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'reupload_needed', 'approved', 'not_approved', 'expired', 'withdrawn')),

  consent_at timestamptz,
  consent_version text CHECK (char_length(consent_version) BETWEEN 1 AND 40),

  -- The group the job seeker chose, and what the reviewer confirmed.
  rtw_group_claimed text CHECK (rtw_group_claimed IN (
    'citizen', 'permanent_resident', 'oecs_citizen', 'oecs_spouse', 'caricom_skills', 'work_permit')),
  rtw_group text CHECK (rtw_group IN (
    'citizen', 'permanent_resident', 'oecs_citizen', 'oecs_spouse', 'caricom_skills', 'work_permit')),
  rtw_document_type text CHECK (rtw_document_type IN (
    'passport', 'national_id', 'residency_document', 'marriage_certificate',
    'skills_certificate', 'work_permit')),
  rtw_document_expires_on date,
  -- The encrypted image while waiting for review; emptied at the decision.
  rtw_file_path text UNIQUE,
  rtw_file_sha256 text CHECK (rtw_file_sha256 ~ '^[a-f0-9]{64}$'),
  key_version integer CHECK (key_version > 0),

  -- Until the document expires, at most two years after the check.
  verified_until date,
  confirmation_code text UNIQUE CHECK (confirmation_code ~ '^[A-HJ-NP-Z2-9]{10}$'),

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- A code from a fixed list, never free text.
  decision_reason text CHECK (decision_reason IN (
    'photo_unreadable', 'document_cut_off', 'wrong_document', 'pages_missing',
    'name_mismatch', 'document_not_accepted', 'document_expired',
    'document_not_genuine', 'not_eligible')),

  expiry_reminder_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT verification_submitted_has_consent CHECK (
    status NOT IN ('submitted', 'reupload_needed', 'approved')
    OR (consent_at IS NOT NULL AND consent_version IS NOT NULL AND submitted_at IS NOT NULL)),
  CONSTRAINT verification_submitted_has_file CHECK (
    status <> 'submitted' OR (rtw_file_path IS NOT NULL AND rtw_file_sha256 IS NOT NULL AND key_version IS NOT NULL)),
  CONSTRAINT verification_approved_is_complete CHECK (
    status <> 'approved'
    OR (rtw_group IS NOT NULL AND rtw_document_type IS NOT NULL AND verified_until IS NOT NULL
        AND confirmation_code IS NOT NULL AND reviewed_at IS NOT NULL)),
  -- The image never outlives the decision.
  CONSTRAINT verification_decided_has_no_image CHECK (
    status IN ('draft', 'submitted') OR rtw_file_path IS NULL),
  CONSTRAINT verification_decision_has_reason CHECK (
    status NOT IN ('reupload_needed', 'not_approved') OR decision_reason IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS seeker_verifications_one_open
  ON public.seeker_verifications(seeker_id) WHERE status IN ('draft', 'submitted', 'reupload_needed');
CREATE UNIQUE INDEX IF NOT EXISTS seeker_verifications_one_approved
  ON public.seeker_verifications(seeker_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS seeker_verifications_user ON public.seeker_verifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seeker_verifications_queue ON public.seeker_verifications(status, submitted_at);
CREATE INDEX IF NOT EXISTS seeker_verifications_expiry
  ON public.seeker_verifications(verified_until) WHERE status = 'approved';

COMMENT ON TABLE public.seeker_verifications IS
  'JobLink Verified: free right-to-work check. Written only by the server. The ID image is deleted at the decision.';

CREATE TABLE IF NOT EXISTS public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.seeker_verifications(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('seeker', 'admin', 'employer', 'system')),
  event text NOT NULL CHECK (event IN (
    'status_changed', 'uploaded', 'file_opened_by_reviewer', 'file_deleted',
    'confirmation_opened_by_employer', 'sharing_stopped', 'reminder_sent')),
  from_status text,
  to_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_events_by_verification
  ON public.verification_events(verification_id, created_at);

CREATE TABLE IF NOT EXISTS public.verification_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  verification_id uuid NOT NULL REFERENCES public.seeker_verifications(id) ON DELETE CASCADE,
  shared_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS verification_shares_by_verification ON public.verification_shares(verification_id);

CREATE TABLE IF NOT EXISTS public.verification_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.verification_shares(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_views_by_share ON public.verification_views(share_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS public.verification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  uploads_open boolean NOT NULL DEFAULT false,
  opened_at timestamptz,
  opened_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (uploads_open = (opened_at IS NOT NULL))
);
INSERT INTO public.verification_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Access: the server writes, the job seeker reads their own
-- ----------------------------------------------------------------------------
ALTER TABLE public.seeker_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.seeker_verifications, public.verification_events, public.verification_shares,
  public.verification_views, public.verification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.seeker_verifications, public.verification_events, public.verification_shares,
  public.verification_views, public.verification_settings TO service_role;

-- A job seeker's browser can read the state of their own check, but never file
-- paths, fingerprints or who reviewed it.
GRANT SELECT (id, seeker_id, user_id, status, consent_at, rtw_group_claimed, rtw_group, rtw_document_type,
  rtw_document_expires_on, verified_until, confirmation_code, submitted_at, reviewed_at, decision_reason, created_at)
  ON public.seeker_verifications TO authenticated;
GRANT SELECT ON public.verification_shares, public.verification_views TO authenticated;

DROP POLICY IF EXISTS seeker_verifications_owner_read ON public.seeker_verifications;
CREATE POLICY seeker_verifications_owner_read ON public.seeker_verifications
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS verification_shares_owner_read ON public.verification_shares;
CREATE POLICY verification_shares_owner_read ON public.verification_shares
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.seeker_verifications v
    WHERE v.id = verification_shares.verification_id AND v.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS verification_views_owner_read ON public.verification_views;
CREATE POLICY verification_views_owner_read ON public.verification_views
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.verification_shares s
    JOIN public.seeker_verifications v ON v.id = s.verification_id
    WHERE s.id = verification_views.share_id AND v.user_id = (SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- Guards
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verification_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Browsers always arrive through the API as anon or authenticated. A direct
  -- database connection (migrations, Supabase's own user deletion cascading
  -- here) carries no API role and is trusted.
  IF coalesce(auth.role(), '') NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'Verification records are managed by the server';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['seeker_verifications', 'verification_events', 'verification_shares',
    'verification_views', 'verification_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS verification_server_only ON public.%I', t);
    EXECUTE format('CREATE TRIGGER verification_server_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.verification_server_only()', t);
  END LOOP;
END $$;

-- The status path. Anything else is refused, whoever asks.
--
--   draft           -> submitted | withdrawn
--   submitted       -> approved | reupload_needed | not_approved
--   reupload_needed -> submitted | withdrawn
--   approved        -> expired | withdrawn
CREATE OR REPLACE FUNCTION public.guard_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN RAISE EXCEPTION 'A verification starts as a draft'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.seeker_id IS DISTINCT FROM OLD.seeker_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'A verification cannot be moved to another job seeker';
  END IF;
  IF OLD.confirmation_code IS NOT NULL AND NEW.confirmation_code IS DISTINCT FROM OLD.confirmation_code THEN
    RAISE EXCEPTION 'A confirmation code cannot be changed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('submitted', 'withdrawn'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'reupload_needed', 'not_approved'))
    OR (OLD.status = 'reupload_needed' AND NEW.status IN ('submitted', 'withdrawn'))
    OR (OLD.status = 'approved' AND NEW.status IN ('expired', 'withdrawn'))
  ) THEN
    RAISE EXCEPTION 'Verification cannot move from % to %', OLD.status, NEW.status;
  END IF;

  -- Uploads stay locked until the upload switch is opened.
  IF NEW.status = 'submitted' AND OLD.status <> 'submitted'
    AND NOT (SELECT uploads_open FROM public.verification_settings)
  THEN
    RAISE EXCEPTION 'Uploads are not open yet';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_verification_status ON public.seeker_verifications;
CREATE TRIGGER guard_verification_status
  BEFORE INSERT OR UPDATE ON public.seeker_verifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_status();

-- Every status move lands in the audit log in the same transaction.
CREATE OR REPLACE FUNCTION public.log_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  by_reviewer boolean := NEW.status IN ('approved', 'reupload_needed', 'not_approved');
  by_owner boolean := NEW.status IN ('draft', 'submitted', 'withdrawn');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  INSERT INTO public.verification_events (verification_id, actor_id, actor_role, event, from_status, to_status)
  VALUES (
    NEW.id,
    CASE WHEN by_reviewer THEN NEW.reviewed_by WHEN by_owner THEN NEW.user_id END,
    CASE WHEN by_reviewer THEN 'admin' WHEN by_owner THEN 'seeker' ELSE 'system' END,
    'status_changed',
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
    NEW.status
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_verification_status ON public.seeker_verifications;
CREATE TRIGGER log_verification_status
  AFTER INSERT OR UPDATE ON public.seeker_verifications
  FOR EACH ROW EXECUTE FUNCTION public.log_verification_status();

CREATE OR REPLACE FUNCTION public.verification_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'The verification audit log cannot be edited';
END;
$$;
DROP TRIGGER IF EXISTS verification_events_append_only ON public.verification_events;
CREATE TRIGGER verification_events_append_only
  BEFORE UPDATE ON public.verification_events
  FOR EACH ROW EXECUTE FUNCTION public.verification_events_append_only();

CREATE OR REPLACE FUNCTION public.guard_verification_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'The verification settings row cannot be removed'; END IF;
  IF OLD.uploads_open AND NOT NEW.uploads_open AND EXISTS (
    SELECT 1 FROM public.seeker_verifications WHERE rtw_file_path IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Uploads cannot be closed while documents are waiting for review';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_verification_settings ON public.verification_settings;
CREATE TRIGGER guard_verification_settings
  BEFORE UPDATE OR DELETE ON public.verification_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_settings();

-- A share can only be made from the applicant's own approved, unexpired check.
CREATE OR REPLACE FUNCTION public.guard_verification_share()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.application_id IS DISTINCT FROM OLD.application_id
      OR NEW.verification_id IS DISTINCT FROM OLD.verification_id
      OR NEW.shared_at IS DISTINCT FROM OLD.shared_at
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    THEN
      RAISE EXCEPTION 'A share can only be stopped, not changed';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.seeker_verifications v ON v.seeker_id = a.seeker_id
    WHERE a.id = NEW.application_id AND v.id = NEW.verification_id
      AND v.status = 'approved' AND v.verified_until >= (now() AT TIME ZONE 'America/Antigua')::date
  ) THEN
    RAISE EXCEPTION 'A confirmation can only be shared from the applicant''s own valid verification';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_verification_share ON public.verification_shares;
CREATE TRIGGER guard_verification_share
  BEFORE INSERT OR UPDATE ON public.verification_shares
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_share();

REVOKE ALL ON FUNCTION public.verification_server_only(), public.guard_verification_status(),
  public.log_verification_status(), public.verification_events_append_only(),
  public.guard_verification_settings(), public.guard_verification_share()
  FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Badges: all anyone else can learn is that a profile holds a valid badge,
-- whether a work permit is involved, and the day it was checked.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verified_badges(p_seeker_ids uuid[])
RETURNS TABLE (seeker_id uuid, holds_work_permit boolean, checked_on date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.seeker_id, v.rtw_group = 'work_permit', (v.reviewed_at AT TIME ZONE 'America/Antigua')::date
  FROM public.seeker_verifications v
  WHERE v.seeker_id = ANY (p_seeker_ids)
    AND cardinality(p_seeker_ids) <= 500
    AND v.status = 'approved'
    AND v.verified_until >= (now() AT TIME ZONE 'America/Antigua')::date;
$$;
REVOKE ALL ON FUNCTION public.verified_badges(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verified_badges(uuid[]) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Private storage: ID images, encrypted by JobLink, held only until the decision
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-private', 'verification-private', false, 4194304, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'verification-private' AND public) THEN
    RAISE EXCEPTION 'verification_bucket_must_be_private';
  END IF;
END $$;

DROP POLICY IF EXISTS verification_no_browser_objects ON storage.objects;
CREATE POLICY verification_no_browser_objects ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'verification-private')
  WITH CHECK (bucket_id <> 'verification-private');

COMMIT;
