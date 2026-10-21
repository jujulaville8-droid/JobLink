-- UNAPPLIED REVIEW DRAFT. Synthetic databases only until separately approved.
-- Prerequisite: the existing fixed US$5 UTC-month budget schema is installed.
-- This is an additive inline adapter, NOT a delivery queue, retry or sweeper.
-- Stop/drain paid callers and leave every paid configuration disabled for install.
-- Do not reset/drop existing ledgers, reservations, configuration or history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE employer_delivery.budget_configuration, employer_delivery.budget_reservations,
  employer_delivery.budget_months, employer_delivery.budget_days IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM employer_delivery.budget_configuration WHERE enabled) THEN
    RAISE EXCEPTION 'DISABLE_PAID_CONFIGURATIONS_BEFORE_INLINE_INSTALL';
  END IF;
END $$;

-- No application FK/cascade: deletion must not erase an attempt or its charge.
-- All prices, usage receipts and balances remain in the original shared tables.
CREATE TABLE employer_delivery.inline_attempts (
  application_id uuid PRIMARY KEY,
  dispatch_not_after timestamptz NOT NULL CHECK (isfinite(dispatch_not_after))
);
ALTER TABLE employer_delivery.inline_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employer_delivery.inline_attempts FROM PUBLIC, anon, authenticated, service_role;

-- Preserve historical non-null outbox provenance. A new null-outbox reservation
-- MUST have matching inline provenance and already be dispatch-authorized. It can
-- never be changed to the pre-dispatch state accepted by the old release RPC.
ALTER TABLE employer_delivery.budget_reservations
  ADD COLUMN inline_application_id uuid REFERENCES employer_delivery.inline_attempts(application_id),
  ALTER COLUMN outbox_id DROP NOT NULL,
  ADD CONSTRAINT budget_reservation_delivery_provenance CHECK (
    (outbox_id IS NOT NULL AND inline_application_id IS NULL)
    OR (outbox_id IS NULL AND inline_application_id IS NOT NULL
      AND inline_application_id = application_id AND dispatched_at IS NOT NULL
      AND state IN ('dispatched', 'uncertain', 'settled'))
  );

CREATE FUNCTION public.employer_screening_begin_inline(
  p_application_id uuid, p_applicant_user_id uuid, p_snapshot_sha256 text,
  p_config_id text, p_input_token_ceiling integer, p_max_output_tokens integer,
  p_request_key text, p_deadline timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '1s' AS $$
DECLARE
  c employer_delivery.budget_configuration;
  r employer_delivery.budget_reservations;
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
    AND provider = 'openai' AND model = 'gpt-6-luna' FOR SHARE;
  IF NOT FOUND
    OR (p_input_token_ceiling IS NOT NULL AND p_input_token_ceiling <> c.max_input_tokens)
    OR p_max_output_tokens IS NULL OR p_max_output_tokens <> c.max_output_tokens
    THEN RETURN NULL; END IF;

  -- Any previous attempt, including settled/released/uncertain or another path,
  -- is terminal for this application. This never replays dispatch authorization.
  PERFORM 1 FROM employer_delivery.budget_reservations
    WHERE application_id = p_application_id FOR UPDATE;
  IF FOUND OR EXISTS (SELECT 1 FROM employer_delivery.inline_attempts
    WHERE application_id = p_application_id) THEN RETURN NULL; END IF;

  cost := ceil((c.max_input_tokens::numeric * c.input_microusd_per_million
    + c.max_output_tokens::numeric * c.output_microusd_per_million) / 1000000)::bigint;
  IF cost > c.per_application_microusd OR cost > 5000000 THEN RETURN NULL; END IF;
  d := (initial_at AT TIME ZONE 'UTC')::date;
  m := date_trunc('month', d::timestamp)::date;
  dispatch_not_after := least(p_deadline, initial_at + interval '30 seconds',
    (d::timestamp + interval '1 day') AT TIME ZONE 'UTC');

  -- Function-local lock_timeout bounds each wait (not total statement time).
  -- It restores the caller setting on exit and also covers application/job locks.
  -- Same fixed ledger and money-lock order as the existing outbox path. A new
  -- config/employer/attempt is not a new allowance. Insert conflicts and errors
  -- roll back the entire function, including both debits and the attempt marker.
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
  INSERT INTO employer_delivery.inline_attempts(application_id, dispatch_not_after)
    VALUES (p_application_id, dispatch_not_after);
  INSERT INTO employer_delivery.budget_reservations(
    outbox_id, inline_application_id, account_id, application_id, config_id,
    day, month, lease, snapshot_sha256, request_key, model,
    input_microusd_per_million, output_microusd_per_million, input_token_ceiling,
    max_output_tokens, reserved_microusd, charged_microusd, state, dispatched_at
  ) VALUES (
    NULL, p_application_id, account, p_application_id, c.id,
    d, m, gen_random_uuid(), p_snapshot_sha256, p_request_key, c.model,
    c.input_microusd_per_million, c.output_microusd_per_million, c.max_input_tokens,
    c.max_output_tokens, cost, cost, 'dispatched', dispatch_at
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
    'dispatch_not_after', dispatch_not_after
  );
EXCEPTION WHEN unique_violation OR SQLSTATE 'JL001' THEN
  RETURN NULL;
END $$;

CREATE FUNCTION public.employer_screening_settle_inline(
  p_reservation_id uuid, p_input_tokens integer, p_output_tokens integer, p_evidence_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '1s' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM employer_delivery.budget_reservations r
    JOIN employer_delivery.inline_attempts a ON a.application_id = r.inline_application_id
    WHERE r.id = p_reservation_id AND r.application_id = a.application_id AND r.outbox_id IS NULL
  ) THEN RETURN false; END IF;
  -- Reuse immutable original prices, bounded usage, shared receipt uniqueness,
  -- exact idempotency and original-month/day refunds. Unknown holds stay full.
  RETURN public.employer_screening_settle_budget(
    p_reservation_id, p_input_tokens, p_output_tokens, p_evidence_id);
END $$;

REVOKE ALL ON FUNCTION public.employer_screening_begin_inline(uuid,uuid,text,text,integer,integer,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.employer_screening_settle_inline(uuid,integer,integer,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.employer_screening_begin_inline(uuid,uuid,text,text,integer,integer,text,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.employer_screening_settle_inline(uuid,integer,integer,text)
  TO service_role;
-- No model/config is created, enabled or changed (including the installed
-- gpt-6-luna-20261021-full-context-v1). No paid work or delivery is activated.
-- A successful begin is already dispatched for accounting. No release, retry,
-- cleanup or expiration may erase its charge without valid bounded usage.
COMMIT;
