-- ============================================================================
-- Employer pricing: Job Spotlight (EC$125 once) and Employer Pro (EC$200/month)
-- ============================================================================
-- DO NOT APPLY to production until the employer pricing rollout is approved.
-- Nothing reads these tables while EMPLOYER_BILLING_ENABLED is off, and the
-- candidate directory stays open to every employer until directory_gated is
-- switched on in employer_billing_settings.
--
--   employer_orders            one row per purchase attempt or payment
--   employer_pro_subscriptions which company a Pro subscription belongs to
--   employer_pro_periods       one row per settled Pro billing month
--   spotlight_credits          one Spotlight that can be redeemed
--   spotlight_campaigns        one Spotlight on one vacancy
--   employer_billing_events    every Stripe event, applied once
--   employer_billing_settings  single row: the directory gate
--   job_listings.spotlight_until  when the paid featured window ends
--
-- Rules the database enforces:
--   * only the server writes any of it
--   * a Stripe event, checkout session, invoice and billing period each count once
--   * one credit funds at most one campaign; a credit is redeemed in one locked step
--   * a job never has two overlapping paid windows
--   * no column holds card details
--
-- Idempotent and safe to re-run.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Settings
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_billing_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  directory_gated boolean NOT NULL DEFAULT false,
  gated_at timestamptz,
  gated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);
INSERT INTO public.employer_billing_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Orders
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sent to Stripe as client_reference_id. Random, so it cannot be guessed.
  reference uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  offer text NOT NULL CHECK (offer IN ('spotlight', 'pro')),
  -- Null while a direct-link payment waits to be claimed.
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  purchaser_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- The vacancy the buyer had in mind. Advisory: the campaign decides.
  job_id uuid REFERENCES public.job_listings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'paid', 'refunded', 'disputed', 'abandoned')),
  livemode boolean NOT NULL,
  amount integer CHECK (amount IN (12500, 20000)),
  currency text CHECK (currency = 'xcd'),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  -- Shown to staff when matching a direct-link payment. Never used for access.
  customer_email text CHECK (char_length(customer_email) <= 254),
  paid_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  needs_review boolean NOT NULL DEFAULT false,
  review_reason text CHECK (review_reason IN (
    'unassigned', 'duplicate_subscription', 'refunded', 'partial_refund', 'disputed',
    'reference_mismatch', 'company_has_pro')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'started' OR status = 'abandoned' OR stripe_checkout_session_id IS NOT NULL OR stripe_subscription_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS employer_orders_company ON public.employer_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS employer_orders_review ON public.employer_orders(needs_review) WHERE needs_review;

-- ----------------------------------------------------------------------------
-- Pro subscriptions and billing periods
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_pro_subscriptions (
  stripe_subscription_id text PRIMARY KEY,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.employer_orders(id) ON DELETE SET NULL,
  stripe_customer_id text,
  status text NOT NULL DEFAULT 'active',
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  livemode boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employer_pro_subscriptions_company ON public.employer_pro_subscriptions(company_id);

-- One row per settled invoice. Access and the monthly credit both come from
-- here, so a failed renewal simply produces no row.
CREATE TABLE IF NOT EXISTS public.employer_pro_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_subscription_id text NOT NULL,
  stripe_invoice_id text NOT NULL UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  -- Null until the subscription is bound to a company (invoice can arrive first).
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL CHECK (period_end > period_start),
  amount integer NOT NULL CHECK (amount = 20000),
  revoked_at timestamptz,
  revoked_reason text CHECK (revoked_reason IN ('refunded', 'disputed', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A corrected or re-sent invoice for the same month cannot mint a second period.
  UNIQUE (stripe_subscription_id, period_start)
);
CREATE INDEX IF NOT EXISTS employer_pro_periods_access ON public.employer_pro_periods(company_id, period_end);

-- ----------------------------------------------------------------------------
-- Spotlight credits and campaigns
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spotlight_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('purchase', 'pro_period', 'manual')),
  order_id uuid UNIQUE REFERENCES public.employer_orders(id) ON DELETE SET NULL,
  period_id uuid UNIQUE REFERENCES public.employer_pro_periods(id) ON DELETE SET NULL,
  -- Pro credits expire with their paid period; purchased ones do not.
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'redeemed', 'frozen', 'void')),
  granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'purchase') = (order_id IS NOT NULL)),
  CHECK ((source = 'pro_period') = (period_id IS NOT NULL)),
  CHECK (source <> 'manual' OR granted_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS spotlight_credits_company ON public.spotlight_credits(company_id, status);

CREATE TABLE IF NOT EXISTS public.spotlight_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid NOT NULL UNIQUE REFERENCES public.spotlight_credits(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'scheduled', 'live', 'ended', 'cancelled')),
  requested_start date NOT NULL,
  -- The seven days start when the website placement goes live.
  starts_at timestamptz,
  ends_at timestamptz,
  ended_reason text CHECK (ended_reason IN ('completed', 'job_closed', 'refunded', 'manual')),
  website_url text CHECK (website_url ~ '^https://'),
  facebook_url text CHECK (facebook_url ~ '^https://'),
  instagram_url text CHECK (instagram_url ~ '^https://'),
  -- Private screenshots of each placement (spotlight-evidence bucket paths).
  evidence_paths text[] NOT NULL DEFAULT '{}' CHECK (cardinality(evidence_paths) <= 6),
  proof_sent_at timestamptz,
  edit_used_at timestamptz,
  day3_checked_at timestamptz,
  report_sent_at timestamptz,
  needs_review boolean NOT NULL DEFAULT false,
  -- Whether the listing was already featured editorially when this went live,
  -- so ending the campaign never removes an editorial feature.
  was_featured boolean,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (status <> 'live' OR starts_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS spotlight_campaigns_job ON public.spotlight_campaigns(job_id, status);
CREATE INDEX IF NOT EXISTS spotlight_campaigns_status ON public.spotlight_campaigns(status, ends_at);

-- ----------------------------------------------------------------------------
-- Stripe events, applied once
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employer_billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  outcome text NOT NULL,
  order_id uuid REFERENCES public.employer_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- The paid featured window on a listing
-- ----------------------------------------------------------------------------
ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS spotlight_until timestamptz;
COMMENT ON COLUMN public.job_listings.spotlight_until IS
  'End of the live paid Spotlight window. Written only by the server. While it is set, is_featured is on because of a Spotlight; is_featured with no spotlight_until is an editorial feature.';

CREATE OR REPLACE FUNCTION public.guard_listing_spotlight()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('service_role', '')
    AND NEW.spotlight_until IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN OLD.spotlight_until ELSE NULL END)
  THEN
    RAISE EXCEPTION 'Spotlight placement is managed by the server';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_listing_spotlight ON public.job_listings;
