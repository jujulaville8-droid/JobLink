-- LOCAL REVIEW ONLY. Do not apply until order/privacy/fulfillment terms are approved.
BEGIN;
CREATE TABLE public.resume_writing_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id),
  checkout_reference uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  payment_policy text NOT NULL CHECK (char_length(payment_policy) BETWEEN 1 AND 1000),
  package_version text NOT NULL DEFAULT 'first_resume_v1' CHECK (package_version = 'first_resume_v1'),
  amount integer NOT NULL DEFAULT 5000 CHECK (amount = 5000),
  currency text NOT NULL DEFAULT 'xcd' CHECK (currency = 'xcd'),
  intake jsonb NOT NULL CHECK (jsonb_typeof(intake) = 'object' AND octet_length(intake::text) <= 12000
    AND char_length(btrim(intake->>'name')) BETWEEN 0 AND 120
    AND char_length(btrim(intake->>'email')) BETWEEN 0 AND 254
    AND char_length(btrim(intake->>'role')) BETWEEN 0 AND 150
    AND intake ?& ARRAY['name','email','role','education','skills','experience']
    AND jsonb_typeof(intake->'name')='string' AND jsonb_typeof(intake->'email')='string' AND jsonb_typeof(intake->'role')='string'
    AND jsonb_typeof(intake->'education')='string' AND char_length(intake->>'education')<=1500
    AND jsonb_typeof(intake->'skills')='string' AND char_length(intake->>'skills')<=1500
    AND jsonb_typeof(intake->'experience')='string' AND char_length(intake->>'experience')<=2000
    AND coalesce(intake->>'experienceType','') IN ('','none','informal','paid','mixed')),
  intake_status text NOT NULL DEFAULT 'draft' CHECK (intake_status IN ('draft','complete')),
  intake_completed_at timestamptz,
  revision_note text CHECK (char_length(revision_note) BETWEEN 1 AND 2000),
  revision_request_id uuid UNIQUE,
  terms jsonb NOT NULL CHECK (jsonb_typeof(terms) = 'object' AND octet_length(terms::text) <= 16000
    AND terms ?& ARRAY['version','delivery','revision','refund','privacy']),
  consented_at timestamptz NOT NULL DEFAULT now(),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','disputed')),
  checkout_status text NOT NULL DEFAULT 'pending' CHECK (checkout_status IN ('pending','failed','expired','paid')),
  paid_session_id text UNIQUE,
  payment_review_required boolean NOT NULL DEFAULT false,
  fulfillment_status text NOT NULL DEFAULT 'awaiting_payment' CHECK (fulfillment_status IN
    ('awaiting_payment','awaiting_intake','ready','writing','draft_ready','revision_requested','complete')),
  revision_count integer NOT NULL DEFAULT 0 CHECK (revision_count BETWEEN 0 AND 1),
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fulfillment_status = 'awaiting_payment' OR paid_session_id IS NOT NULL),
  CHECK ((payment_status='unpaid' AND paid_session_id IS NULL) OR (payment_status<>'unpaid' AND paid_session_id IS NOT NULL))
);
CREATE TABLE public.resume_writing_receipts (
  session_id text PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.resume_writing_orders(id),
  payment_intent_id text NOT NULL UNIQUE,
  charge_id text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('paid','refunded','disputed')),
  verified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id,order_id)
);
ALTER TABLE public.resume_writing_orders ADD CONSTRAINT resume_writing_primary_receipt
  FOREIGN KEY(paid_session_id,id) REFERENCES public.resume_writing_receipts(session_id,order_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE public.resume_writing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  session_id text NOT NULL,
  order_id uuid REFERENCES public.resume_writing_orders(id),
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.resume_writing_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.resume_writing_orders(id),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  from_status text NOT NULL,
  to_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX resume_writing_queue ON public.resume_writing_orders(created_at DESC);
ALTER TABLE public.resume_writing_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_writing_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_writing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resume_writing_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resume_writing_orders, public.resume_writing_receipts,
  public.resume_writing_events, public.resume_writing_actions FROM anon, authenticated;
GRANT SELECT ON public.resume_writing_orders TO authenticated;
GRANT ALL ON public.resume_writing_orders, public.resume_writing_receipts,
  public.resume_writing_events, public.resume_writing_actions TO service_role;
CREATE POLICY resume_writing_owner_admin_read ON public.resume_writing_orders FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND NOT coalesce(u.is_banned, false)
    AND (resume_writing_orders.user_id = u.id OR u.is_admin = true))
);

