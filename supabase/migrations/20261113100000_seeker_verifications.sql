-- ============================================================================
-- JobLink Verified: data model and private storage (build step 2)
-- ============================================================================
-- DO NOT APPLY to production until the Labour Department and legal checks in
-- the launch plan are done. Nothing reads these tables while
-- VERIFICATION_ENABLED is off.
--
-- Five tables, one listing column, one private bucket:
--
--   seeker_verifications   one row per EC$40 check
--   verification_shares    which application carried which documents
--   verification_views     each time an employer opens a shared document
--   verification_events    the audit log
--   verification_settings  a single row holding the upload switch
--   job_listings.police_record_required
--   storage bucket verification-private (encrypted files, no browser access)
--
-- Rules enforced here rather than in application code:
--   * browsers cannot write any of it; only the service role can
--   * a verification only moves along the allowed status path, and every move
--     is written to the audit log in the same transaction
--   * one open check and one approved check per job seeker
--   * a finished check never points at a stored file
--   * no column holds what a police record says
--
-- Idempotent and safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- seeker_verifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seeker_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id uuid NOT NULL REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN (
    'awaiting_payment', 'paid', 'submitted', 'reupload_needed',
    'approved', 'not_approved', 'expired', 'withdrawn')),

  -- Payment. One price, one currency, in cents.
  amount integer NOT NULL DEFAULT 4000 CHECK (amount = 4000),
  currency text NOT NULL DEFAULT 'xcd' CHECK (currency = 'xcd'),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  paid_at timestamptz,

  -- Consent to handle the police record: when, and which wording.
  consent_at timestamptz,
  consent_version text CHECK (char_length(consent_version) BETWEEN 1 AND 40),

  -- Right to work. The claimed group is what the job seeker picked at upload;
  -- the other three are what the reviewer confirmed.
  rtw_group_claimed text CHECK (rtw_group_claimed IN (
    'citizen', 'permanent_resident', 'oecs_citizen', 'oecs_spouse', 'caricom_skills', 'work_permit')),
  rtw_group text CHECK (rtw_group IN (
    'citizen', 'permanent_resident', 'oecs_citizen', 'oecs_spouse', 'caricom_skills', 'work_permit')),
  rtw_document_type text CHECK (rtw_document_type IN (
    'passport', 'national_id', 'residency_document', 'marriage_certificate',
    'skills_certificate', 'work_permit')),
  rtw_document_expires_on date,
  -- The ID image while waiting for review; emptied at the decision.
  rtw_file_path text UNIQUE,

  -- Police record: the date on it, where the encrypted file is, the
  -- fingerprint of the cleaned file and the key version that encrypted it.
  police_record_issued_on date,
  police_record_file_path text UNIQUE,
  police_record_sha256 text CHECK (police_record_sha256 ~ '^[a-f0-9]{64}$'),
  key_version integer CHECK (key_version > 0),

  -- Show the job seeker a notice before sharing. Says nothing about why.
  sharing_notice boolean NOT NULL DEFAULT false,

  verified_until date,
  confirmation_code text UNIQUE CHECK (confirmation_code ~ '^[A-HJ-NP-Z2-9]{10}$'),

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- A code from a fixed list, never free text, so nothing about the contents
  -- of a document can be written here.
  decision_reason text CHECK (decision_reason IN (
    'photo_unreadable', 'document_cut_off', 'wrong_document', 'pages_missing',
    'name_mismatch', 'document_not_accepted', 'document_expired',
    'police_record_too_old', 'document_not_genuine', 'not_eligible',
    'no_upload_received')),
  reupload_documents text[] NOT NULL DEFAULT '{}'
    CHECK (reupload_documents <@ ARRAY['rtw', 'police_record']::text[]),

  refunded_at timestamptz,
  stripe_refund_id text UNIQUE,

  -- Set by the daily job so a reminder is sent once.
  expiry_reminder_sent_at timestamptz,
  upload_reminder_sent_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT verification_paid_has_payment CHECK (
    status = 'awaiting_payment'
    OR (stripe_checkout_session_id IS NOT NULL AND paid_at IS NOT NULL)),
  CONSTRAINT verification_submitted_has_consent CHECK (
    status NOT IN ('submitted', 'reupload_needed', 'approved')
    OR (consent_at IS NOT NULL AND consent_version IS NOT NULL AND submitted_at IS NOT NULL)),
  CONSTRAINT verification_submitted_has_files CHECK (
    status <> 'submitted'
    OR (rtw_file_path IS NOT NULL AND police_record_file_path IS NOT NULL
        AND police_record_sha256 IS NOT NULL AND key_version IS NOT NULL)),
  CONSTRAINT verification_approved_is_complete CHECK (
    status <> 'approved'
    OR (rtw_group IS NOT NULL AND rtw_document_type IS NOT NULL
        AND police_record_issued_on IS NOT NULL AND police_record_file_path IS NOT NULL
        AND police_record_sha256 IS NOT NULL AND key_version IS NOT NULL
        AND verified_until IS NOT NULL AND confirmation_code IS NOT NULL
        AND reviewed_at IS NOT NULL)),
  -- The ID image never outlives the decision.
  CONSTRAINT verification_decided_has_no_id_image CHECK (
    status NOT IN ('approved', 'not_approved', 'expired', 'withdrawn')
    OR rtw_file_path IS NULL),
  -- A finished check holds no police record and no sharing notice.
  CONSTRAINT verification_finished_has_no_record CHECK (
    status NOT IN ('not_approved', 'expired', 'withdrawn')
    OR (police_record_file_path IS NULL AND sharing_notice = false)),
  CONSTRAINT verification_reupload_names_documents CHECK (
    (status = 'reupload_needed') = (cardinality(reupload_documents) > 0)),
  CONSTRAINT verification_refund_is_recorded CHECK (
    (refunded_at IS NULL) = (stripe_refund_id IS NULL))
);