CREATE TRIGGER guard_listing_spotlight BEFORE INSERT OR UPDATE ON public.job_listings
  FOR EACH ROW EXECUTE FUNCTION public.guard_listing_spotlight();

-- ----------------------------------------------------------------------------
-- Access: the server writes, owners read their own
-- ----------------------------------------------------------------------------
ALTER TABLE public.employer_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_pro_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_pro_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotlight_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotlight_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employer_billing_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.employer_billing_settings, public.employer_orders, public.employer_pro_subscriptions,
  public.employer_pro_periods, public.spotlight_credits, public.spotlight_campaigns, public.employer_billing_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.employer_billing_settings, public.employer_orders, public.employer_pro_subscriptions,
  public.employer_pro_periods, public.spotlight_credits, public.spotlight_campaigns, public.employer_billing_events
  TO service_role;

CREATE OR REPLACE FUNCTION public.employer_billing_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('service_role', '') THEN
    RAISE EXCEPTION 'Employer billing records are managed by the server';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employer_billing_settings', 'employer_orders', 'employer_pro_subscriptions',
    'employer_pro_periods', 'spotlight_credits', 'spotlight_campaigns', 'employer_billing_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS employer_billing_server_only ON public.%I', t);
    EXECUTE format('CREATE TRIGGER employer_billing_server_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.employer_billing_server_only()', t);
  END LOOP;
END $$;

