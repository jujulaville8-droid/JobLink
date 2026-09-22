BEGIN;
CREATE OR REPLACE FUNCTION public.process_stripe_event(p_event jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE owner_id uuid; company uuid; customer text; sub_id text; version bigint; inserted integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only' USING ERRCODE = '42501'; END IF;
 IF coalesce(p_event->>'id','') = '' THEN RAISE EXCEPTION 'Event ID required'; END IF;
 INSERT INTO public.stripe_events(id, event_type) VALUES(p_event->>'id', p_event->>'type') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted = ROW_COUNT;
 IF inserted = 0 THEN RETURN; END IF;
 IF p_event->>'kind' = 'purchase' THEN
   INSERT INTO public.ai_purchases(user_id, feature, stripe_session_id)
     VALUES((p_event->>'user_id')::uuid, 'smart_resume', p_event->>'session_id')
     ON CONFLICT (stripe_session_id) DO NOTHING;
 ELSIF p_event->>'kind' = 'subscription' THEN
   customer := p_event->>'customer_id'; sub_id := p_event->>'subscription_id';
   version := (p_event->>'created')::bigint;
   -- Serialize distinct events for the same customer, including multiple subscriptions.
   PERFORM pg_advisory_xact_lock(hashtextextended(customer, 0));
   owner_id := (p_event->>'user_id')::uuid;
   company := (p_event->>'company_id')::uuid;
   IF company IS NOT NULL THEN
     IF owner_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies WHERE id = company AND user_id = owner_id) THEN
       RAISE EXCEPTION 'Company ownership mismatch';
     END IF;
     SELECT user_id INTO STRICT owner_id FROM public.companies WHERE id = company;
   END IF;
   IF owner_id IS NULL THEN SELECT user_id, company_id INTO owner_id, company FROM public.subscriptions WHERE stripe_subscription_id = sub_id; END IF;
   IF owner_id IS NULL THEN SELECT user_id, id INTO owner_id, company FROM public.companies WHERE stripe_customer_id = customer; END IF;
   IF owner_id IS NULL THEN SELECT id INTO owner_id FROM public.users WHERE stripe_customer_id = customer; END IF;
   IF owner_id IS NULL THEN RAISE EXCEPTION 'Subscription owner unresolved; retry after checkout event'; END IF;
   IF company IS NULL THEN SELECT id INTO company FROM public.companies WHERE user_id = owner_id; END IF;
   IF EXISTS(SELECT 1 FROM public.subscriptions WHERE stripe_subscription_id = sub_id AND user_id IS NOT NULL AND user_id <> owner_id) THEN
     RAISE EXCEPTION 'Subscription ownership mismatch';
   END IF;
   INSERT INTO public.subscriptions(company_id, user_id, stripe_subscription_id, stripe_customer_id, status, current_period_end, event_created)
   VALUES(company, owner_id, sub_id, customer, p_event->>'status', (p_event->>'current_period_end')::timestamptz, version)
   ON CONFLICT (stripe_subscription_id) DO UPDATE SET
     company_id = excluded.company_id, user_id = excluded.user_id, stripe_customer_id = excluded.stripe_customer_id,
     status = excluded.status, current_period_end = excluded.current_period_end, event_created = excluded.event_created
   WHERE subscriptions.event_created <= excluded.event_created
     AND (subscriptions.status <> 'canceled' OR excluded.status = 'canceled');
   UPDATE public.users SET stripe_customer_id = customer WHERE id = owner_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
   UPDATE public.companies c SET stripe_customer_id = customer,
     is_pro = EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.user_id = owner_id AND s.status IN ('active','trialing') AND s.current_period_end > now()),
     pro_expires_at = (SELECT max(s.current_period_end) FROM public.subscriptions s WHERE s.user_id = owner_id AND s.status IN ('active','trialing'))
   WHERE c.user_id = owner_id;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.process_stripe_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_stripe_event(jsonb) TO service_role;

-- A purchase made before company creation is retained and linked on creation.
CREATE OR REPLACE FUNCTION public.link_company_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 SELECT stripe_customer_id INTO NEW.stripe_customer_id FROM public.users WHERE id = NEW.user_id;
 SELECT max(current_period_end) INTO NEW.pro_expires_at FROM public.subscriptions
   WHERE user_id = NEW.user_id AND status IN ('active','trialing') AND current_period_end > now();
 NEW.is_pro := NEW.pro_expires_at IS NOT NULL;
 RETURN NEW;
END; $$;
-- Runs after protect_company_fields (triggers sort by name) so input is checked first.
CREATE TRIGGER zz_link_company_subscription BEFORE INSERT ON public.companies
 FOR EACH ROW EXECUTE FUNCTION public.link_company_subscription();
REVOKE ALL ON FUNCTION public.link_company_subscription() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.attach_company_subscription() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 UPDATE public.subscriptions SET company_id = NEW.id WHERE user_id = NEW.user_id AND company_id IS NULL;
 RETURN NEW;
END; $$;
CREATE TRIGGER attach_company_subscription AFTER INSERT ON public.companies
 FOR EACH ROW EXECUTE FUNCTION public.attach_company_subscription();
REVOKE ALL ON FUNCTION public.attach_company_subscription() FROM PUBLIC,anon,authenticated;
COMMIT;