-- One check in progress, and one live badge, per job seeker.
CREATE UNIQUE INDEX IF NOT EXISTS seeker_verifications_one_open
  ON public.seeker_verifications(seeker_id)
  WHERE status IN ('awaiting_payment', 'paid', 'submitted', 'reupload_needed');
CREATE UNIQUE INDEX IF NOT EXISTS seeker_verifications_one_approved
  ON public.seeker_verifications(seeker_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS seeker_verifications_user ON public.seeker_verifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seeker_verifications_queue ON public.seeker_verifications(status, submitted_at);
CREATE INDEX IF NOT EXISTS seeker_verifications_expiry
  ON public.seeker_verifications(verified_until) WHERE status = 'approved';

COMMENT ON TABLE public.seeker_verifications IS
  'JobLink Verified: one row per EC$40 check. Written only by the server. Never stores what a police record says.';

-- ----------------------------------------------------------------------------
-- verification_events: the audit log
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.seeker_verifications(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('seeker', 'admin', 'employer', 'system')),
  event text NOT NULL CHECK (event IN (
    'status_changed', 'uploaded', 'file_opened_by_reviewer', 'file_opened_by_owner',
    'file_opened_by_employer', 'file_deleted', 'refunded', 'sharing_stopped',
    'reminder_sent')),
  from_status text,
  to_status text,
  document text CHECK (document IN ('rtw', 'police_record')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_events_by_verification
  ON public.verification_events(verification_id, created_at);

-- ----------------------------------------------------------------------------
-- verification_shares and verification_views
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  verification_id uuid NOT NULL REFERENCES public.seeker_verifications(id) ON DELETE CASCADE,
  share_police_record boolean NOT NULL DEFAULT false,
  share_rtw boolean NOT NULL DEFAULT false,
  shared_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (share_police_record OR share_rtw)
);
CREATE INDEX IF NOT EXISTS verification_shares_by_verification
  ON public.verification_shares(verification_id);

-- No IP addresses: who, which company, which document, when.
CREATE TABLE IF NOT EXISTS public.verification_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.verification_shares(id) ON DELETE CASCADE,
  viewer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  document text NOT NULL CHECK (document IN ('rtw', 'police_record')),
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_views_by_share
  ON public.verification_views(share_id, viewed_at DESC);

-- ----------------------------------------------------------------------------
-- verification_settings: a single row
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.verification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  uploads_open boolean NOT NULL DEFAULT false,
  opened_at timestamptz,
  opened_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  CHECK (uploads_open = (opened_at IS NOT NULL))
);
INSERT INTO public.verification_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- job_listings.police_record_required
-- ----------------------------------------------------------------------------
ALTER TABLE public.job_listings
  ADD COLUMN IF NOT EXISTS police_record_required boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.job_listings.police_record_required IS
  'Employer ticked "Police record required". Shown as a label on the listing.';

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

-- Column grants: a job seeker's browser can read the state of their own check
-- but never file paths, fingerprints, Stripe identifiers or who reviewed it.
GRANT SELECT (id, seeker_id, user_id, status, amount, currency, paid_at, consent_at,
  rtw_group, rtw_document_type, rtw_document_expires_on, police_record_issued_on,
  sharing_notice, verified_until, confirmation_code, submitted_at, reviewed_at,
  decision_reason, reupload_documents, refunded_at, created_at)
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