-- A redeemed credit stays redeemed, and a credit can only be spent by its company.
CREATE OR REPLACE FUNCTION public.guard_spotlight_credit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'redeemed' AND NEW.status = 'available' AND EXISTS (
    SELECT 1 FROM public.spotlight_campaigns WHERE credit_id = OLD.id AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'A credit with a campaign cannot be returned';
  END IF;
  IF OLD.company_id IS NOT NULL AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'A credit cannot move to another company';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_spotlight_credit ON public.spotlight_credits;
CREATE TRIGGER guard_spotlight_credit BEFORE UPDATE ON public.spotlight_credits
  FOR EACH ROW EXECUTE FUNCTION public.guard_spotlight_credit();

-- No two paid windows on the same job may overlap, and only one campaign per
-- job may be waiting to start at a time.
CREATE OR REPLACE FUNCTION public.guard_spotlight_campaign()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('requested', 'scheduled') AND EXISTS (
    SELECT 1 FROM public.spotlight_campaigns c
    WHERE c.job_id = NEW.job_id AND c.id <> NEW.id AND c.status IN ('requested', 'scheduled', 'live')
  ) THEN
    RAISE EXCEPTION 'This vacancy already has a Spotlight booked or running';
  END IF;
  IF NEW.starts_at IS NOT NULL AND NEW.status IN ('live', 'ended') AND EXISTS (
    SELECT 1 FROM public.spotlight_campaigns c
    WHERE c.job_id = NEW.job_id AND c.id <> NEW.id AND c.starts_at IS NOT NULL
      AND tstzrange(c.starts_at, c.ends_at) && tstzrange(NEW.starts_at, NEW.ends_at)
  ) THEN
    RAISE EXCEPTION 'Spotlight windows on the same vacancy cannot overlap';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.credit_id IS DISTINCT FROM OLD.credit_id OR NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.company_id IS DISTINCT FROM OLD.company_id)
  THEN
    RAISE EXCEPTION 'A campaign cannot change its credit, company or vacancy';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('ended', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'A finished campaign cannot be reopened';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_spotlight_campaign ON public.spotlight_campaigns;
CREATE TRIGGER guard_spotlight_campaign BEFORE INSERT OR UPDATE ON public.spotlight_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_spotlight_campaign();

-- ----------------------------------------------------------------------------
-- Entitlement
-- ----------------------------------------------------------------------------
-- Pro means a settled billing period covering now (with a one-day allowance
-- for a renewal invoice that settles a little after the period turns), or a
-- manual / complimentary grant on the company row.
CREATE OR REPLACE FUNCTION public.employer_has_pro(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employer_pro_periods p
    WHERE p.company_id = p_company_id AND p.revoked_at IS NULL
      AND p.period_start <= now() AND now() < p.period_end + interval '1 day'
  ) OR EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = p_company_id AND c.is_pro = true AND (c.pro_expires_at IS NULL OR c.pro_expires_at > now())
  );
$$;
REVOKE ALL ON FUNCTION public.employer_has_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.employer_has_pro(uuid) TO service_role;

-- Row security for the candidate directory: open to every employer while the
-- gate is off, Pro only once it is on.
CREATE OR REPLACE FUNCTION public.employer_directory_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT coalesce((SELECT directory_gated FROM public.employer_billing_settings), false)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id = auth.uid() AND public.employer_has_pro(c.id))
    OR coalesce((SELECT is_admin FROM public.users WHERE id = auth.uid()), false);
$$;
REVOKE ALL ON FUNCTION public.employer_directory_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employer_directory_allowed() TO authenticated, service_role;

-- Permissive policies let any employer read visible profiles. They are replaced by one that
-- also require directory access. Own applicants stay readable through
-- "Employers can view applicant profiles", which is unchanged.
-- The oldest name from the original schema is dropped too, in case it lingers anywhere.
DROP POLICY IF EXISTS "Employers can view actively looking profiles" ON public.seeker_profiles;
DROP POLICY IF EXISTS "Employers can browse visible profiles" ON public.seeker_profiles;
DROP POLICY IF EXISTS "Employers can view browsable profiles" ON public.seeker_profiles;
CREATE POLICY "Employers can view browsable profiles" ON public.seeker_profiles
  FOR SELECT USING (
    visibility = ANY (ARRAY['actively_looking'::visibility_mode, 'open'::visibility_mode])
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'employer'::user_role)
    AND EXISTS (SELECT 1 FROM public.companies c WHERE c.user_id = auth.uid())
    AND public.employer_directory_allowed()
  );

