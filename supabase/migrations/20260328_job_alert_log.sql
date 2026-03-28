-- Track which alert+job combinations have already been emailed
-- to prevent duplicate notifications.
CREATE TABLE public.job_alert_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES public.job_alerts(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alert_id, job_id)
);

CREATE INDEX idx_job_alert_log_alert_id ON public.job_alert_log(alert_id);
CREATE INDEX idx_job_alert_log_job_id ON public.job_alert_log(job_id);

ALTER TABLE public.job_alert_log ENABLE ROW LEVEL SECURITY;
