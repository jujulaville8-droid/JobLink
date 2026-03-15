-- Fix RLS policy so employers can browse candidates with visibility 'open' (not just 'actively_looking')
DROP POLICY IF EXISTS "Employers can view actively looking profiles" ON public.seeker_profiles;

CREATE POLICY "Employers can view browsable profiles"
  ON public.seeker_profiles FOR SELECT
  USING (
    visibility IN ('actively_looking', 'open')
    AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'employer'
    )
  );