-- verification_events and verification_settings: no policies, service role only.

-- ----------------------------------------------------------------------------
-- Guards
-- ----------------------------------------------------------------------------
-- Belt and braces on top of the grants above: even if a permissive policy or
-- grant is added by mistake later, a browser session still cannot write.
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
--   awaiting_payment -> paid
--   paid             -> submitted | withdrawn (refunded: never uploaded)
--   submitted        -> approved | reupload_needed | not_approved
--   reupload_needed  -> submitted | withdrawn
--   approved         -> expired | withdrawn
CREATE OR REPLACE FUNCTION public.guard_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'awaiting_payment' THEN
      RAISE EXCEPTION 'A verification starts as awaiting_payment';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.seeker_id IS DISTINCT FROM OLD.seeker_id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'A verification cannot be moved to another job seeker';
  END IF;

  IF OLD.confirmation_code IS NOT NULL AND NEW.confirmation_code IS DISTINCT FROM OLD.confirmation_code THEN
    RAISE EXCEPTION 'A confirmation code cannot be changed';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'awaiting_payment' AND NEW.status = 'paid')
    OR (OLD.status = 'paid' AND NEW.status IN ('submitted', 'withdrawn'))
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

-- Every status move lands in the audit log in the same transaction. Reviewer
-- decisions are attributed to the reviewer; a job seeker's own moves to them;
-- payment and expiry to the system.
CREATE OR REPLACE FUNCTION public.log_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  by_reviewer boolean := NEW.status IN ('approved', 'reupload_needed', 'not_approved');
  by_owner boolean := NEW.status = 'submitted';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;
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

-- The audit log is append-only, including for the server.
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

-- Once opened, uploads cannot be closed again while any document is stored.
CREATE OR REPLACE FUNCTION public.guard_verification_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'The verification settings row cannot be removed';
  END IF;
  IF OLD.uploads_open AND NOT NEW.uploads_open AND EXISTS (
    SELECT 1 FROM public.seeker_verifications
    WHERE rtw_file_path IS NOT NULL OR police_record_file_path IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Uploads cannot be closed while documents are stored';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_verification_settings ON public.verification_settings;
CREATE TRIGGER guard_verification_settings
  BEFORE UPDATE OR DELETE ON public.verification_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_verification_settings();

-- A share can only be made for the applicant's own approved, unexpired check.
CREATE OR REPLACE FUNCTION public.guard_verification_share()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.application_id IS DISTINCT FROM OLD.application_id
      OR NEW.verification_id IS DISTINCT FROM OLD.verification_id
      OR NEW.share_police_record IS DISTINCT FROM OLD.share_police_record
      OR NEW.share_rtw IS DISTINCT FROM OLD.share_rtw
      OR NEW.shared_at IS DISTINCT FROM OLD.shared_at
      OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    THEN
      RAISE EXCEPTION 'A share can only be stopped, not changed';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.applications a
    JOIN public.seeker_verifications v ON v.seeker_id = a.seeker_id
    WHERE a.id = NEW.application_id
      AND v.id = NEW.verification_id
      AND v.status = 'approved'
      AND v.verified_until >= (now() AT TIME ZONE 'America/Antigua')::date
  ) THEN
    RAISE EXCEPTION 'Documents can only be shared from the applicant''s own valid verification';
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
-- Badges
-- ----------------------------------------------------------------------------
-- The only thing anyone other than the job seeker and JobLink can learn: that a
-- profile holds a valid badge, whether a work permit is involved, and the day
-- the documents were checked. Signed-in users only.
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
-- Private storage
-- ----------------------------------------------------------------------------
-- Files are encrypted by JobLink before upload, so the bucket only ever holds
-- opaque bytes. 3 MB per document plus headroom for the encryption envelope.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('verification-private', 'verification-private', false, 4194304, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'verification-private' AND public) THEN
    RAISE EXCEPTION 'verification_bucket_must_be_private';
  END IF;
END $$;

-- Restrictive, so no permissive bucket-wide policy added later can expose
-- these objects. Every read and write goes through an authorised server route.
DROP POLICY IF EXISTS verification_no_browser_objects ON storage.objects;
CREATE POLICY verification_no_browser_objects ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'verification-private')
  WITH CHECK (bucket_id <> 'verification-private');

COMMIT;
