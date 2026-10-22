-- UNAPPLIED SOL V2 REVIEW DRAFT. Local synthetic fixtures only; no live approval.
-- Prerequisite: installed fixed global US$5 UTC-month budget and inline adapter.
-- Stop/drain paid callers and leave every paid configuration disabled for install.
-- This adds a one-time count claim and counted-input RPC, not a queue, retry, or budget scope.
-- Existing Luna RPC definitions, rows, rates and accounting history are untouched.
-- Never drop, reset, rename, migrate or split the existing money ledgers.
--
-- Trust boundary: ONLY server-owned code may call this service-role-only RPC.
-- Before counting, the server freezes the complete text-only Responses request and
-- consumes its permanent claim, then obtains input_tokens from POST /v1/responses/input_tokens using that exact model,
-- input, instructions, low reasoning and strict output schema. It binds SHA-256
-- of the frozen generation request, then rechecks the returned hash/model/count/
-- output/tier/cutoff immediately before dispatch. No user-supplied count proof.
-- Force service_tier=default; forbid tools, hidden conversation state, truncation,
-- retries, Fast/Ultrafast, 12h caching and extra billable features. Use explicit
-- caching with no breakpoints (no cache use/writes). Rates nevertheless reserve
-- long-context 30m cache-write input $5/M and output $15/M, each with 10% region
-- premium: 5,500,000 and 16,500,000 microUSD/M. 16000+2048 =>121792 microUSD.
-- The count endpoint is NOT documented as free. Following the official spend
-- controller pattern, enforce one-time admission and headroom BEFORE counting.
-- This ledger bounds generation reservations; it does not establish unspecified
-- count-endpoint pricing or an account-wide billing cap. Never claim count-free.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE employer_delivery.budget_configuration, employer_delivery.budget_reservations,
  employer_delivery.budget_months, employer_delivery.budget_days,
  employer_delivery.inline_attempts IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM employer_delivery.budget_configuration WHERE enabled) THEN
    RAISE EXCEPTION 'DISABLE_PAID_CONFIGURATIONS_BEFORE_SOL_V2_INSTALL';
  END IF;
END $$;

-- Reuse the existing permanent application marker instead of a second attempt
-- ledger. Old Luna markers remain all-NULL; v2 claims carry server-only proof.
ALTER TABLE employer_delivery.inline_attempts
  ADD COLUMN review_preflight_nonce uuid UNIQUE,
  ADD COLUMN review_request_sha256 text,
  ADD COLUMN review_config_id text REFERENCES employer_delivery.budget_configuration(id),
  ADD COLUMN review_snapshot_sha256 text,
  ADD COLUMN review_applicant_user_id uuid,
  ADD CONSTRAINT inline_review_preflight_proof CHECK (
    (review_preflight_nonce IS NULL AND review_request_sha256 IS NULL
      AND review_config_id IS NULL AND review_snapshot_sha256 IS NULL
      AND review_applicant_user_id IS NULL)
    OR (review_preflight_nonce IS NOT NULL AND review_request_sha256 IS NOT NULL
      AND review_request_sha256 ~ '^[a-f0-9]{64}$' AND review_config_id IS NOT NULL
      AND review_snapshot_sha256 IS NOT NULL AND review_snapshot_sha256 ~ '^[a-f0-9]{64}$'
      AND review_applicant_user_id IS NOT NULL)
  );

-- Nullable additions preserve every existing reservation byte-for-byte except
-- new NULL metadata. The original shared application unique key is retained.
ALTER TABLE employer_delivery.budget_reservations
  ADD COLUMN review_request_sha256 text,
  ADD COLUMN review_token_count_source text,
  ADD CONSTRAINT budget_reservation_review_proof CHECK (
    (review_request_sha256 IS NULL AND review_token_count_source IS NULL)
    OR (review_request_sha256 IS NOT NULL AND review_request_sha256 ~ '^[a-f0-9]{64}$'
      AND review_token_count_source IS NOT NULL
      AND review_token_count_source = 'responses_input_tokens'
      AND model = 'gpt-6.1-sol' AND input_token_ceiling BETWEEN 1 AND 16000
      AND max_output_tokens = 2048 AND outbox_id IS NULL
      AND inline_application_id = application_id)
  );

