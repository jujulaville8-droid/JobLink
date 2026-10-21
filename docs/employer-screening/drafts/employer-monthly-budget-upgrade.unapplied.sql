-- UNAPPLIED V4 -> monthly-budget upgrade REVIEW DRAFT. No live authorization.
-- Only for a V4-installed database. Fresh installs use employer-outbox.unapplied.sql.
-- Stop/drain paid workers and disable every DB budget configuration before applying.
-- A failed check aborts the whole transaction; never drop history to make it pass.
BEGIN;
LOCK TABLE employer_delivery.outbox, employer_delivery.budget_configuration,
  employer_delivery.budget_reservations, employer_delivery.budget_days IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM employer_delivery.budget_configuration WHERE enabled) THEN
    RAISE EXCEPTION 'DISABLE_PAID_CONFIGURATIONS_BEFORE_UPGRADE';
  END IF;
END $$;
-- One fixed JobLink API scope, NOT employer/account/configuration-specific. No RPC
-- accepts a scope or cap. New configuration IDs/rates cannot reset this allowance.
-- The month is the database UTC dispatch-authorization month, not provider billing.
CREATE TABLE employer_delivery.budget_months (
  scope text NOT NULL DEFAULT 'joblink-screening-api' CHECK (scope='joblink-screening-api'),
  month date NOT NULL CHECK (extract(day FROM month)=1),
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd BETWEEN 0 AND 5000000),
  PRIMARY KEY(scope,month)
);

ALTER TABLE employer_delivery.budget_reservations
  ADD COLUMN budget_scope text NOT NULL DEFAULT 'joblink-screening-api' CHECK (budget_scope='joblink-screening-api'),
  ADD COLUMN month date;
-- Backfill ALL configurations, employer account IDs and states, including unknowns.
-- There is deliberately no default month: an old in-flight/planned reserve function
-- cannot write a post-upgrade reservation without participating in monthly accounting.
UPDATE employer_delivery.budget_reservations SET month=date_trunc('month',day::timestamp)::date;
INSERT INTO employer_delivery.budget_months(month,reserved_microusd)
  SELECT month,sum(charged_microusd) FROM employer_delivery.budget_reservations GROUP BY month;
-- CHECK rejects any historical month already above the approved cap. Keep workers
-- disabled and reconcile separately; do not silently truncate/decrease prior charges.
ALTER TABLE employer_delivery.budget_reservations
  ALTER COLUMN month SET NOT NULL,
  ADD CHECK (extract(day FROM month)=1),
  ADD CHECK (reserved_microusd BETWEEN 1 AND 5000000),
  ADD CHECK (charged_microusd BETWEEN 0 AND reserved_microusd),
  DROP CONSTRAINT budget_reservations_state_check,
  ADD CHECK (state IN ('reserved','dispatched','settled','uncertain','released'));