-- ----------------------------------------------------------------------------
-- Atomic operations (server only)
-- ----------------------------------------------------------------------------

-- Claim a Stripe event. Returns false if it was already applied.
CREATE OR REPLACE FUNCTION public.claim_employer_billing_event(p_event_id text, p_event_type text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO employer_billing_events(event_id, event_type, outcome) VALUES (p_event_id, p_event_type, 'pending')
    ON CONFLICT (event_id) DO NOTHING;
  RETURN FOUND;
END $$;

-- A one-off Spotlight payment that has settled. Matches the order by its
-- reference; a payment with no known reference becomes an unassigned order.
-- Creates exactly one credit per checkout session.
CREATE OR REPLACE FUNCTION public.record_spotlight_payment(
  p_event_id text, p_event_type text, p_session_id text, p_reference text, p_payment_intent text,
  p_customer_id text, p_customer_email text, p_amount integer, p_currency text, p_livemode boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o employer_orders; c spotlight_credits; ref uuid;
BEGIN
  IF p_amount <> 12500 OR p_currency <> 'xcd' THEN RAISE EXCEPTION 'spotlight_amount_mismatch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id, 0));
  INSERT INTO employer_billing_events(event_id, event_type, outcome) VALUES (p_event_id, p_event_type, 'pending')
    ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;

  SELECT * INTO o FROM employer_orders WHERE stripe_checkout_session_id = p_session_id FOR UPDATE;
  IF NOT FOUND AND p_reference ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    ref := p_reference::uuid;
    SELECT * INTO o FROM employer_orders WHERE reference = ref AND offer = 'spotlight' AND status = 'started' FOR UPDATE;
  END IF;

  IF o.id IS NULL THEN
    INSERT INTO employer_orders(offer, status, livemode, amount, currency, stripe_checkout_session_id, stripe_payment_intent_id,
      stripe_customer_id, customer_email, paid_at, needs_review, review_reason)
    VALUES ('spotlight', 'paid', p_livemode, p_amount, p_currency, p_session_id, p_payment_intent, p_customer_id,
      left(p_customer_email, 254), now(), true, 'unassigned')
    RETURNING * INTO o;
  ELSIF o.status = 'started' THEN
    IF o.livemode <> p_livemode THEN RAISE EXCEPTION 'livemode_mismatch'; END IF;
    UPDATE employer_orders SET status = 'paid', amount = p_amount, currency = p_currency, stripe_checkout_session_id = p_session_id,
      stripe_payment_intent_id = p_payment_intent, stripe_customer_id = p_customer_id, customer_email = left(p_customer_email, 254),
      paid_at = now(), updated_at = now(),
      needs_review = company_id IS NULL, review_reason = CASE WHEN company_id IS NULL THEN 'unassigned' ELSE review_reason END
    WHERE id = o.id RETURNING * INTO o;
  END IF;

  INSERT INTO spotlight_credits(company_id, source, order_id) VALUES (o.company_id, 'purchase', o.id)
    ON CONFLICT (order_id) DO NOTHING;
  UPDATE employer_billing_events SET outcome = CASE WHEN o.company_id IS NULL THEN 'unassigned' ELSE 'applied' END, order_id = o.id
    WHERE event_id = p_event_id;
  RETURN jsonb_build_object('outcome', CASE WHEN o.company_id IS NULL THEN 'unassigned' ELSE 'applied' END,
    'orderId', o.id, 'companyId', o.company_id);
END $$;

-- A Pro checkout has completed: bind the subscription to the company in the
-- order. Periods and credits that arrived first are assigned now.
CREATE OR REPLACE FUNCTION public.record_pro_checkout(
  p_event_id text, p_event_type text, p_session_id text, p_reference text, p_subscription_id text,
  p_customer_id text, p_customer_email text, p_livemode boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o employer_orders; ref uuid; dup boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_subscription_id, 0));
  INSERT INTO employer_billing_events(event_id, event_type, outcome) VALUES (p_event_id, p_event_type, 'pending')
    ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;

  SELECT * INTO o FROM employer_orders WHERE stripe_subscription_id = p_subscription_id FOR UPDATE;
  IF NOT FOUND AND p_reference ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    ref := p_reference::uuid;
    SELECT * INTO o FROM employer_orders WHERE reference = ref AND offer = 'pro' AND status = 'started' FOR UPDATE;
  END IF;

  IF o.id IS NULL THEN
    INSERT INTO employer_orders(offer, status, livemode, amount, currency, stripe_checkout_session_id, stripe_subscription_id,
      stripe_customer_id, customer_email, paid_at, needs_review, review_reason)
    VALUES ('pro', 'paid', p_livemode, 20000, 'xcd', p_session_id, p_subscription_id, p_customer_id, left(p_customer_email, 254),
      now(), true, 'unassigned')
    RETURNING * INTO o;
  ELSIF o.status = 'started' THEN
    IF o.livemode <> p_livemode THEN RAISE EXCEPTION 'livemode_mismatch'; END IF;
    -- A company that already has another live Pro subscription is flagged for review.
    dup := o.company_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM employer_pro_subscriptions s
      WHERE s.company_id = o.company_id AND s.stripe_subscription_id <> p_subscription_id AND s.status IN ('active', 'trialing', 'past_due'));
    UPDATE employer_orders SET status = 'paid', amount = 20000, currency = 'xcd', stripe_checkout_session_id = p_session_id,
      stripe_subscription_id = p_subscription_id, stripe_customer_id = p_customer_id, customer_email = left(p_customer_email, 254),
      paid_at = now(), updated_at = now(),
      needs_review = company_id IS NULL OR dup,
      review_reason = CASE WHEN company_id IS NULL THEN 'unassigned' WHEN dup THEN 'duplicate_subscription' ELSE review_reason END
    WHERE id = o.id RETURNING * INTO o;
  END IF;

  INSERT INTO employer_pro_subscriptions(stripe_subscription_id, company_id, order_id, stripe_customer_id, livemode)
    VALUES (p_subscription_id, o.company_id, o.id, p_customer_id, p_livemode)
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      company_id = coalesce(employer_pro_subscriptions.company_id, excluded.company_id),
      order_id = coalesce(employer_pro_subscriptions.order_id, excluded.order_id),
      stripe_customer_id = coalesce(employer_pro_subscriptions.stripe_customer_id, excluded.stripe_customer_id),
      updated_at = now();

  PERFORM assign_pro_subscription_company(p_subscription_id);
  UPDATE employer_billing_events SET outcome = CASE WHEN o.company_id IS NULL THEN 'unassigned' ELSE 'applied' END, order_id = o.id
    WHERE event_id = p_event_id;
  RETURN jsonb_build_object('outcome', CASE WHEN o.company_id IS NULL THEN 'unassigned' ELSE 'applied' END,
    'orderId', o.id, 'companyId', o.company_id, 'duplicateSubscription', dup);
