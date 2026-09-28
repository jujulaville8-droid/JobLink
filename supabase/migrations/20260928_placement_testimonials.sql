BEGIN;
-- A placement explicitly confirms a hire; it is separate from an on-hold application.
CREATE TABLE public.placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,
  employer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  job_title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_started_at timestamptz,
  request_sent_at timestamptz,
  request_email text,
  feedback text CHECK (char_length(feedback) BETWEEN 10 AND 600),
  rating integer CHECK (rating BETWEEN 1 AND 5),
  consent boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'awaiting' CHECK (review_status IN ('awaiting','pending','approved','rejected')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (review_status <> 'approved' OR (consent AND feedback IS NOT NULL AND rating IS NOT NULL AND rating >= 4))
);
ALTER TABLE public.placements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.placements FROM anon, authenticated;
GRANT SELECT ON public.placements TO authenticated;
GRANT ALL ON public.placements TO service_role;
CREATE POLICY placements_owner_read ON public.placements FOR SELECT TO authenticated USING (employer_id = auth.uid());
CREATE INDEX placements_pending_requests ON public.placements(created_at) WHERE request_sent_at IS NULL;

-- Service-only transaction: verify ownership, record once, optionally close listing.
CREATE FUNCTION public.confirm_placement(p_application uuid, p_employer uuid, p_close boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result_id uuid; job_id_value uuid; company_label text; job_label text;
BEGIN
  SELECT j.id, c.company_name, j.title INTO job_id_value, company_label, job_label
  FROM applications a JOIN job_listings j ON j.id = a.job_id JOIN companies c ON c.id = j.company_id
  WHERE a.id = p_application AND c.user_id = p_employer;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found or not owned'; END IF;
  INSERT INTO placements(application_id, employer_id, company_name, job_title)
  VALUES(p_application, p_employer, company_label, job_label) ON CONFLICT(application_id) DO NOTHING;
  SELECT id INTO result_id FROM placements WHERE application_id = p_application;
  IF p_close THEN UPDATE job_listings SET status = 'closed' WHERE id = job_id_value; END IF;
  RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.confirm_placement(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_placement(uuid, uuid, boolean) TO service_role;
COMMIT;
