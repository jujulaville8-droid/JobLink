-- Derived applicant-reported claims only. Never store decoded CV text.
ALTER TABLE public.seeker_profiles
  ADD COLUMN IF NOT EXISTS cv_skills text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cv_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cv_parse_status text NOT NULL DEFAULT 'pending'
    CHECK (cv_parse_status IN ('parsed', 'no_cv', 'unreadable', 'empty', 'pending')),
  ADD COLUMN IF NOT EXISTS cv_parsed_at timestamptz;

-- Invalidate atomically even for writers other than the profile API. This is the
-- source-change marker; unrelated profile edits do not enqueue another parse.
CREATE OR REPLACE FUNCTION public.invalidate_seeker_cv_parse()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.cv_url IS DISTINCT FROM OLD.cv_url THEN
    NEW.cv_skills := '{}';
    NEW.cv_roles := '{}';
    NEW.cv_parse_status := 'pending';
    NEW.cv_parsed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS invalidate_seeker_cv_parse ON public.seeker_profiles;
CREATE TRIGGER invalidate_seeker_cv_parse BEFORE UPDATE ON public.seeker_profiles
FOR EACH ROW EXECUTE FUNCTION public.invalidate_seeker_cv_parse();

CREATE INDEX IF NOT EXISTS seeker_cv_pending_idx ON public.seeker_profiles (id)
  WHERE cv_parse_status = 'pending';

-- PostgREST computed field: enables the same escaped ILIKE substring behavior
-- for arrays without fetching every visible profile into application memory.
-- Invoker rights preserve the table's existing visibility/RLS rules.
CREATE OR REPLACE FUNCTION public.candidate_skill_search(public.seeker_profiles)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT concat_ws(' ', array_to_string($1.skills, ' '),
    array_to_string($1.cv_skills, ' '), array_to_string($1.cv_roles, ' '));
$$;
NOTIFY pgrst, 'reload schema';
