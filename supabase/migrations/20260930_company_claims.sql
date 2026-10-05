-- Claiming is an explicit bearer-link operation, never a company-name match.
BEGIN;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE INDEX IF NOT EXISTS companies_normalized_name_idx ON public.companies (lower(btrim(company_name)));

CREATE TABLE IF NOT EXISTS public.company_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
  email_hint text,
  created_by uuid NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  claimed_by uuid REFERENCES public.users(id),
  claimed_at timestamptz,
  CONSTRAINT claim_completion CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
);
CREATE INDEX IF NOT EXISTS company_claims_company_idx ON public.company_claims(company_id);
CREATE INDEX IF NOT EXISTS company_claims_creator_idx ON public.company_claims(created_by);
CREATE INDEX IF NOT EXISTS company_claims_claimant_idx ON public.company_claims(claimed_by);
ALTER TABLE public.company_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_claims FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_claims TO authenticated, service_role;
DROP POLICY IF EXISTS company_claims_admin_only ON public.company_claims;
CREATE POLICY company_claims_admin_only ON public.company_claims TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin AND NOT is_banned))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin AND NOT is_banned));

-- Separate from existing billing protections so those rules stay intact.
CREATE OR REPLACE FUNCTION public.protect_company_claim_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF (TG_OP = 'INSERT' AND NEW.claimed_at IS NOT NULL)
      OR (TG_OP = 'UPDATE' AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at) THEN
      RAISE EXCEPTION 'Company claims are managed by the server';
    END IF;
    IF TG_OP = 'INSERT' OR NEW.company_name IS DISTINCT FROM OLD.company_name THEN
      IF EXISTS (
        SELECT 1 FROM public.companies c JOIN public.users u ON u.id = c.user_id
        WHERE lower(btrim(c.company_name)) = lower(btrim(NEW.company_name))
          AND c.id IS DISTINCT FROM NEW.id
          AND u.email LIKE 'admin-company-%@joblinkantigua.com'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COMPANY_CLAIM_REQUIRED';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_company_claim_fields ON public.companies;
CREATE TRIGGER protect_company_claim_fields BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.protect_company_claim_fields();

-- Called only by the server after requireAdmin(). Lock the company so issuance
-- cannot race a claim. Existing links keep their original 30-day expiry.
CREATE OR REPLACE FUNCTION public.create_company_claim(p_company_id uuid, p_admin_id uuid, p_token text)
RETURNS public.company_claims
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.companies; result public.company_claims;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_admin_id AND is_admin AND NOT is_banned) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  SELECT * INTO c FROM public.companies WHERE id = p_company_id FOR UPDATE;
  IF NOT FOUND OR c.claimed_at IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = c.user_id AND role = 'employer'
      AND email LIKE 'admin-company-%@joblinkantigua.com' AND NOT is_banned
  ) THEN RAISE EXCEPTION 'COMPANY_NOT_CLAIMABLE'; END IF;
  INSERT INTO public.company_claims(company_id, token, created_by)
    VALUES (p_company_id, p_token, p_admin_id) RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_company_claim(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_company_claim(uuid, uuid, text) TO service_role;

-- One RPC = one transaction. Lock claimant -> company -> token consistently.
-- The existing UNIQUE(companies.user_id) also arbitrates concurrent profile
-- creation and claims of different companies by the same employer.
CREATE OR REPLACE FUNCTION public.claim_company(p_token text, p_user_id uuid)
RETURNS TABLE(company_id uuid, company_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  claim public.company_claims;
  c public.companies;
  claimant public.users;
  placeholder_id uuid;
  claimed_time timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO claimant FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR claimant.is_banned OR claimant.role <> 'employer'
    OR claimant.email LIKE 'admin-company-%@joblinkantigua.com' THEN
    RAISE EXCEPTION 'EMPLOYER_REQUIRED';
  END IF;
  IF NOT claimant.email_verified OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = p_user_id AND email_confirmed_at IS NOT NULL
      AND (banned_until IS NULL OR banned_until <= clock_timestamp())
  ) THEN RAISE EXCEPTION 'EMAIL_UNVERIFIED'; END IF;

  SELECT * INTO claim FROM public.company_claims WHERE token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_UNAVAILABLE'; END IF;
  SELECT * INTO c FROM public.companies WHERE id = claim.company_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_UNAVAILABLE'; END IF;
  SELECT * INTO claim FROM public.company_claims WHERE token = p_token FOR UPDATE;
  -- clock_timestamp(), not transaction-start now(): a lock wait can cross expiry.
  IF NOT FOUND OR claim.claimed_at IS NOT NULL OR claim.expires_at <= clock_timestamp()
    OR c.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'CLAIM_UNAVAILABLE'; END IF;

  PERFORM 1 FROM public.users WHERE id = c.user_id AND role = 'employer'
    AND email LIKE 'admin-company-%@joblinkantigua.com' AND NOT is_banned FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_UNAVAILABLE'; END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'COMPANY_ALREADY_OWNED';
  END IF;
  placeholder_id := c.user_id;
  claimed_time := clock_timestamp();
  UPDATE public.companies SET user_id = p_user_id, claimed_at = claimed_time WHERE id = c.id;
  -- job_listings has only company_id, no employer/user owner column. All jobs,
  -- applications and their RLS ownership move with this same company row.
  -- posted_by_admin and the employer-approved SEO allowlist remain unchanged.
  UPDATE public.company_claims SET claimed_by = p_user_id, claimed_at = claimed_time WHERE id = claim.id;
  UPDATE public.users SET is_banned = true, email_verified = false WHERE id = placeholder_id;
  -- Reversible disabling in the SAME transaction, including Auth sign-in and
  -- refresh. Keep the row for audit/FKs; do not cascade-delete historical data.
  UPDATE auth.users SET banned_until = '9999-12-31 23:59:59+00'::timestamptz WHERE id = placeholder_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLAIM_UNAVAILABLE'; END IF;
  DELETE FROM auth.refresh_tokens WHERE user_id = placeholder_id::text;
  DELETE FROM auth.sessions WHERE user_id = placeholder_id;
  RETURN QUERY SELECT c.id, c.company_name;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_company(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_company(text, uuid) TO service_role;
COMMIT;
