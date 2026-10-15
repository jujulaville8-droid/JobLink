-- Optional, deeper seeker profile details.
--
-- Practical work details live on seeker_profiles so employers who can already
-- read an applicant's profile (existing RLS) can see them on applications.
-- Every column is nullable: NULL means "not answered".
ALTER TABLE public.seeker_profiles
  ADD COLUMN IF NOT EXISTS currently_employed BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_own_transport BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_drivers_licence BOOLEAN,
  ADD COLUMN IF NOT EXISTS availability TEXT[],
  ADD COLUMN IF NOT EXISTS willing_to_relocate BOOLEAN,
  ADD COLUMN IF NOT EXISTS languages TEXT[],
  ADD COLUMN IF NOT EXISTS certifications TEXT[],
  ADD COLUMN IF NOT EXISTS notice_period TEXT,
  ADD COLUMN IF NOT EXISTS earliest_start_date DATE;

ALTER TABLE public.seeker_profiles DROP CONSTRAINT IF EXISTS seeker_profiles_availability_check;
ALTER TABLE public.seeker_profiles ADD CONSTRAINT seeker_profiles_availability_check
  CHECK (availability IS NULL OR availability <@ ARRAY['full_time', 'part_time', 'shifts', 'weekends']::TEXT[]);
ALTER TABLE public.seeker_profiles DROP CONSTRAINT IF EXISTS seeker_profiles_languages_check;
ALTER TABLE public.seeker_profiles ADD CONSTRAINT seeker_profiles_languages_check
  CHECK (languages IS NULL OR cardinality(languages) <= 20);
ALTER TABLE public.seeker_profiles DROP CONSTRAINT IF EXISTS seeker_profiles_certifications_check;
ALTER TABLE public.seeker_profiles ADD CONSTRAINT seeker_profiles_certifications_check
  CHECK (certifications IS NULL OR cardinality(certifications) <= 30);
ALTER TABLE public.seeker_profiles DROP CONSTRAINT IF EXISTS seeker_profiles_notice_period_check;
ALTER TABLE public.seeker_profiles ADD CONSTRAINT seeker_profiles_notice_period_check
  CHECK (notice_period IS NULL OR notice_period IN ('immediately', 'one_week', 'two_weeks', 'one_month', 'more_than_one_month'));

-- Sensitive, voluntary details: visible only to the seeker and JobLinks admins.
-- Kept in a separate table because employers can read seeker_profiles rows;
-- no employer policy exists here, so RLS denies them every row.
CREATE TABLE IF NOT EXISTS public.seeker_sensitive_details (
  seeker_id UUID PRIMARY KEY REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
  marital_status TEXT CHECK (marital_status IS NULL OR marital_status IN
    ('single', 'married', 'common_law', 'divorced', 'separated', 'widowed', 'prefer_not_to_say')),
  children_count SMALLINT CHECK (children_count IS NULL OR children_count BETWEEN 0 AND 20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.seeker_sensitive_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.seeker_sensitive_details FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.seeker_sensitive_details TO authenticated;
GRANT ALL ON TABLE public.seeker_sensitive_details TO service_role;

DROP POLICY IF EXISTS "Seekers manage own sensitive details" ON public.seeker_sensitive_details;
CREATE POLICY "Seekers manage own sensitive details" ON public.seeker_sensitive_details
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.seeker_profiles sp WHERE sp.id = seeker_id AND sp.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.seeker_profiles sp WHERE sp.id = seeker_id AND sp.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can view sensitive details" ON public.seeker_sensitive_details;
CREATE POLICY "Admins can view sensitive details" ON public.seeker_sensitive_details
  FOR SELECT TO authenticated
  USING (public.is_admin_user());