END $$;

-- Copy the subscription's company onto periods and credits that do not have one yet.
CREATE OR REPLACE FUNCTION public.assign_pro_subscription_company(p_subscription_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE company uuid;
BEGIN
  SELECT company_id INTO company FROM employer_pro_subscriptions WHERE stripe_subscription_id = p_subscription_id;
  IF company IS NULL THEN RETURN; END IF;
  UPDATE employer_pro_periods SET company_id = company WHERE stripe_subscription_id = p_subscription_id AND company_id IS NULL;
  UPDATE spotlight_credits SET company_id = company
    WHERE company_id IS NULL AND period_id IN (SELECT id FROM employer_pro_periods WHERE stripe_subscription_id = p_subscription_id);
END $$;

-- A settled Pro invoice: one paid period and one Spotlight credit, once.
CREATE OR REPLACE FUNCTION public.record_pro_invoice(
  p_event_id text, p_event_type text, p_invoice_id text, p_subscription_id text, p_payment_intent text,
  p_customer_id text, p_period_start timestamptz, p_period_end timestamptz, p_amount integer, p_currency text, p_livemode boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s employer_pro_subscriptions; p employer_pro_periods;
BEGIN
  IF p_amount <> 20000 OR p_currency <> 'xcd' THEN RAISE EXCEPTION 'pro_amount_mismatch'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_subscription_id, 0));
  INSERT INTO employer_billing_events(event_id, event_type, outcome) VALUES (p_event_id, p_event_type, 'pending')
    ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;

  -- The invoice can arrive before the checkout: remember the subscription without a company.
  INSERT INTO employer_pro_subscriptions(stripe_subscription_id, stripe_customer_id, livemode)
    VALUES (p_subscription_id, p_customer_id, p_livemode) ON CONFLICT (stripe_subscription_id) DO NOTHING;
  SELECT * INTO s FROM employer_pro_subscriptions WHERE stripe_subscription_id = p_subscription_id;
  IF s.livemode <> p_livemode THEN RAISE EXCEPTION 'livemode_mismatch'; END IF;

  INSERT INTO employer_pro_periods(stripe_subscription_id, stripe_invoice_id, stripe_payment_intent_id, company_id,
    period_start, period_end, amount)
  VALUES (p_subscription_id, p_invoice_id, p_payment_intent, s.company_id, p_period_start, p_period_end, p_amount)
  ON CONFLICT DO NOTHING
  RETURNING * INTO p;
  IF p.id IS NULL THEN
    UPDATE employer_billing_events SET outcome = 'period_exists' WHERE event_id = p_event_id;
    RETURN jsonb_build_object('outcome', 'period_exists');
  END IF;

  INSERT INTO spotlight_credits(company_id, source, period_id, expires_at) VALUES (s.company_id, 'pro_period', p.id, p.period_end);
  UPDATE employer_billing_events SET outcome = CASE WHEN s.company_id IS NULL THEN 'unassigned' ELSE 'applied' END
    WHERE event_id = p_event_id;
  RETURN jsonb_build_object('outcome', CASE WHEN s.company_id IS NULL THEN 'unassigned' ELSE 'applied' END,
    'periodId', p.id, 'companyId', s.company_id);
