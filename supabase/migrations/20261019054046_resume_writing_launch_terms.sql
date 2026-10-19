-- Approved launch terms: additive deadline tracking and a locked revision window.
-- No file deletion, refunds, accounts, credential grants or data backfills.
BEGIN;
ALTER TABLE public.resume_writing_orders
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN first_draft_due_at timestamptz,
  ADD COLUMN first_delivered_at timestamptz,
  ADD COLUMN revision_expires_at timestamptz,
  ADD COLUMN completed_at timestamptz;

CREATE FUNCTION public.resume_writing_term_dates() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE delivered timestamptz;
BEGIN
  -- Use signature-verified payment success time plus server-submitted intake time. Reconciliation
  -- arrival/replays must never reset or extend the promised first-draft clock.
  IF OLD.first_draft_due_at IS NOT NULL THEN NEW.first_draft_due_at:=OLD.first_draft_due_at;
  ELSIF NEW.paid_at IS NOT NULL AND NEW.intake_completed_at IS NOT NULL AND NEW.payment_status='paid' AND NOT NEW.payment_review_required THEN
    NEW.first_draft_due_at:=greatest(NEW.paid_at,NEW.intake_completed_at)+interval '24 hours';
  END IF;
  IF OLD.paid_at IS NOT NULL THEN NEW.paid_at:=OLD.paid_at; END IF;
  IF OLD.revision_expires_at IS NOT NULL THEN
    NEW.first_delivered_at:=OLD.first_delivered_at; NEW.revision_expires_at:=OLD.revision_expires_at;
  ELSIF NEW.fulfillment_status='draft_ready' AND NEW.revision_count=0 THEN
    SELECT min(published_at) INTO delivered FROM resume_writing_files WHERE order_id=NEW.id AND revision_number=0 AND published_at IS NOT NULL;
    IF delivered IS NOT NULL THEN NEW.first_delivered_at:=delivered; NEW.revision_expires_at:=delivered+interval '168 hours'; END IF;
  END IF;
  -- Reopening for the included revision pauses the manual retention task; a
  -- subsequent completion starts a fresh 90-day period. Nothing is purged here.
  IF NEW.fulfillment_status<>'complete' THEN NEW.completed_at:=NULL;
  ELSIF OLD.fulfillment_status<>'complete' THEN NEW.completed_at:=clock_timestamp();
  ELSE NEW.completed_at:=OLD.completed_at; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.resume_writing_term_dates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resume_writing_term_dates() TO service_role;
CREATE TRIGGER resume_writing_term_dates BEFORE UPDATE ON public.resume_writing_orders
  FOR EACH ROW EXECUTE FUNCTION public.resume_writing_term_dates();

DROP FUNCTION public.reconcile_resume_writing_payment(text,text,text,uuid,text,text,text,text);
CREATE FUNCTION public.reconcile_resume_writing_payment(
  p_event_id text, p_event_type text, p_session_id text, p_reference uuid,
  p_state text, p_payment_intent_id text, p_charge_id text, p_payment_policy text, p_paid_at timestamptz DEFAULT NULL)
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
    IF o.paid_session_id=p_session_id AND o.paid_at IS NULL AND p_state='paid' THEN
      IF p_paid_at IS NULL OR p_paid_at>clock_timestamp()+interval '5 minutes' THEN
        IF o.terms->>'version'='2026-10-19-v1' THEN RAISE EXCEPTION 'payment_time_required'; END IF;
      ELSE o.paid_at:=p_paid_at; END IF;
    END IF;
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
  UPDATE resume_writing_orders SET paid_session_id=o.paid_session_id, paid_at=o.paid_at, payment_status=next_payment,
    checkout_status=next_checkout, payment_review_required=needs_review, fulfillment_status=next_fulfillment,
    version=version+1, updated_at=now()
    WHERE id=o.id AND (paid_session_id IS DISTINCT FROM o.paid_session_id OR paid_at IS DISTINCT FROM o.paid_at OR payment_status<>next_payment
      OR checkout_status<>next_checkout OR payment_review_required<>needs_review OR fulfillment_status<>next_fulfillment);
  INSERT INTO resume_writing_events(event_id,event_type,session_id,order_id,outcome)
    VALUES(p_event_id,p_event_type,p_session_id,o.id,CASE WHEN needs_review THEN 'payment_review' ELSE 'applied' END);
  RETURN jsonb_build_object('outcome',CASE WHEN needs_review THEN 'payment_review' ELSE 'applied' END,'orderId',o.id,'duplicate',false);
END $$;

CREATE OR REPLACE FUNCTION public.respond_resume_writing_draft(p_id uuid,p_user_id uuid,p_version integer,p_action text,p_note text,p_request_id uuid,p_policy text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o resume_writing_orders; target text;
BEGIN
  SELECT * INTO STRICT o FROM resume_writing_orders WHERE id=p_id AND user_id=p_user_id AND payment_policy=p_policy FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_user_id AND NOT coalesce(is_banned,false)) THEN RAISE EXCEPTION 'owner_required'; END IF;
  IF p_action='revision' AND o.revision_request_id=p_request_id AND o.revision_note=p_note THEN RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id'; END IF;
  IF p_action='approve' AND o.fulfillment_status='complete' THEN RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id'; END IF;
  IF o.version<>p_version OR o.payment_status<>'paid' OR o.payment_review_required OR o.intake_status<>'complete' THEN RAISE EXCEPTION 'response_unavailable'; END IF;
  IF (SELECT count(*) FROM resume_writing_files WHERE order_id=p_id AND revision_number=o.revision_count AND published_at IS NOT NULL)<>2 THEN RAISE EXCEPTION 'published_pair_required'; END IF;
  IF p_action='revision' AND o.terms->>'version'='2026-10-19-v1'
    AND (o.revision_expires_at IS NULL OR clock_timestamp()>o.revision_expires_at) THEN RAISE EXCEPTION 'revision_window_closed'; END IF;
  IF p_action='revision' AND o.fulfillment_status IN ('draft_ready','complete') AND o.revision_count=0 AND p_request_id IS NOT NULL AND char_length(btrim(p_note)) BETWEEN 1 AND 2000 THEN target:='revision_requested';
  ELSIF p_action='approve' AND o.fulfillment_status='draft_ready' THEN target:='complete';
  ELSE RAISE EXCEPTION 'invalid_response'; END IF;
  UPDATE resume_writing_orders SET fulfillment_status=target,revision_count=revision_count+CASE WHEN target='revision_requested' THEN 1 ELSE 0 END,
    revision_note=CASE WHEN target='revision_requested' THEN p_note ELSE revision_note END,
    revision_request_id=CASE WHEN target='revision_requested' THEN p_request_id ELSE revision_request_id END,version=version+1,updated_at=now() WHERE id=p_id RETURNING * INTO o;
  INSERT INTO resume_writing_actions(order_id,actor_id,from_status,to_status) VALUES(p_id,p_user_id,'customer_response',target);
  RETURN to_jsonb(o)-'checkout_reference'-'payment_policy'-'user_id';
END $$;

REVOKE ALL ON FUNCTION public.reconcile_resume_writing_payment(text,text,text,uuid,text,text,text,text,timestamptz),
  public.respond_resume_writing_draft(uuid,uuid,integer,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_resume_writing_payment(text,text,text,uuid,text,text,text,text,timestamptz),
  public.respond_resume_writing_draft(uuid,uuid,integer,text,text,uuid,text) TO service_role;
COMMIT;
