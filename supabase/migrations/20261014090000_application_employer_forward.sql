-- Records whether each application was emailed to the employer, for admins.
-- Written only by the service role in notifyNewApplicant(). No backfill:
-- existing applications stay NULL and show as "Not tracked".
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS employer_forward_status TEXT
    CHECK (employer_forward_status IN ('sent', 'not_sent')),
  ADD COLUMN IF NOT EXISTS employer_forward_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS employer_forwarded_at TIMESTAMPTZ;