END $$;

-- Staff, or a verified owner, assign an unassigned paid order to a company.
CREATE OR REPLACE FUNCTION public.assign_employer_order(p_order_id uuid, p_company_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o employer_orders;
BEGIN
  SELECT * INTO STRICT o FROM employer_orders WHERE id = p_order_id FOR UPDATE;
  IF o.status <> 'paid' THEN RAISE EXCEPTION 'order_not_paid'; END IF;
  IF o.company_id IS NOT NULL AND o.company_id <> p_company_id THEN RAISE EXCEPTION 'order_already_assigned'; END IF;
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_company_id) THEN RAISE EXCEPTION 'company_not_found'; END IF;
  UPDATE employer_orders SET company_id = p_company_id, claimed_at = now(), claimed_by = p_actor_id,
    needs_review = false, review_reason = NULL, updated_at = now() WHERE id = o.id;
  UPDATE spotlight_credits SET company_id = p_company_id WHERE order_id = o.id AND company_id IS NULL;
  IF o.stripe_subscription_id IS NOT NULL THEN
    UPDATE employer_pro_subscriptions SET company_id = p_company_id, updated_at = now()
      WHERE stripe_subscription_id = o.stripe_subscription_id AND company_id IS NULL;
    PERFORM assign_pro_subscription_company(o.stripe_subscription_id);
  END IF;
  RETURN jsonb_build_object('success', true);
END $$;