CREATE OR REPLACE FUNCTION public.employer_screening_reserve_budget(p_application_id uuid,p_lease uuid,p_snapshot_sha256 text,p_config_id text,
 p_input_token_ceiling integer,p_max_output_tokens integer,p_request_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o employer_delivery.outbox; c employer_delivery.budget_configuration; r employer_delivery.budget_reservations;
  d date; m date; reserved_at timestamptz; cost bigint; used bigint; monthly_used bigint;
BEGIN
  SELECT * INTO o FROM employer_delivery.outbox WHERE application_id=p_application_id FOR UPDATE;
  IF NOT FOUND OR o.state<>'claimed' OR p_lease IS NULL OR o.lease IS DISTINCT FROM p_lease OR o.lease_expires_at<=clock_timestamp()
    OR o.processing_deadline-interval '25 seconds'<=clock_timestamp() OR o.snapshot_sha256 IS DISTINCT FROM p_snapshot_sha256 OR o.snapshot_json IS NULL
    OR o.rubric_json IS NULL OR NOT coalesce(employer_delivery.authorized(o),false) THEN RETURN NULL; END IF;
  SELECT * INTO c FROM employer_delivery.budget_configuration WHERE id=p_config_id AND enabled AND context_bound_verified AND provider='openai' AND model='gpt-6-luna' FOR SHARE;
  IF NOT FOUND OR (p_input_token_ceiling IS NOT NULL AND p_input_token_ceiling<>c.max_input_tokens)
    OR p_max_output_tokens IS NULL OR p_max_output_tokens NOT BETWEEN 1 AND c.max_output_tokens
    OR p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 1 AND 200 THEN RETURN NULL; END IF;
  p_input_token_ceiling:=c.max_input_tokens;
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE application_id=p_application_id FOR UPDATE;
  IF FOUND THEN
    IF r.request_key<>p_request_key OR r.lease<>p_lease OR r.snapshot_sha256<>p_snapshot_sha256 OR r.config_id<>p_config_id
      OR r.input_token_ceiling<>p_input_token_ceiling OR r.max_output_tokens<>p_max_output_tokens OR r.state<>'reserved'
      OR r.day IS DISTINCT FROM (clock_timestamp() AT TIME ZONE 'UTC')::date THEN RETURN NULL; END IF;
  ELSE
    cost:=ceil((p_input_token_ceiling::numeric*c.input_microusd_per_million+p_max_output_tokens::numeric*c.output_microusd_per_million)/1000000)::bigint;
    IF cost>c.per_application_microusd OR cost>5000000 THEN RETURN NULL; END IF;
    d:=(clock_timestamp() AT TIME ZONE 'UTC')::date;
    m:=date_trunc('month',d::timestamp)::date;
    -- Lock order: outbox -> reservation -> fixed month -> configuration/day.
    -- Configuration is read-locked above; all money mutations lock month before day.
    INSERT INTO employer_delivery.budget_months(month) VALUES(m) ON CONFLICT DO NOTHING;
    SELECT reserved_microusd INTO monthly_used FROM employer_delivery.budget_months
      WHERE scope='joblink-screening-api' AND month=m FOR UPDATE;
    INSERT INTO employer_delivery.budget_days(config_id,day) VALUES(c.id,d) ON CONFLICT DO NOTHING;
    SELECT reserved_microusd INTO used FROM employer_delivery.budget_days WHERE config_id=c.id AND day=d FOR UPDATE;
    -- Sampling before lock waits would allow old-day/month debit after rollover.
    reserved_at:=clock_timestamp();
    IF d IS DISTINCT FROM (reserved_at AT TIME ZONE 'UTC')::date
      OR o.lease_expires_at<=reserved_at OR o.processing_deadline-interval '25 seconds'<=reserved_at
      OR cost>c.daily_microusd-used OR cost>5000000-monthly_used THEN RETURN NULL; END IF;
    UPDATE employer_delivery.budget_months SET reserved_microusd=reserved_microusd+cost
      WHERE scope='joblink-screening-api' AND month=m;
    UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd+cost WHERE config_id=c.id AND day=d;
    INSERT INTO employer_delivery.budget_reservations(outbox_id,account_id,application_id,config_id,day,month,lease,snapshot_sha256,request_key,
      model,input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd)
    VALUES(o.id,o.account_id,o.application_id,c.id,d,m,p_lease,p_snapshot_sha256,p_request_key,c.model,c.input_microusd_per_million,
      c.output_microusd_per_million,p_input_token_ceiling,p_max_output_tokens,cost,cost) RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('reservation_id',r.id,'reserved_microusd',r.reserved_microusd,'model',r.model,
    'input_microusd_per_million',r.input_microusd_per_million,'output_microusd_per_million',r.output_microusd_per_million,
    'input_token_ceiling',r.input_token_ceiling,'max_output_tokens',r.max_output_tokens);
END $$;
CREATE OR REPLACE FUNCTION public.employer_screening_start_request(p_reservation_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employer_delivery.budget_reservations; o employer_delivery.outbox; dispatch_at timestamptz;
BEGIN
  -- Follow outbox -> reservation ordering everywhere that needs both rows.
  SELECT o1.* INTO o FROM employer_delivery.outbox o1 JOIN employer_delivery.budget_reservations r1 ON r1.outbox_id=o1.id
    WHERE r1.id=p_reservation_id FOR UPDATE OF o1;
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND OR r.state<>'reserved' THEN RETURN false; END IF;
  PERFORM 1 FROM employer_delivery.budget_configuration WHERE id=r.config_id AND enabled FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM employer_delivery.budget_months WHERE scope=r.budget_scope AND month=r.month
    AND reserved_microusd>=r.charged_microusd FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM employer_delivery.budget_days WHERE config_id=r.config_id AND day=r.day
    AND reserved_microusd>=r.charged_microusd FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- UTC authorization time is sampled AFTER every potentially blocking lock.
  -- Do not transfer old reservations into a fresh day/month or reuse an old cap.
  dispatch_at:=clock_timestamp();
  IF r.day IS DISTINCT FROM (dispatch_at AT TIME ZONE 'UTC')::date
    OR r.month IS DISTINCT FROM date_trunc('month',dispatch_at AT TIME ZONE 'UTC')::date
    OR p_lease IS NULL OR r.lease<>p_lease OR o.lease IS DISTINCT FROM p_lease OR o.state<>'claimed'
    OR o.lease_expires_at<=dispatch_at OR o.processing_deadline-interval '25 seconds'<=dispatch_at
    OR NOT coalesce(employer_delivery.authorized(o),false) THEN RETURN false; END IF;
  UPDATE employer_delivery.budget_reservations SET state='dispatched',dispatched_at=dispatch_at WHERE id=r.id;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.employer_screening_settle_budget(p_reservation_id uuid,p_input_tokens integer,p_output_tokens integer,p_evidence_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employer_delivery.budget_reservations; cost bigint;
BEGIN
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF r.state='settled' THEN RETURN r.input_tokens IS NOT DISTINCT FROM p_input_tokens AND r.output_tokens IS NOT DISTINCT FROM p_output_tokens AND r.evidence_id IS NOT DISTINCT FROM p_evidence_id; END IF;
  IF r.state NOT IN ('dispatched','uncertain') THEN RETURN false; END IF;
  IF p_input_tokens IS NULL OR p_output_tokens IS NULL OR p_input_tokens NOT BETWEEN 0 AND r.input_token_ceiling
    OR p_output_tokens NOT BETWEEN 0 AND r.max_output_tokens OR p_evidence_id IS NULL OR length(p_evidence_id) NOT BETWEEN 1 AND 255 THEN
    UPDATE employer_delivery.budget_reservations SET state='uncertain' WHERE id=r.id; RETURN false;
  END IF;
  cost:=ceil((p_input_tokens::numeric*r.input_microusd_per_million+p_output_tokens::numeric*r.output_microusd_per_million)/1000000)::bigint;
  IF cost>r.reserved_microusd OR cost>r.charged_microusd THEN
    UPDATE employer_delivery.budget_reservations SET state='uncertain' WHERE id=r.id; RETURN false;
  END IF;
  -- Refund only the original accounting month/day, never the settlement month.
  UPDATE employer_delivery.budget_months SET reserved_microusd=reserved_microusd-(r.charged_microusd-cost)
    WHERE scope=r.budget_scope AND month=r.month;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd-(r.charged_microusd-cost) WHERE config_id=r.config_id AND day=r.day;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_reservations SET state='settled',charged_microusd=cost,input_tokens=p_input_tokens,
    output_tokens=p_output_tokens,evidence_id=p_evidence_id,settled_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;
-- This is proof of database non-dispatch, not a provider-refund RPC. A timeout,
-- failed HTTP request, missing receipt or caller's assertion cannot release usage.
CREATE OR REPLACE FUNCTION public.employer_screening_release_budget(p_reservation_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employer_delivery.budget_reservations;
BEGIN
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE id=p_reservation_id FOR UPDATE;
  IF NOT FOUND OR p_lease IS NULL OR r.lease IS DISTINCT FROM p_lease THEN RETURN false; END IF;
  IF r.state='released' THEN RETURN true; END IF;
  IF r.state<>'reserved' OR r.dispatched_at IS NOT NULL THEN RETURN false; END IF;
  UPDATE employer_delivery.budget_months SET reserved_microusd=reserved_microusd-r.charged_microusd
    WHERE scope=r.budget_scope AND month=r.month;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd-r.charged_microusd WHERE config_id=r.config_id AND day=r.day;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUDGET_LEDGER_MISSING'; END IF;
  UPDATE employer_delivery.budget_reservations SET state='released',charged_microusd=0,settled_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;


ALTER TABLE employer_delivery.budget_months ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON employer_delivery.budget_months FROM PUBLIC,anon,authenticated,service_role;
-- New RPCs otherwise inherit PUBLIC EXECUTE. Reapply the exact trusted boundary.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('employer_screening_reserve_budget','employer_screening_start_request',
     'employer_screening_settle_budget','employer_screening_release_budget') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
COMMIT;