CREATE FUNCTION public.create_resume_writing_order(p_id uuid, p_user_id uuid, p_intake jsonb, p_terms jsonb, p_payment_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o resume_writing_orders;
BEGIN
  INSERT INTO resume_writing_orders(id,user_id,intake,terms,payment_policy) VALUES(p_id,p_user_id,p_intake,p_terms,p_payment_policy)
    ON CONFLICT (id) DO NOTHING;
  SELECT * INTO STRICT o FROM resume_writing_orders WHERE id=p_id FOR UPDATE;
  IF o.user_id <> p_user_id OR o.intake <> p_intake OR o.terms <> p_terms OR o.payment_policy<>p_payment_policy THEN
    RAISE EXCEPTION 'request_conflict';
  END IF;
  RETURN to_jsonb(o) - 'checkout_reference' - 'payment_policy' - 'user_id';
END $$;

-- Receipt/event/order updates share one transaction. Replaying a committed event
-- never leaves an event claim committed ahead of its order update.
CREATE FUNCTION public.reconcile_resume_writing_payment(
  p_event_id text, p_event_type text, p_session_id text, p_reference uuid,
  p_state text, p_payment_intent_id text, p_charge_id text, p_payment_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o resume_writing_orders; r resume_writing_receipts; e resume_writing_events;
  next_payment text; next_fulfillment text; next_checkout text; needs_review boolean; receipt_count integer;
BEGIN
  IF p_state NOT IN ('pending','failed','expired','paid','refunded','disputed') THEN RAISE EXCEPTION 'invalid_payment_state'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id, 0));
  SELECT * INTO e FROM resume_writing_events WHERE event_id=p_event_id;
  IF FOUND THEN
    IF e.session_id <> p_session_id THEN RAISE EXCEPTION 'event_conflict'; END IF;
    RETURN jsonb_build_object('outcome',e.outcome,'duplicate',true,'orderId',e.order_id);
  END IF;
  SELECT * INTO o FROM resume_writing_orders WHERE checkout_reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO resume_writing_events(event_id,event_type,session_id,outcome) VALUES(p_event_id,p_event_type,p_session_id,'unmatched');
    RETURN jsonb_build_object('outcome','unmatched','duplicate',false);
  END IF;
  IF o.payment_policy<>p_payment_policy THEN RAISE EXCEPTION 'payment_policy_mismatch'; END IF;
  next_checkout := o.checkout_status;
  IF p_state IN ('pending','failed','expired') THEN
    IF o.payment_status='unpaid' THEN next_checkout := p_state; END IF;
  ELSE
    IF nullif(p_payment_intent_id,'') IS NULL OR nullif(p_charge_id,'') IS NULL THEN RAISE EXCEPTION 'missing_payment_reference'; END IF;
    SELECT * INTO r FROM resume_writing_receipts WHERE session_id=p_session_id FOR UPDATE;
    IF FOUND AND (r.order_id<>o.id OR r.payment_intent_id<>p_payment_intent_id OR r.charge_id<>p_charge_id) THEN
      RAISE EXCEPTION 'receipt_conflict';
    END IF;
    INSERT INTO resume_writing_receipts(session_id,order_id,payment_intent_id,charge_id,state)
      VALUES(p_session_id,o.id,p_payment_intent_id,p_charge_id,p_state)
      ON CONFLICT(session_id) DO UPDATE SET verified_at=now(), state=CASE
        WHEN resume_writing_receipts.state='disputed' OR excluded.state='disputed' THEN 'disputed'
        WHEN resume_writing_receipts.state='refunded' OR excluded.state='refunded' THEN 'refunded' ELSE 'paid' END;
    IF o.paid_session_id IS NULL THEN o.paid_session_id := p_session_id; END IF;
    next_checkout := 'paid';
  END IF;
  IF o.paid_session_id IS NULL THEN next_payment := 'unpaid';
  ELSE SELECT state INTO next_payment FROM resume_writing_receipts WHERE session_id=o.paid_session_id; END IF;
  SELECT count(*) INTO receipt_count FROM resume_writing_receipts WHERE order_id=o.id;
  -- Sticky hold: partial/full refunds do not prove a duplicate was resolved.
  -- Clearing a hold requires a separately approved explicit resolution path.
  needs_review := o.payment_review_required OR receipt_count>1
    OR EXISTS (SELECT 1 FROM resume_writing_receipts WHERE order_id=o.id AND state IN ('refunded','disputed'));
  next_fulfillment := o.fulfillment_status;
  -- Payment holds never overwrite drafting/revision/completion progress.
  IF next_payment='paid' AND NOT needs_review AND o.fulfillment_status='awaiting_payment' THEN next_fulfillment := CASE WHEN o.intake_status='complete' THEN 'ready' ELSE 'awaiting_intake' END; END IF;
  UPDATE resume_writing_orders SET paid_session_id=o.paid_session_id, payment_status=next_payment,
    checkout_status=next_checkout, payment_review_required=needs_review, fulfillment_status=next_fulfillment,
    version=version+1, updated_at=now()
    WHERE id=o.id AND (paid_session_id IS DISTINCT FROM o.paid_session_id OR payment_status<>next_payment
      OR checkout_status<>next_checkout OR payment_review_required<>needs_review OR fulfillment_status<>next_fulfillment);
  INSERT INTO resume_writing_events(event_id,event_type,session_id,order_id,outcome)
    VALUES(p_event_id,p_event_type,p_session_id,o.id,CASE WHEN needs_review THEN 'payment_review' ELSE 'applied' END);
  RETURN jsonb_build_object('outcome',CASE WHEN needs_review THEN 'payment_review' ELSE 'applied' END,'orderId',o.id,'duplicate',false);
