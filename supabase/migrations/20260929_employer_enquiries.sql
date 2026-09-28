BEGIN;
CREATE TABLE public.employer_enquiries (
  id uuid PRIMARY KEY,
  company_name text NOT NULL CHECK (char_length(company_name) BETWEEN 2 AND 150),
  contact_name text NOT NULL CHECK (char_length(contact_name) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (char_length(email) <= 254),
  phone text NOT NULL DEFAULT '' CHECK (char_length(phone) <= 40),
  job_title text NOT NULL CHECK (char_length(job_title) BETWEEN 2 AND 150),
  details text NOT NULL CHECK (char_length(details) BETWEEN 20 AND 6000),
  source text NOT NULL DEFAULT 'website' CHECK (char_length(source) <= 80),
  contact_consent boolean NOT NULL CHECK (contact_consent),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','preparing','live','closed')),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 6000),
  listing_id uuid REFERENCES public.job_listings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  notification_started_at timestamptz,
  notification_sent_at timestamptz
);
ALTER TABLE public.employer_enquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.employer_enquiries FROM anon, authenticated;
GRANT ALL ON public.employer_enquiries TO service_role;
CREATE INDEX employer_enquiries_queue ON public.employer_enquiries(created_at) WHERE notification_sent_at IS NULL;
COMMIT;
