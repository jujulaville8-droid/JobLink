BEGIN;
CREATE TABLE public.email_outbox (
 id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 recipient text NOT NULL, email_type text NOT NULL, template_data jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','needs_review')),
 first_attempt_at timestamptz, claimed_until timestamptz, claim_token uuid,
 provider_id text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_outbox FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_outbox TO service_role;
CREATE OR REPLACE FUNCTION public.claim_reminder(p_id text) RETURNS SETOF public.email_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 -- Resend retains idempotency keys for 24 hours; stop automatic retries before expiry.
 UPDATE public.email_outbox SET status='needs_review', claimed_until=null
 WHERE id=p_id AND status IN ('pending','sending') AND first_attempt_at < now()-interval '23 hours';
 RETURN QUERY UPDATE public.email_outbox SET status='sending', claim_token=gen_random_uuid(),
   claimed_until=now()+interval '5 minutes', first_attempt_at=coalesce(first_attempt_at,now())
 WHERE id=p_id AND (status='pending' OR (status='sending' AND claimed_until < now())) RETURNING *;
END; $$;
CREATE OR REPLACE FUNCTION public.finish_reminder(p_id text, p_token uuid, p_provider_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE mail public.email_outbox;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
 UPDATE public.email_outbox SET status='sent', provider_id=p_provider_id, sent_at=now(), claimed_until=null
 WHERE id=p_id AND claim_token=p_token AND status='sending' RETURNING * INTO mail;
 IF mail.id IS NULL THEN RAISE EXCEPTION 'Delivery claim expired'; END IF;
 IF mail.email_type LIKE 'signup_reminder_%' THEN
   INSERT INTO public.signup_reminder_log(auth_user_id,email,drip_step)
   VALUES(mail.user_id,mail.recipient,right(mail.email_type,1)::integer) ON CONFLICT DO NOTHING;
 ELSE
   INSERT INTO public.cv_events(user_id,event_type,metadata)
   VALUES(mail.user_id,CASE WHEN mail.email_type='resume_nudge' THEN 'resume_nudge_sent' ELSE 'resume_nudge_2_sent' END,
     jsonb_build_object('email',mail.recipient,'outbox_id',mail.id));
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.claim_reminder(text), public.finish_reminder(text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_reminder(text), public.finish_reminder(text,uuid,text) TO service_role;
COMMIT;
