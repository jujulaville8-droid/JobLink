-- ═══════════════════════════════════════════════════════════════════════
-- Signup Reminder Log
-- Tracks reminder emails sent to users who signed up but never verified.
-- Uses auth_user_id (not FK to public.users) since these users haven't
-- completed signup and may not have a public.users row.
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.signup_reminder_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  drip_step INT NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signup_reminder_log_auth_user
  ON public.signup_reminder_log(auth_user_id, drip_step);

CREATE INDEX idx_signup_reminder_log_sent_at
  ON public.signup_reminder_log(sent_at DESC);

ALTER TABLE public.signup_reminder_log ENABLE ROW LEVEL SECURITY;

-- Only service role (admin client) can read/write this table
CREATE POLICY "Service role full access"
  ON public.signup_reminder_log
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
