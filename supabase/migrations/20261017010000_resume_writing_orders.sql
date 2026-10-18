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
    AND char_length(btrim(intake->>'name')) BETWEEN 1 AND 120
    AND char_length(btrim(intake->>'email')) BETWEEN 3 AND 254
    AND char_length(btrim(intake->>'role')) BETWEEN 1 AND 150
    AND intake ?& ARRAY['name','email','role','education','skills','experience']),
  terms jsonb NOT NULL CHECK (jsonb_typeof(terms) = 'object' AND octet_length(terms::text) <= 16000
    AND terms ?& ARRAY['version','delivery','revision','refund','privacy']),
  consented_at timestamptz NOT NULL DEFAULT now(),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded','disputed')),
  checkout_status text NOT NULL DEFAULT 'pending' CHECK (checkout_status IN ('pending','failed','expired','paid')),
  paid_session_id text UNIQUE,
  payment_review_required boolean NOT NULL DEFAULT false,
  fulfillment_status text NOT NULL DEFAULT 'awaiting_payment' CHECK (fulfillment_status IN
    ('awaiting_payment','ready','writing','draft_ready','revision_requested','complete')),
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
  RETURN to_jsonb(o) - 'checkout_reference';
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
  IF next_payment='paid' AND NOT needs_review AND o.fulfillment_status='awaiting_payment' THEN next_fulfillment := 'ready'; END IF;
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
  IF NOT ((o.fulfillment_status IN ('ready','revision_requested') AND p_status='writing')
    OR (o.fulfillment_status='writing' AND p_status='draft_ready')
    OR (o.fulfillment_status='draft_ready' AND p_status='revision_requested' AND o.revision_count=0)
    OR (o.fulfillment_status='draft_ready' AND p_status='complete' AND p_delivered)) THEN RAISE EXCEPTION 'invalid_transition'; END IF;
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
COMMIT;