-- Spend one credit on one active vacancy the company owns. Locks the credit,
-- so two requests at once cannot both spend it.
CREATE OR REPLACE FUNCTION public.redeem_spotlight_credit(
  p_credit_id uuid, p_company_id uuid, p_job_id uuid, p_requested_start date, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c spotlight_credits; campaign spotlight_campaigns;
BEGIN
  SELECT * INTO c FROM spotlight_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND OR c.company_id IS DISTINCT FROM p_company_id THEN RAISE EXCEPTION 'credit_not_found'; END IF;
  IF c.status <> 'available' THEN RAISE EXCEPTION 'credit_unavailable'; END IF;
  IF c.expires_at IS NOT NULL AND c.expires_at <= now() THEN RAISE EXCEPTION 'credit_expired'; END IF;
  IF NOT EXISTS (SELECT 1 FROM job_listings WHERE id = p_job_id AND company_id = p_company_id AND status = 'active') THEN
    RAISE EXCEPTION 'job_not_eligible';
  END IF;
  INSERT INTO spotlight_campaigns(credit_id, company_id, job_id, requested_start, requested_by)
    VALUES (c.id, p_company_id, p_job_id, p_requested_start, p_actor_id) RETURNING * INTO campaign;
  UPDATE spotlight_credits SET status = 'redeemed' WHERE id = c.id;
  RETURN jsonb_build_object('campaignId', campaign.id);
END $$;

-- Cancel a campaign that has not gone live; the credit becomes available again
-- (it keeps its original expiry).
CREATE OR REPLACE FUNCTION public.cancel_spotlight_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE campaign spotlight_campaigns;
BEGIN
  SELECT * INTO STRICT campaign FROM spotlight_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF campaign.status NOT IN ('requested', 'scheduled') THEN RAISE EXCEPTION 'campaign_started'; END IF;
  UPDATE spotlight_campaigns SET status = 'cancelled', ended_reason = 'manual' WHERE id = campaign.id;
  UPDATE spotlight_credits SET status = 'available' WHERE id = campaign.credit_id AND status = 'redeemed';
  RETURN jsonb_build_object('success', true);
END $$;

-- Go live: the seven days (168 hours) begin now and the listing is featured
-- until then. A campaign funded by a credit that expired in the meantime still
-- gets its full seven days, because the credit was spent when it was booked.
CREATE OR REPLACE FUNCTION public.start_spotlight_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE campaign spotlight_campaigns; ends timestamptz := now() + interval '168 hours';
BEGIN
  SELECT * INTO STRICT campaign FROM spotlight_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF campaign.status NOT IN ('requested', 'scheduled') THEN RAISE EXCEPTION 'campaign_not_startable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM job_listings WHERE id = campaign.job_id AND status = 'active') THEN RAISE EXCEPTION 'job_not_active'; END IF;
  IF EXISTS (SELECT 1 FROM spotlight_credits WHERE id = campaign.credit_id AND status <> 'redeemed') THEN
    RAISE EXCEPTION 'credit_not_redeemed';
  END IF;
  UPDATE spotlight_campaigns SET status = 'live', starts_at = now(), ends_at = ends,
    was_featured = (SELECT is_featured FROM job_listings WHERE id = campaign.job_id) WHERE id = campaign.id;
  -- is_featured is what every page and the mobile app already sort and badge by.
  UPDATE job_listings SET spotlight_until = ends, is_featured = true WHERE id = campaign.job_id;
  RETURN jsonb_build_object('endsAt', ends);
END $$;

-- End a live campaign: at 168 hours, when the vacancy closes, on a refund, or by staff.
CREATE OR REPLACE FUNCTION public.end_spotlight_campaign(p_campaign_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE campaign spotlight_campaigns;
BEGIN
  IF p_reason NOT IN ('completed', 'job_closed', 'refunded', 'manual') THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  SELECT * INTO STRICT campaign FROM spotlight_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF campaign.status <> 'live' THEN RETURN jsonb_build_object('outcome', 'not_live'); END IF;
  UPDATE spotlight_campaigns SET status = 'ended', ended_reason = p_reason,
    ends_at = CASE WHEN p_reason = 'completed' THEN ends_at ELSE least(ends_at, now()) END WHERE id = campaign.id;
  UPDATE job_listings SET spotlight_until = NULL,
    is_featured = CASE WHEN coalesce(campaign.was_featured, false) THEN is_featured ELSE false END
  WHERE id = campaign.job_id AND spotlight_until IS NOT NULL;
  RETURN jsonb_build_object('outcome', 'ended');
END $$;

-- A refund or dispute on a Spotlight order or a Pro invoice. Unspent credits
-- are frozen; anything already delivered is flagged for support review. A full
-- refund of a Pro month also ends access for that month.
CREATE OR REPLACE FUNCTION public.reconcile_employer_refund(
  p_event_id text, p_event_type text, p_payment_intent text, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE o employer_orders; p employer_pro_periods; credit_ids uuid[];
BEGIN
  IF p_kind NOT IN ('refunded', 'partial_refund', 'disputed') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  INSERT INTO employer_billing_events(event_id, event_type, outcome) VALUES (p_event_id, p_event_type, 'pending')
    ON CONFLICT (event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'duplicate'); END IF;

  SELECT * INTO o FROM employer_orders WHERE stripe_payment_intent_id = p_payment_intent FOR UPDATE;
  SELECT * INTO p FROM employer_pro_periods WHERE stripe_payment_intent_id = p_payment_intent FOR UPDATE;
  IF o.id IS NULL AND p.id IS NULL THEN
    UPDATE employer_billing_events SET outcome = 'unrelated' WHERE event_id = p_event_id;
    RETURN jsonb_build_object('outcome', 'unrelated');
  END IF;

  SELECT array_agg(id) INTO credit_ids FROM spotlight_credits
    WHERE (o.id IS NOT NULL AND order_id = o.id) OR (p.id IS NOT NULL AND period_id = p.id);

  IF p_kind <> 'partial_refund' THEN
    UPDATE spotlight_credits SET status = 'frozen' WHERE id = ANY (credit_ids) AND status = 'available';
    UPDATE spotlight_campaigns SET needs_review = true WHERE credit_id = ANY (credit_ids) AND status <> 'cancelled';
  END IF;
  IF o.id IS NOT NULL THEN
    UPDATE employer_orders SET needs_review = true, review_reason = p_kind,
      status = CASE WHEN p_kind = 'partial_refund' THEN status ELSE p_kind END, updated_at = now() WHERE id = o.id;
  END IF;
  IF p.id IS NOT NULL AND p_kind = 'refunded' THEN
    UPDATE employer_pro_periods SET revoked_at = now(), revoked_reason = 'refunded' WHERE id = p.id AND revoked_at IS NULL;
  END IF;
  UPDATE employer_billing_events SET outcome = p_kind, order_id = o.id WHERE event_id = p_event_id;
  RETURN jsonb_build_object('outcome', p_kind, 'orderId', o.id, 'periodId', p.id);
END $$;

REVOKE ALL ON FUNCTION
  public.claim_employer_billing_event(text, text),
  public.record_spotlight_payment(text, text, text, text, text, text, text, integer, text, boolean),
  public.record_pro_checkout(text, text, text, text, text, text, text, boolean),
  public.assign_pro_subscription_company(text),
  public.record_pro_invoice(text, text, text, text, text, text, timestamptz, timestamptz, integer, text, boolean),
  public.assign_employer_order(uuid, uuid, uuid),
  public.redeem_spotlight_credit(uuid, uuid, uuid, date, uuid),
  public.cancel_spotlight_campaign(uuid),
  public.start_spotlight_campaign(uuid),
  public.end_spotlight_campaign(uuid, text),
  public.reconcile_employer_refund(text, text, text, text),
  public.employer_billing_server_only(), public.guard_spotlight_credit(), public.guard_spotlight_campaign(),
  public.guard_listing_spotlight()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.claim_employer_billing_event(text, text),
  public.record_spotlight_payment(text, text, text, text, text, text, text, integer, text, boolean),
  public.record_pro_checkout(text, text, text, text, text, text, text, boolean),
  public.assign_pro_subscription_company(text),
  public.record_pro_invoice(text, text, text, text, text, text, timestamptz, timestamptz, integer, text, boolean),
  public.assign_employer_order(uuid, uuid, uuid),
  public.redeem_spotlight_credit(uuid, uuid, uuid, date, uuid),
  public.cancel_spotlight_campaign(uuid),
  public.start_spotlight_campaign(uuid),
  public.end_spotlight_campaign(uuid, text),
  public.reconcile_employer_refund(text, text, text, text)
  TO service_role;

-- ----------------------------------------------------------------------------
-- Private evidence (screenshots of each placement)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('spotlight-evidence', 'spotlight-evidence', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'spotlight-evidence' AND public) THEN
    RAISE EXCEPTION 'spotlight_evidence_bucket_must_be_private';
  END IF;
END $$;
DROP POLICY IF EXISTS spotlight_evidence_no_browser_objects ON storage.objects;
CREATE POLICY spotlight_evidence_no_browser_objects ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated
  USING (bucket_id <> 'spotlight-evidence')
  WITH CHECK (bucket_id <> 'spotlight-evidence');

COMMIT;
