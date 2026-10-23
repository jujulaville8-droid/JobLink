-- Synthetic upgrade fixture: exact budget block from frozen reviewed V4. Never apply alone.
-- Exact approved model/rate/token configuration is required; there are NO seeded models/rates.
-- New versions are new IDs. Runtime cannot invent prices, raise caps, or enable a provider.
CREATE TABLE employer_delivery.budget_configuration (
  id text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, context_bound_verified boolean NOT NULL DEFAULT false,
  provider text NOT NULL, model text NOT NULL,
  input_microusd_per_million bigint NOT NULL CHECK (input_microusd_per_million>0),
  output_microusd_per_million bigint NOT NULL CHECK (output_microusd_per_million>0),
  max_input_tokens integer NOT NULL CHECK (max_input_tokens>0), max_output_tokens integer NOT NULL CHECK (max_output_tokens>0),
  per_application_microusd bigint NOT NULL CHECK (per_application_microusd>0),
  daily_microusd bigint NOT NULL CHECK (daily_microusd>0)
);
CREATE TABLE employer_delivery.budget_days (
  config_id text NOT NULL REFERENCES employer_delivery.budget_configuration(id), day date NOT NULL,
  reserved_microusd bigint NOT NULL DEFAULT 0 CHECK (reserved_microusd>=0), PRIMARY KEY(config_id,day)
);
CREATE TABLE employer_delivery.budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), outbox_id uuid NOT NULL REFERENCES employer_delivery.outbox(id),
  account_id uuid NOT NULL, application_id uuid NOT NULL, config_id text NOT NULL REFERENCES employer_delivery.budget_configuration(id),
  day date NOT NULL, lease uuid NOT NULL, snapshot_sha256 text NOT NULL, request_key text NOT NULL,
  model text NOT NULL, input_microusd_per_million bigint NOT NULL, output_microusd_per_million bigint NOT NULL,
  input_token_ceiling integer NOT NULL, max_output_tokens integer NOT NULL,
  reserved_microusd bigint NOT NULL, charged_microusd bigint NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','dispatched','settled','uncertain')),
  input_tokens integer, output_tokens integer, evidence_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), dispatched_at timestamptz, settled_at timestamptz,
  UNIQUE(application_id,request_key), UNIQUE(application_id)
);
CREATE UNIQUE INDEX budget_usage_receipt_unique ON employer_delivery.budget_reservations(evidence_id) WHERE evidence_id IS NOT NULL;
CREATE FUNCTION employer_delivery.protect_configuration() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (to_jsonb(NEW)-'enabled') IS DISTINCT FROM (to_jsonb(OLD)-'enabled') THEN RAISE EXCEPTION 'CONFIGURATION_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_configuration BEFORE UPDATE ON employer_delivery.budget_configuration FOR EACH ROW EXECUTE FUNCTION employer_delivery.protect_configuration();
CREATE FUNCTION public.employer_screening_reserve_budget(p_application_id uuid,p_lease uuid,p_snapshot_sha256 text,p_config_id text,
 p_input_token_ceiling integer,p_max_output_tokens integer,p_request_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o employer_delivery.outbox; c employer_delivery.budget_configuration; r employer_delivery.budget_reservations;
  d date:=(clock_timestamp() AT TIME ZONE 'UTC')::date; cost bigint; used bigint;
BEGIN
  SELECT * INTO o FROM employer_delivery.outbox WHERE application_id=p_application_id FOR UPDATE;
  IF NOT FOUND OR o.state<>'claimed' OR p_lease IS NULL OR o.lease IS DISTINCT FROM p_lease OR o.lease_expires_at<=clock_timestamp()
    OR o.processing_deadline-interval '25 seconds'<=clock_timestamp() OR o.snapshot_sha256 IS DISTINCT FROM p_snapshot_sha256 OR o.snapshot_json IS NULL
    OR o.rubric_json IS NULL OR NOT coalesce(employer_delivery.authorized(o),false) THEN RETURN NULL; END IF;
  SELECT * INTO c FROM employer_delivery.budget_configuration WHERE id=p_config_id AND enabled AND context_bound_verified AND provider='openai' AND model='gpt-6-luna';
  IF NOT FOUND OR (p_input_token_ceiling IS NOT NULL AND p_input_token_ceiling<>c.max_input_tokens)
    OR p_max_output_tokens IS NULL OR p_max_output_tokens NOT BETWEEN 1 AND c.max_output_tokens
    OR p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 1 AND 200 THEN RETURN NULL; END IF;
  p_input_token_ceiling:=c.max_input_tokens;
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE application_id=p_application_id;
  IF FOUND THEN
    IF r.request_key<>p_request_key OR r.lease<>p_lease OR r.snapshot_sha256<>p_snapshot_sha256 OR r.config_id<>p_config_id
      OR r.input_token_ceiling<>p_input_token_ceiling OR r.max_output_tokens<>p_max_output_tokens OR r.state<>'reserved' THEN RETURN NULL; END IF;
  ELSE
    cost:=ceil((p_input_token_ceiling::numeric*c.input_microusd_per_million+p_max_output_tokens::numeric*c.output_microusd_per_million)/1000000)::bigint;
    IF cost>c.per_application_microusd THEN RETURN NULL; END IF;
    INSERT INTO employer_delivery.budget_days(config_id,day) VALUES(c.id,d) ON CONFLICT DO NOTHING;
    SELECT reserved_microusd INTO used FROM employer_delivery.budget_days WHERE config_id=c.id AND day=d FOR UPDATE;
    IF cost>c.daily_microusd-used THEN RETURN NULL; END IF;
    UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd+cost WHERE config_id=c.id AND day=d;
    INSERT INTO employer_delivery.budget_reservations(outbox_id,account_id,application_id,config_id,day,lease,snapshot_sha256,request_key,
      model,input_microusd_per_million,output_microusd_per_million,input_token_ceiling,max_output_tokens,reserved_microusd,charged_microusd)
    VALUES(o.id,o.account_id,o.application_id,c.id,d,p_lease,p_snapshot_sha256,p_request_key,c.model,c.input_microusd_per_million,
      c.output_microusd_per_million,p_input_token_ceiling,p_max_output_tokens,cost,cost) RETURNING * INTO r;
  END IF;
  RETURN jsonb_build_object('reservation_id',r.id,'reserved_microusd',r.reserved_microusd,'model',r.model,
    'input_microusd_per_million',r.input_microusd_per_million,'output_microusd_per_million',r.output_microusd_per_million,
    'input_token_ceiling',r.input_token_ceiling,'max_output_tokens',r.max_output_tokens);
END $$;
CREATE FUNCTION public.employer_screening_start_request(p_reservation_id uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r employer_delivery.budget_reservations; o employer_delivery.outbox; dispatch_at timestamptz;
BEGIN
  -- Follow outbox -> reservation lock ordering everywhere to avoid cancellation deadlocks.
  SELECT o1.* INTO o FROM employer_delivery.outbox o1 JOIN employer_delivery.budget_reservations r1 ON r1.outbox_id=o1.id
    WHERE r1.id=p_reservation_id FOR UPDATE OF o1;
  SELECT * INTO r FROM employer_delivery.budget_reservations WHERE id=p_reservation_id FOR UPDATE;
  -- UTC dispatch-day authority is rechecked after every potentially blocking lock.
  -- A reservation never borrows yesterday's allowance after midnight; retain its charge.
  dispatch_at:=clock_timestamp();
  IF r.id IS NULL OR r.state<>'reserved' OR r.day IS DISTINCT FROM (dispatch_at AT TIME ZONE 'UTC')::date OR p_lease IS NULL OR r.lease<>p_lease OR o.lease IS DISTINCT FROM p_lease OR o.state<>'claimed'
    OR o.lease_expires_at<=clock_timestamp() OR o.processing_deadline-interval '25 seconds'<=clock_timestamp()
    OR NOT coalesce(employer_delivery.authorized(o),false)
    OR NOT EXISTS(SELECT 1 FROM employer_delivery.budget_configuration WHERE id=r.config_id AND enabled) THEN RETURN false; END IF;
  UPDATE employer_delivery.budget_reservations SET state='dispatched',dispatched_at=dispatch_at WHERE id=r.id;
  RETURN true;
END $$;
CREATE FUNCTION public.employer_screening_settle_budget(p_reservation_id uuid,p_input_tokens integer,p_output_tokens integer,p_evidence_id text) RETURNS boolean
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
  UPDATE employer_delivery.budget_days SET reserved_microusd=reserved_microusd-(r.charged_microusd-cost) WHERE config_id=r.config_id AND day=r.day;
  UPDATE employer_delivery.budget_reservations SET state='settled',charged_microusd=cost,input_tokens=p_input_tokens,
    output_tokens=p_output_tokens,evidence_id=p_evidence_id,settled_at=clock_timestamp() WHERE id=r.id;
  RETURN true;
END $$;