CREATE FUNCTION public.employer_screening_claim_review_v2(
  p_application_id uuid, p_applicant_user_id uuid, p_snapshot_sha256 text,
  p_config_id text, p_request_sha256 text, p_deadline timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '1s' AS $$
DECLARE
  c employer_delivery.budget_configuration;
  nonce uuid := gen_random_uuid();
  account uuid;
  d date;
  m date;
  initial_at timestamptz;
  dispatch_at timestamptz;
  dispatch_not_after timestamptz;
  cost bigint;
  used bigint;
  monthly_used bigint;
BEGIN
  initial_at := clock_timestamp();
  IF p_application_id IS NULL OR p_applicant_user_id IS NULL
    OR p_snapshot_sha256 IS NULL OR p_snapshot_sha256 !~ '^[a-f0-9]{64}$'
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$'
    OR p_deadline IS NULL OR NOT isfinite(p_deadline) OR p_deadline <= initial_at
    THEN RETURN NULL; END IF;

  -- Only the original, owned application path may request inline screening.
  -- Admin-managed/company-contact jobs are valid: owner role is not a gate.
  -- Hold the active job row stable through authorization, including ledger waits.
  -- No outbox lookup, enqueue, lease, rubric, storage capture or email send here.
  SELECT company.user_id INTO account
  FROM public.applications a
  JOIN public.seeker_profiles s ON s.id = a.seeker_id
  JOIN public.users applicant ON applicant.id = s.user_id
  JOIN public.job_listings j ON j.id = a.job_id
  JOIN public.companies company ON company.id = j.company_id
  JOIN public.users owner ON owner.id = company.user_id
  WHERE a.id = p_application_id AND a.employer_delivery_path = 'legacy'
    AND s.user_id = p_applicant_user_id AND applicant.role = 'seeker'
    AND NOT applicant.is_banned AND NOT owner.is_banned AND j.status = 'active'
  FOR UPDATE OF a FOR SHARE OF j;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO c FROM employer_delivery.budget_configuration
  WHERE id = p_config_id AND enabled AND context_bound_verified
    AND provider = 'openai' AND model = 'gpt-6.1-sol' FOR SHARE;
  IF NOT FOUND
    OR c.max_input_tokens <> 16000 OR c.max_output_tokens <> 2048
    OR c.input_microusd_per_million < 5500000
    OR c.output_microusd_per_million < 16500000
    THEN RETURN NULL; END IF;

  -- Any previous attempt, including settled/released/uncertain or another path,
  -- is terminal for this application. This never replays dispatch authorization.
  PERFORM 1 FROM employer_delivery.budget_reservations
    WHERE application_id = p_application_id FOR UPDATE;
  IF FOUND OR EXISTS (SELECT 1 FROM employer_delivery.inline_attempts
    WHERE application_id = p_application_id) THEN RETURN NULL; END IF;

  -- Conservative early headroom gate: require the full configured maximum
  -- before any counting HTTP. No money is reserved or refunded by this claim.
  -- Consequently the last <121792 microUSD can remain unusable for counting.
  cost := ceil((c.max_input_tokens::numeric * c.input_microusd_per_million
    + c.max_output_tokens::numeric * c.output_microusd_per_million) / 1000000)::bigint;
  IF cost > c.per_application_microusd OR cost > 5000000 THEN RETURN NULL; END IF;
  d := (initial_at AT TIME ZONE 'UTC')::date;
  m := date_trunc('month', d::timestamp)::date;
  dispatch_not_after := least(p_deadline, initial_at + interval '30 seconds',
    (d::timestamp + interval '1 day') AT TIME ZONE 'UTC');

  -- Function-local lock_timeout bounds each wait (not total statement time).
  -- It restores the caller setting on exit and also covers application/job locks.
  -- Same fixed ledger lock order as the existing outbox path. A new config or
  -- employer is not a new allowance. No money is debited here; any failed claim
  -- INSERT rolls back its unissued attempt marker.
  INSERT INTO employer_delivery.budget_months(month) VALUES (m) ON CONFLICT DO NOTHING;
  SELECT reserved_microusd INTO monthly_used FROM employer_delivery.budget_months
    WHERE scope = 'joblink-screening-api' AND month = m FOR UPDATE;
  INSERT INTO employer_delivery.budget_days(config_id, day) VALUES (c.id, d) ON CONFLICT DO NOTHING;
  SELECT reserved_microusd INTO used FROM employer_delivery.budget_days
    WHERE config_id = c.id AND day = d FOR UPDATE;

  -- Never grant counting after a lock wait crosses its cutoff or UTC period.
  -- The permanent attempt is inserted only after this final headroom check.
  dispatch_at := clock_timestamp();
  IF dispatch_at >= dispatch_not_after
    OR d IS DISTINCT FROM (dispatch_at AT TIME ZONE 'UTC')::date
    OR m IS DISTINCT FROM date_trunc('month', dispatch_at AT TIME ZONE 'UTC')::date
    OR cost > c.daily_microusd - used OR cost > 5000000 - monthly_used
    THEN RETURN NULL; END IF;
  INSERT INTO employer_delivery.inline_attempts(
    application_id, dispatch_not_after, review_preflight_nonce, review_request_sha256,
    review_config_id, review_snapshot_sha256, review_applicant_user_id
  ) VALUES (
    p_application_id, dispatch_not_after, nonce, p_request_sha256,
    p_config_id, p_snapshot_sha256, p_applicant_user_id
  );
  IF clock_timestamp() >= dispatch_not_after THEN
    RAISE EXCEPTION USING ERRCODE = 'JL001', MESSAGE = 'REVIEW_PREFLIGHT_WINDOW_EXPIRED';
  END IF;
  -- Returned only once. No replay/reset/expiry cleanup may yield another count.
  RETURN jsonb_build_object('preflight_nonce', nonce, 'dispatch_not_after', dispatch_not_after);
EXCEPTION WHEN unique_violation OR SQLSTATE 'JL001' THEN
  RETURN NULL;
END $$;

CREATE FUNCTION public.employer_screening_begin_inline_v2(
  p_application_id uuid, p_applicant_user_id uuid, p_snapshot_sha256 text,
  p_config_id text, p_model text, p_input_token_count integer, p_max_output_tokens integer,
  p_request_key text, p_request_sha256 text, p_deadline timestamptz, p_preflight_nonce uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '1s' AS $$
DECLARE
  c employer_delivery.budget_configuration;
  r employer_delivery.budget_reservations;
  preflight employer_delivery.inline_attempts;
  account uuid;
  d date;
  m date;
  initial_at timestamptz;
  dispatch_at timestamptz;
  dispatch_not_after timestamptz;
  cost bigint;
  used bigint;
  monthly_used bigint;
BEGIN
  initial_at := clock_timestamp();
  IF p_application_id IS NULL OR p_applicant_user_id IS NULL
    OR p_snapshot_sha256 IS NULL OR p_snapshot_sha256 !~ '^[a-f0-9]{64}$'
    OR p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 1 AND 200
    OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[a-f0-9]{64}$'
    OR p_preflight_nonce IS NULL
    OR p_model IS DISTINCT FROM 'gpt-6.1-sol'
    OR p_input_token_count IS NULL OR p_input_token_count NOT BETWEEN 1 AND 16000
    OR p_deadline IS NULL OR NOT isfinite(p_deadline) OR p_deadline <= initial_at
    THEN RETURN NULL; END IF;

  -- Only the original, owned application path may request inline screening.
  -- Admin-managed/company-contact jobs are valid: owner role is not a gate.
  -- Hold the active job row stable through authorization, including ledger waits.
  -- No outbox lookup, enqueue, lease, rubric, storage capture or email send here.
  SELECT company.user_id INTO account
  FROM public.applications a
  JOIN public.seeker_profiles s ON s.id = a.seeker_id
  JOIN public.users applicant ON applicant.id = s.user_id
  JOIN public.job_listings j ON j.id = a.job_id
  JOIN public.companies company ON company.id = j.company_id
  JOIN public.users owner ON owner.id = company.user_id
  WHERE a.id = p_application_id AND a.employer_delivery_path = 'legacy'
    AND s.user_id = p_applicant_user_id AND applicant.role = 'seeker'
    AND NOT applicant.is_banned AND NOT owner.is_banned AND j.status = 'active'
  FOR UPDATE OF a FOR SHARE OF j;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO c FROM employer_delivery.budget_configuration
  WHERE id = p_config_id AND enabled AND context_bound_verified
    AND provider = 'openai' AND model = 'gpt-6.1-sol' FOR SHARE;
  IF NOT FOUND
    OR c.model IS DISTINCT FROM p_model
    OR c.max_input_tokens <> 16000 OR c.max_output_tokens <> 2048
    OR c.input_microusd_per_million < 5500000
    OR c.output_microusd_per_million < 16500000
    OR p_input_token_count > c.max_input_tokens
    OR p_max_output_tokens IS NULL OR p_max_output_tokens <> c.max_output_tokens
    THEN RETURN NULL; END IF;

  -- A permanent one-time count claim is required, but any existing generation
  -- reservation is terminal. Wrong, expired or replayed proof never dispatches.
  PERFORM 1 FROM employer_delivery.budget_reservations
    WHERE application_id = p_application_id FOR UPDATE;
  IF FOUND THEN RETURN NULL; END IF;
  SELECT * INTO preflight FROM employer_delivery.inline_attempts
    WHERE application_id = p_application_id FOR UPDATE;
  IF NOT FOUND OR preflight.review_preflight_nonce IS DISTINCT FROM p_preflight_nonce
    OR preflight.review_request_sha256 IS DISTINCT FROM p_request_sha256
    OR preflight.review_snapshot_sha256 IS DISTINCT FROM p_snapshot_sha256
    OR preflight.review_config_id IS DISTINCT FROM p_config_id
    OR preflight.review_applicant_user_id IS DISTINCT FROM p_applicant_user_id
    OR preflight.dispatch_not_after <= initial_at THEN RETURN NULL; END IF;

  -- The server proves this count against the exact frozen Responses request.
  -- Neither character-length estimates nor client-submitted counts are allowed.
  cost := ceil((p_input_token_count::numeric * c.input_microusd_per_million
    + c.max_output_tokens::numeric * c.output_microusd_per_million) / 1000000)::bigint;
  IF cost > c.per_application_microusd OR cost > 5000000 THEN RETURN NULL; END IF;
  d := (initial_at AT TIME ZONE 'UTC')::date;
  m := date_trunc('month', d::timestamp)::date;
  dispatch_not_after := least(p_deadline, preflight.dispatch_not_after, initial_at + interval '30 seconds',
    (d::timestamp + interval '1 day') AT TIME ZONE 'UTC');

  -- Function-local lock_timeout bounds each wait (not total statement time).
  -- It restores the caller setting on exit and also covers application/job locks.
  -- Same fixed ledger and money-lock order as the existing outbox path. A new
  -- config/employer/attempt is not a new allowance. Insert conflicts and errors
  -- roll back the entire function, including both debits. The previously committed count claim stays consumed.
  INSERT INTO employer_delivery.budget_months(month) VALUES (m) ON CONFLICT DO NOTHING;
  SELECT reserved_microusd INTO monthly_used FROM employer_delivery.budget_months
    WHERE scope = 'joblink-screening-api' AND month = m FOR UPDATE;
  INSERT INTO employer_delivery.budget_days(config_id, day) VALUES (c.id, d) ON CONFLICT DO NOTHING;
  SELECT reserved_microusd INTO used FROM employer_delivery.budget_days
    WHERE config_id = c.id AND day = d FOR UPDATE;

  -- Never authorize using the pre-lock clock or an old UTC period. Reserve and
  -- dispatch authorization are one transaction, without a reserve/start gap.
  dispatch_at := clock_timestamp();
  IF dispatch_at >= dispatch_not_after
    OR d IS DISTINCT FROM (dispatch_at AT TIME ZONE 'UTC')::date
    OR m IS DISTINCT FROM date_trunc('month', dispatch_at AT TIME ZONE 'UTC')::date
    OR cost > c.daily_microusd - used OR cost > 5000000 - monthly_used
    THEN RETURN NULL; END IF;
  UPDATE employer_delivery.budget_months SET reserved_microusd = reserved_microusd + cost
    WHERE scope = 'joblink-screening-api' AND month = m;
  UPDATE employer_delivery.budget_days SET reserved_microusd = reserved_microusd + cost
    WHERE config_id = c.id AND day = d;
  INSERT INTO employer_delivery.budget_reservations(
    outbox_id, inline_application_id, account_id, application_id, config_id,
    day, month, lease, snapshot_sha256, request_key, model,
    input_microusd_per_million, output_microusd_per_million, input_token_ceiling,
    max_output_tokens, reserved_microusd, charged_microusd, state, dispatched_at,
    review_request_sha256, review_token_count_source
  ) VALUES (
    NULL, p_application_id, account, p_application_id, c.id,
    d, m, gen_random_uuid(), p_snapshot_sha256, p_request_key, c.model,
    c.input_microusd_per_million, c.output_microusd_per_million, p_input_token_count,
    c.max_output_tokens, cost, cost, 'dispatched', dispatch_at,
    p_request_sha256, 'responses_input_tokens'
  ) RETURNING * INTO r;

  -- Even a unique/FK index wait after ledger locking may cross the cutoff.
  -- Throwing into this function's subtransaction handler undoes all its writes.
  IF clock_timestamp() >= dispatch_not_after THEN
    RAISE EXCEPTION USING ERRCODE = 'JL001', MESSAGE = 'INLINE_DISPATCH_WINDOW_EXPIRED';
  END IF;
  RETURN jsonb_build_object(
    'reservation_id', r.id, 'reserved_microusd', r.reserved_microusd, 'model', r.model,
    'input_microusd_per_million', r.input_microusd_per_million,
    'output_microusd_per_million', r.output_microusd_per_million,
    'input_token_ceiling', r.input_token_ceiling, 'max_output_tokens', r.max_output_tokens,
    'dispatch_not_after', dispatch_not_after, 'config_id', r.config_id,
    'request_sha256', r.review_request_sha256,
    'token_count_source', r.review_token_count_source,
    'reasoning_effort', 'low', 'service_tier', 'default'
  );
EXCEPTION WHEN unique_violation OR SQLSTATE 'JL001' THEN
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.employer_screening_claim_review_v2(uuid,uuid,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employer_screening_claim_review_v2(uuid,uuid,text,text,text,timestamptz)
  TO service_role;
REVOKE ALL ON FUNCTION public.employer_screening_begin_inline_v2(uuid,uuid,text,text,text,integer,integer,text,text,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employer_screening_begin_inline_v2(uuid,uuid,text,text,text,integer,integer,text,text,timestamptz,uuid)
  TO service_role;

-- Reuse employer_screening_settle_inline without replacement. It accepts only
-- trusted bounded usage, enforces receipt uniqueness and refunds original month/
-- day at immutable reservation rates. Missing/invalid/over-limit usage stays held.
-- A successful count claim permanently consumes the application attempt even if
-- counting fails, times out or is never dispatched. A successful begin is charged
-- in full even if transport fails, process crashes, grant expires, or config flips.
-- No release, TTL, cleanup, or alternate model may reclaim an uncertain hold.
-- Distinct immutable model version, DISABLED. This creates no separate budget.
-- Full-context Sol would exceed US$5 and is deliberately never configured here.
INSERT INTO employer_delivery.budget_configuration(
  id, enabled, context_bound_verified, provider, model,
  input_microusd_per_million, output_microusd_per_million,
  max_input_tokens, max_output_tokens, per_application_microusd, daily_microusd
) VALUES (
  'gpt-6.1-sol-20261022-counted-v2', false, true, 'openai', 'gpt-6.1-sol',
  5500000, 16500000, 16000, 2048, 121792, 5000000
);
-- No configuration is enabled by this review draft.
COMMIT;
