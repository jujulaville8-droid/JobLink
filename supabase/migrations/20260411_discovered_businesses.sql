-- Review queue for businesses discovered by the Claude Code business-discovery bot.
-- The script at scripts/discover-businesses.ts populates this table; Julian manually
-- approves/rejects rows before any outreach is sent via /api/send-outreach.

CREATE TABLE public.discovered_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  email text,
  phone text,
  website text,
  sector text,
  location text,
  role_hiring_for text,
  source text NOT NULL,
  source_url text,
  evidence text,
  confidence_score int,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'sent')),
  notes text,
  discovered_at timestamptz NOT NULL DEFAULT NOW(),
  reviewed_at timestamptz,
  sent_at timestamptz
);

CREATE INDEX discovered_businesses_status_idx
  ON public.discovered_businesses (status, discovered_at DESC);

CREATE INDEX discovered_businesses_email_idx
  ON public.discovered_businesses (email);

ALTER TABLE public.discovered_businesses ENABLE ROW LEVEL SECURITY;
-- No user-facing policies yet — script uses service role which bypasses RLS.
