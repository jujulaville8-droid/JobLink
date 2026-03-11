-- Fix infinite recursion: seeker_profiles <-> applications circular RLS dependency
-- Chain: seeker_profiles policy -> applications table (has RLS) -> seeker_profiles = recursion

-- 1) Create a SECURITY DEFINER function to safely check employer-applicant relationship
--    This bypasses RLS to break the circular dependency
CREATE OR REPLACE FUNCTION public.is_employer_of_applicant(p_seeker_id UUID, p_employer_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.job_listings j ON a.job_id = j.id
    JOIN public.companies c ON j.company_id = c.id
    WHERE a.seeker_id = p_seeker_id AND c.user_id = p_employer_uid
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 2) Replace the problematic policy on seeker_profiles
DROP POLICY IF EXISTS "Employers can view applicant profiles" ON public.seeker_profiles;
CREATE POLICY "Employers can view applicant profiles"
  ON public.seeker_profiles FOR SELECT
  USING (public.is_employer_of_applicant(id, auth.uid()));
