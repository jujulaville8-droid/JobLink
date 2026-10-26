BEGIN;

-- Existing job_alert_log is tied to an alert, and notification_log requires a
-- conversation and permits authenticated inserts. Neither can safely arbitrate
-- service-only, per-job/per-user closure sends. Store no addresses or email body.
CREATE TABLE public.job_closure_notification_log (
  job_id uuid NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  message_id text,
  PRIMARY KEY (job_id, user_id)
);
CREATE INDEX job_closure_notification_log_user_id ON public.job_closure_notification_log(user_id);
ALTER TABLE public.job_closure_notification_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_closure_notification_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_closure_notification_log TO service_role;

-- Preserve the existing atomic hire/optional-close transaction and its callers.
-- Lock the owned job before reading status so concurrent closes cannot both
-- report an active -> closed transition. The old RPC still records the hire.
CREATE FUNCTION public.confirm_placement_with_closure(p_application uuid, p_employer uuid, p_close boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE job_id_value uuid; previous_status text; placement_id_value uuid;
BEGIN
  SELECT j.id, j.status::text INTO job_id_value, previous_status
  FROM applications a JOIN job_listings j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id
  WHERE a.id = p_application AND c.user_id = p_employer
  FOR UPDATE OF j;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found or not owned'; END IF;

  placement_id_value := public.confirm_placement(p_application, p_employer, p_close);
  RETURN jsonb_build_object(
    'placement_id', placement_id_value,
    'closed_job_id', CASE WHEN p_close AND previous_status = 'active' THEN job_id_value ELSE NULL END
  );
END $$;
REVOKE ALL ON FUNCTION public.confirm_placement_with_closure(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_placement_with_closure(uuid, uuid, boolean) TO service_role;

COMMIT;
