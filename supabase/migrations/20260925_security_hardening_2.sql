-- ============================================================================
-- Security hardening, round 2
-- ============================================================================
-- Round 1 (20260601_security_hardening.sql) locked down public.users. This
-- migration closes the equivalent holes on companies and job_listings, adds
-- server-side enforcement for limits that were previously browser-only, and
-- creates the supporting tables the application code expects.
--
-- Everything here is idempotent and safe to re-run.
-- ============================================================================


-- ============================================================================
-- 1. Missing Stripe tables and columns
-- ============================================================================
-- src/app/api/webhooks/stripe/route.ts writes to all of these, but none of
-- them existed in any migration. They were presumably created by hand in the
-- Supabase dashboard; if they were not, every Stripe write has been failing
-- silently. Created here with IF NOT EXISTS so the migration is safe either
-- way and the schema files become the source of truth again.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  status TEXT NOT NULL,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id
  ON public.subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id
  ON public.companies(stripe_customer_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_purchases ENABLE ROW LEVEL SECURITY;

-- Billing rows are written by the Stripe webhook (service role) only.
-- Owners may read their own.
DROP POLICY IF EXISTS "Employers can view own subscriptions" ON public.subscriptions;
CREATE POLICY "Employers can view own subscriptions" ON public.subscriptions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = subscriptions.company_id AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own purchases" ON public.ai_purchases;
CREATE POLICY "Users can view own purchases" ON public.ai_purchases
  FOR SELECT USING (user_id = auth.uid());


-- ============================================================================
-- 2. Stripe webhook idempotency
-- ============================================================================
-- Stripe retries deliveries. Without a dedupe record, a retry of
-- checkout.session.completed inserted a second subscriptions/ai_purchases row.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.


-- ============================================================================
-- 3. Protect privileged company fields
-- ============================================================================
-- Previously: "Employers can update own company" allowed an UPDATE on any
-- column of a row the employer owns, with no column restriction. An employer
-- could PATCH their own row with {"is_pro": true} using the anon key and
-- unlock every paid feature -- including CV downloads for candidates who never
-- applied to them.
--
-- Legitimate changes come from the Stripe webhook and admin routes, both of
-- which use the service role.

CREATE OR REPLACE FUNCTION public.protect_company_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_pro = true
      OR NEW.is_verified = true
      OR NEW.pro_expires_at IS NOT NULL
      OR NEW.stripe_customer_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'Billing and verification fields are managed by the server';
    END IF;
  ELSE
    IF NEW.is_pro IS DISTINCT FROM OLD.is_pro
      OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
      OR NEW.pro_expires_at IS DISTINCT FROM OLD.pro_expires_at
      OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'Billing and verification fields are managed by the server';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_company_privileged_fields ON public.companies;
CREATE TRIGGER protect_company_privileged_fields
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_privileged_fields();


-- ============================================================================
-- 4. Enforce job listing moderation
-- ============================================================================
-- Previously: listings are inserted straight from the browser and the insert
-- policy only checked company ownership. Posting with status='active' skipped
-- the /admin/approvals queue entirely, and is_featured could be self-granted.
-- Editing an already-approved listing also left it live with new content, so
-- an approved job could be rewritten into anything.
--
-- Policy applied here (confirmed with the product owner):
--   * non-service-role INSERT is always forced to pending_approval
--   * is_featured is service-role only
--   * editing title, description, category or location on a live listing
--     sends it back to pending_approval
--   * salary fields, salary_visible, job_type and expires_at may change
--     while the listing stays live
--   * an employer may still close their own listing

CREATE OR REPLACE FUNCTION public.enforce_listing_moderation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  material_edit boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending_approval';
    NEW.is_featured := false;
    NEW.posted_by_admin := false;
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    RAISE EXCEPTION 'Featured placement is managed by the server';
  END IF;

  IF NEW.posted_by_admin IS DISTINCT FROM OLD.posted_by_admin THEN
    RAISE EXCEPTION 'posted_by_admin is managed by the server';
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'A listing cannot be moved to another company';
  END IF;

  -- Employers may close a listing, or resubmit a closed one for review.
  -- They may not promote anything to active themselves.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'closed' THEN
      RETURN NEW;
    ELSIF NEW.status = 'pending_approval' THEN
      NULL; -- allowed: voluntarily pulling a listing back for re-review
    ELSE
      RAISE EXCEPTION 'Listing approval is managed by the server';
    END IF;
  END IF;

  material_edit :=
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.location IS DISTINCT FROM OLD.location;

  IF material_edit AND OLD.status = 'active' THEN
    NEW.status := 'pending_approval';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_listing_moderation ON public.job_listings;
CREATE TRIGGER enforce_listing_moderation
  BEFORE INSERT OR UPDATE ON public.job_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_listing_moderation();


-- ============================================================================
-- 5. Enforce the free-tier listing cap server-side
-- ============================================================================
-- Previously enforced only in src/app/(dashboard)/post-job/page.tsx, which a
-- direct PostgREST insert ignores. Free accounts get one listing that is live
-- or awaiting review; Pro is unlimited.

CREATE OR REPLACE FUNCTION public.enforce_free_listing_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  company_is_pro boolean;
  open_listings integer;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT (is_pro = true AND (pro_expires_at IS NULL OR pro_expires_at > NOW()))
    INTO company_is_pro
    FROM public.companies
    WHERE id = NEW.company_id;

  IF COALESCE(company_is_pro, false) THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO open_listings
    FROM public.job_listings
    WHERE company_id = NEW.company_id
      AND status IN ('active', 'pending_approval');

  IF open_listings >= 1 THEN
    RAISE EXCEPTION 'Free accounts are limited to one open listing. Upgrade to Pro to post more.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_free_listing_cap ON public.job_listings;
CREATE TRIGGER enforce_free_listing_cap
  BEFORE INSERT ON public.job_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_free_listing_cap();


-- ============================================================================
-- 6. Candidate browsing requires a real company
-- ============================================================================
-- Previously: any logged-in user could POST /api/switch-role to become an
-- "employer" and then read every seeker profile with the default visibility --
-- names, phone numbers, locations and bios for the whole seeker base.
-- Reading candidate data now requires an actual companies row.

DROP POLICY IF EXISTS "Employers can view browsable profiles" ON public.seeker_profiles;
CREATE POLICY "Employers can view browsable profiles"
  ON public.seeker_profiles FOR SELECT
  USING (
    visibility IN ('actively_looking', 'open')
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'employer'
    )
    AND EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 7. Length limits on browser-writable text
-- ============================================================================
-- companies and job_listings are written directly from the browser with the
-- anon key, so the only validation that counts is the one in the database.
-- Limits are generous; they exist to stop unbounded writes, not to shape input.

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_company_name_length;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_company_name_length
  CHECK (char_length(company_name) BETWEEN 1 AND 200);

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_description_length;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_description_length
  CHECK (description IS NULL OR char_length(description) <= 5000);

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_website_format;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_website_format
  CHECK (
    website IS NULL
    OR website = ''
    OR (char_length(website) <= 500 AND website ~* '^https?://[^\s/$.?#].[^\s]*$')
  );

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_logo_url_format;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_logo_url_format
  CHECK (
    logo_url IS NULL
    OR logo_url = ''
    OR (char_length(logo_url) <= 1000 AND logo_url ~* '^https?://')
  );

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_short_text_length;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_short_text_length
  CHECK (
    (industry IS NULL OR char_length(industry) <= 100)
    AND (location IS NULL OR char_length(location) <= 200)
  );

ALTER TABLE public.job_listings
  DROP CONSTRAINT IF EXISTS job_listings_title_length;
ALTER TABLE public.job_listings
  ADD CONSTRAINT job_listings_title_length
  CHECK (char_length(title) BETWEEN 1 AND 200);

ALTER TABLE public.job_listings
  DROP CONSTRAINT IF EXISTS job_listings_description_length;
ALTER TABLE public.job_listings
  ADD CONSTRAINT job_listings_description_length
  CHECK (char_length(description) BETWEEN 1 AND 20000);

ALTER TABLE public.job_listings
  DROP CONSTRAINT IF EXISTS job_listings_short_text_length;
ALTER TABLE public.job_listings
  ADD CONSTRAINT job_listings_short_text_length
  CHECK (
    (category IS NULL OR char_length(category) <= 100)
    AND (location IS NULL OR char_length(location) <= 200)
  );

ALTER TABLE public.job_listings
  DROP CONSTRAINT IF EXISTS job_listings_salary_sane;
ALTER TABLE public.job_listings
  ADD CONSTRAINT job_listings_salary_sane
  CHECK (
    (salary_min IS NULL OR salary_min BETWEEN 0 AND 100000000)
    AND (salary_max IS NULL OR salary_max BETWEEN 0 AND 100000000)
    AND (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
  );

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_cover_letter_length;
ALTER TABLE public.applications
  ADD CONSTRAINT applications_cover_letter_length
  CHECK (cover_letter_text IS NULL OR char_length(cover_letter_text) <= 10000);

ALTER TABLE public.seeker_profiles
  DROP CONSTRAINT IF EXISTS seeker_profiles_text_length;
ALTER TABLE public.seeker_profiles
  ADD CONSTRAINT seeker_profiles_text_length
  CHECK (
    (first_name IS NULL OR char_length(first_name) <= 100)
    AND (last_name IS NULL OR char_length(last_name) <= 100)
    AND (phone IS NULL OR char_length(phone) <= 50)
    AND (location IS NULL OR char_length(location) <= 200)
    AND (bio IS NULL OR char_length(bio) <= 5000)
    AND (education IS NULL OR char_length(education) <= 2000)
    AND (experience_years IS NULL OR experience_years BETWEEN 0 AND 80)
  );


-- ============================================================================
-- 8. Rate limiting
-- ============================================================================
-- Fixed-window counters. Serverless instances do not share memory, so the
-- counter has to live somewhere both of them can see.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_started_at
  ON public.rate_limits(window_started_at);

-- Returns true when the call is allowed. One statement, so concurrent callers
-- serialise on the row rather than racing between a read and a write.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_hits INTEGER;
  started TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limits AS rl (bucket, hits, window_started_at)
  VALUES (p_bucket, 1, NOW())
  ON CONFLICT (bucket) DO UPDATE
    SET
      hits = CASE
        WHEN rl.window_started_at < NOW() - make_interval(secs => p_window_seconds)
        THEN 1
        ELSE rl.hits + 1
      END,
      window_started_at = CASE
        WHEN rl.window_started_at < NOW() - make_interval(secs => p_window_seconds)
        THEN NOW()
        ELSE rl.window_started_at
      END
  RETURNING rl.hits, rl.window_started_at INTO current_hits, started;

  RETURN QUERY SELECT
    current_hits <= p_limit,
    GREATEST(p_limit - current_hits, 0),
    GREATEST(
      CEIL(
        EXTRACT(EPOCH FROM (started + make_interval(secs => p_window_seconds) - NOW()))
      )::INTEGER,
      0
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Housekeeping helper; call from a cron if the table ever grows.
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM public.rate_limits
    WHERE window_started_at < NOW() - INTERVAL '1 day'
    RETURNING 1
  )
  SELECT COUNT(*)::integer FROM deleted;
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_rate_limits() TO service_role;