END $$;

CREATE FUNCTION public.update_resume_writing_fulfillment(p_id uuid,p_actor_id uuid,p_version integer,p_status text,p_delivered boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o resume_writing_orders;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND is_admin=true AND NOT coalesce(is_banned,false)) THEN RAISE EXCEPTION 'admin_required'; END IF;
  SELECT * INTO STRICT o FROM resume_writing_orders WHERE id=p_id FOR UPDATE;
  IF o.version<>p_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  IF o.payment_status<>'paid' OR o.payment_review_required THEN RAISE EXCEPTION 'payment_not_clear'; END IF;
  IF o.intake_status<>'complete' OR NOT (o.fulfillment_status IN ('ready','revision_requested') AND p_status='writing') THEN RAISE EXCEPTION 'invalid_transition'; END IF;
  UPDATE resume_writing_orders SET fulfillment_status=p_status, version=version+1, updated_at=now(),
    revision_count=revision_count+CASE WHEN p_status='revision_requested' THEN 1 ELSE 0 END WHERE id=p_id;
  INSERT INTO resume_writing_actions(order_id,actor_id,from_status,to_status) VALUES(p_id,p_actor_id,o.fulfillment_status,p_status);
  RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.create_resume_writing_order(uuid,uuid,jsonb,jsonb,text),
  public.reconcile_resume_writing_payment(text,text,text,uuid,text,text,text,text),
  public.update_resume_writing_fulfillment(uuid,uuid,integer,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_resume_writing_order(uuid,uuid,jsonb,jsonb,text),
  public.reconcile_resume_writing_payment(text,text,text,uuid,text,text,text,text),
  public.update_resume_writing_fulfillment(uuid,uuid,integer,text,boolean) TO service_role;


-- These aggregates count transitions, not people. No applicant or provider identifiers.
CREATE TABLE public.resume_writing_counts (
  day date NOT NULL DEFAULT CURRENT_DATE,
  event text NOT NULL CHECK (event IN ('request_saved','payment_verified','intake_completed','draft_published','revision_requested','approved')),
  mode text NOT NULL CHECK(mode IN ('sandbox','live')),
  count bigint NOT NULL DEFAULT 0 CHECK(count>=0),
  PRIMARY KEY(day,event,mode)
);
ALTER TABLE public.resume_writing_counts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resume_writing_counts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.resume_writing_counts TO service_role;
CREATE FUNCTION public.count_resume_writing_transition(p_event text,p_policy text) RETURNS void
LANGUAGE sql SET search_path=public,pg_temp AS $$
  INSERT INTO resume_writing_counts(event,mode,count) VALUES(p_event,(p_policy::jsonb->>0),1)
  ON CONFLICT(day,event,mode) DO UPDATE SET count=resume_writing_counts.count+1;
$$;
CREATE FUNCTION public.resume_writing_count_trigger() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN PERFORM count_resume_writing_transition('request_saved',NEW.payment_policy);
  ELSE
    IF OLD.payment_status='unpaid' AND NEW.payment_status='paid' THEN PERFORM count_resume_writing_transition('payment_verified',NEW.payment_policy); END IF;
    IF OLD.intake_status='draft' AND NEW.intake_status='complete' THEN PERFORM count_resume_writing_transition('intake_completed',NEW.payment_policy); END IF;
    IF OLD.fulfillment_status<>NEW.fulfillment_status AND NEW.fulfillment_status='draft_ready' THEN PERFORM count_resume_writing_transition('draft_published',NEW.payment_policy); END IF;
    IF OLD.revision_count<NEW.revision_count THEN PERFORM count_resume_writing_transition('revision_requested',NEW.payment_policy); END IF;
    IF OLD.fulfillment_status<>NEW.fulfillment_status AND NEW.fulfillment_status='complete' THEN PERFORM count_resume_writing_transition('approved',NEW.payment_policy); END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER resume_writing_counts AFTER INSERT OR UPDATE ON public.resume_writing_orders
  FOR EACH ROW EXECUTE FUNCTION public.resume_writing_count_trigger();

CREATE TABLE public.resume_writing_files (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.resume_writing_orders(id),
  kind text NOT NULL CHECK(kind IN ('pdf','editable')),
  revision_number integer NOT NULL CHECK(revision_number BETWEEN 0 AND 1),
  object_path text NOT NULL UNIQUE,
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  size integer NOT NULL CHECK(size BETWEEN 1 AND 5242880),
  mime text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(object_path=order_id::text||'/'||revision_number::text||'/'||id::text||CASE WHEN kind='pdf' THEN '.pdf' ELSE '.docx' END),
  CHECK(mime=CASE WHEN kind='pdf' THEN 'application/pdf' ELSE 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' END)
);
ALTER TABLE public.resume_writing_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resume_writing_files FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.resume_writing_files TO service_role;
CREATE INDEX resume_writing_files_order ON public.resume_writing_files(order_id,revision_number);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('resume-writing-private','resume-writing-private',false,5242880,ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='resume-writing-private' AND public) THEN RAISE EXCEPTION 'resume_bucket_must_be_private'; END IF;
END $$;
-- Restrictive policy prevents any existing permissive bucket-wide policy from
-- accidentally exposing these objects. Access runs through authorized server routes.
CREATE POLICY resume_writing_no_browser_objects ON storage.objects AS RESTRICTIVE
FOR ALL TO anon,authenticated USING(bucket_id<>'resume-writing-private') WITH CHECK(bucket_id<>'resume-writing-private');

CREATE FUNCTION public.update_resume_writing_intake(p_id uuid,p_user_id uuid,p_version integer,p_intake jsonb,p_submit boolean,p_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o resume_writing_orders; target_status text;
BEGIN
  SELECT * INTO STRICT o FROM resume_writing_orders WHERE id=p_id AND user_id=p_user_id AND payment_policy=p_policy FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_user_id AND NOT coalesce(is_banned,false)) THEN RAISE EXCEPTION 'owner_required'; END IF;
  -- Retry of an already committed save/submit succeeds without a second transition.
  IF o.intake=p_intake AND ((p_submit AND o.intake_status='complete') OR (NOT p_submit AND o.intake_status='draft')) THEN RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id'; END IF;
  IF o.version<>p_version OR o.intake_status<>'draft' THEN RAISE EXCEPTION 'version_conflict'; END IF;
  IF p_submit AND (coalesce(char_length(btrim(p_intake->>'name')),0)<1 OR coalesce(char_length(btrim(p_intake->>'email')),0)<3
    OR coalesce(p_intake->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR coalesce(char_length(btrim(p_intake->>'role')),0)<1 OR coalesce(p_intake->>'experienceType','') NOT IN ('none','informal','paid','mixed')) THEN RAISE EXCEPTION 'intake_incomplete'; END IF;
  target_status:=o.fulfillment_status;
  IF p_submit AND o.fulfillment_status='awaiting_intake' AND o.payment_status='paid' AND NOT o.payment_review_required THEN target_status:='ready'; END IF;
  UPDATE resume_writing_orders SET intake=p_intake,intake_status=CASE WHEN p_submit THEN 'complete' ELSE 'draft' END,
    intake_completed_at=CASE WHEN p_submit THEN now() ELSE NULL END,fulfillment_status=target_status,version=version+1,updated_at=now()
    WHERE id=p_id RETURNING * INTO o;
  RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id';
END $$;
CREATE FUNCTION public.register_resume_writing_file(p_id uuid,p_order_id uuid,p_actor_id uuid,p_version integer,p_kind text,p_sha256 text,p_size integer,p_mime text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o resume_writing_orders; f resume_writing_files; path text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND is_admin=true AND NOT coalesce(is_banned,false)) THEN RAISE EXCEPTION 'admin_required'; END IF;
  SELECT * INTO STRICT o FROM resume_writing_orders WHERE id=p_order_id FOR UPDATE;
  path:=o.id::text||'/'||o.revision_count::text||'/'||p_id::text||CASE WHEN p_kind='pdf' THEN '.pdf' ELSE '.docx' END;
  SELECT * INTO f FROM resume_writing_files WHERE id=p_id;
  IF FOUND THEN
    IF f.order_id<>p_order_id OR f.object_path<>path OR f.kind<>p_kind OR f.sha256<>p_sha256 OR f.size<>p_size OR f.mime<>p_mime THEN RAISE EXCEPTION 'file_conflict'; END IF;
    RETURN to_jsonb(f)-'object_path'-'sha256';
  END IF;
  IF o.version<>p_version OR o.fulfillment_status<>'writing' OR o.intake_status<>'complete' OR o.payment_status<>'paid' OR o.payment_review_required THEN RAISE EXCEPTION 'work_unavailable'; END IF;
  INSERT INTO resume_writing_files(id,order_id,kind,revision_number,object_path,sha256,size,mime)
    VALUES(p_id,p_order_id,p_kind,o.revision_count,path,p_sha256,p_size,p_mime) RETURNING * INTO f;
  RETURN to_jsonb(f)-'object_path'-'sha256';
END $$;
CREATE FUNCTION public.publish_resume_writing_draft(p_id uuid,p_actor_id uuid,p_version integer,p_pdf uuid,p_editable uuid,p_reviewed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o resume_writing_orders; n integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND is_admin=true AND NOT coalesce(is_banned,false)) THEN RAISE EXCEPTION 'admin_required'; END IF;
  SELECT * INTO STRICT o FROM resume_writing_orders WHERE id=p_id FOR UPDATE;
  IF p_reviewed IS DISTINCT FROM true OR o.version<>p_version OR o.fulfillment_status<>'writing' OR o.intake_status<>'complete' OR o.payment_status<>'paid' OR o.payment_review_required THEN RAISE EXCEPTION 'publication_unavailable'; END IF;
  SELECT count(*) INTO n FROM resume_writing_files WHERE order_id=p_id AND revision_number=o.revision_count AND published_at IS NULL
    AND ((id=p_pdf AND kind='pdf') OR (id=p_editable AND kind='editable'));
  IF n<>2 THEN RAISE EXCEPTION 'reviewed_pair_required'; END IF;
  UPDATE resume_writing_files SET published_at=now() WHERE id IN(p_pdf,p_editable);
  UPDATE resume_writing_orders SET fulfillment_status='draft_ready',version=version+1,updated_at=now() WHERE id=p_id;
  INSERT INTO resume_writing_actions(order_id,actor_id,from_status,to_status) VALUES(p_id,p_actor_id,o.fulfillment_status,'draft_ready');
  RETURN jsonb_build_object('success',true);
END $$;
CREATE FUNCTION public.respond_resume_writing_draft(p_id uuid,p_user_id uuid,p_version integer,p_action text,p_note text,p_request_id uuid,p_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o resume_writing_orders; target text;
BEGIN
  SELECT * INTO STRICT o FROM resume_writing_orders WHERE id=p_id AND user_id=p_user_id AND payment_policy=p_policy FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_user_id AND NOT coalesce(is_banned,false)) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF p_action='revision' AND o.revision_request_id=p_request_id AND o.revision_note=p_note THEN RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id'; END IF;
  IF p_action='approve' AND o.fulfillment_status='complete' THEN RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id'; END IF;
  IF o.version<>p_version OR o.payment_status<>'paid' OR o.payment_review_required OR o.intake_status<>'complete' THEN RAISE EXCEPTION 'response_unavailable'; END IF;
  IF (SELECT count(*) FROM resume_writing_files WHERE order_id=p_id AND revision_number=o.revision_count AND published_at IS NOT NULL)<>2 THEN RAISE EXCEPTION 'published_pair_required'; END IF;
  IF p_action='revision' AND o.fulfillment_status IN ('draft_ready','complete') AND o.revision_count=0 AND p_request_id IS NOT NULL AND char_length(btrim(p_note)) BETWEEN 1 AND 2000 THEN target:='revision_requested';
  ELSIF p_action='approve' AND o.fulfillment_status='draft_ready' THEN target:='complete';
  ELSE RAISE EXCEPTION 'invalid_response'; END IF;
  UPDATE resume_writing_orders SET fulfillment_status=target,revision_count=revision_count+CASE WHEN target='revision_requested' THEN 1 ELSE 0 END,
    revision_note=CASE WHEN target='revision_requested' THEN p_note ELSE revision_note END,
    revision_request_id=CASE WHEN target='revision_requested' THEN p_request_id ELSE revision_request_id END,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO o;
  INSERT INTO resume_writing_actions(order_id,actor_id,from_status,to_status) VALUES(p_id,p_user_id,'customer_response',target);
  RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id';
END $$;
REVOKE ALL ON FUNCTION public.count_resume_writing_transition(text,text),public.resume_writing_count_trigger(),
  public.update_resume_writing_intake(uuid,uuid,integer,jsonb,boolean,text),
  public.register_resume_writing_file(uuid,uuid,uuid,integer,text,text,integer,text),
  public.publish_resume_writing_draft(uuid,uuid,integer,uuid,uuid,boolean),
  public.respond_resume_writing_draft(uuid,uuid,integer,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.count_resume_writing_transition(text,text),public.resume_writing_count_trigger(),
  public.update_resume_writing_intake(uuid,uuid,integer,jsonb,boolean,text),
  public.register_resume_writing_file(uuid,uuid,uuid,integer,text,text,integer,text),
  public.publish_resume_writing_draft(uuid,uuid,integer,uuid,uuid,boolean),
  public.respond_resume_writing_draft(uuid,uuid,integer,text,text,uuid,text) TO service_role;
COMMIT;
