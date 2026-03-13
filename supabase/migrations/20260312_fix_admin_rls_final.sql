-- Create a SECURITY DEFINER function to check admin status without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.users WHERE id = auth.uid()),
    false
  );
$$;

-- Recreate all admin policies using the SECURITY DEFINER function
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all seeker profiles" ON public.seeker_profiles;
CREATE POLICY "Admins can view all seeker profiles" ON public.seeker_profiles
  FOR SELECT USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can update any company" ON public.companies;
CREATE POLICY "Admins can update any company" ON public.companies
  FOR UPDATE USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all listings" ON public.job_listings;
CREATE POLICY "Admins can view all listings" ON public.job_listings
  FOR SELECT USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can update any listing" ON public.job_listings;
CREATE POLICY "Admins can update any listing" ON public.job_listings
  FOR UPDATE USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all applications" ON public.applications;
CREATE POLICY "Admins can view all applications" ON public.applications
  FOR SELECT USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all reports" ON public.reported_listings;
CREATE POLICY "Admins can view all reports" ON public.reported_listings
  FOR SELECT USING (public.is_admin_user());

-- Also add admin UPDATE policy for users table (needed for banning)
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;
CREATE POLICY "Admins can update any user" ON public.users
  FOR UPDATE USING (public.is_admin_user());

-- Ensure the user's is_admin flag and role are correct
UPDATE public.users SET is_admin = true, role = 'admin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'jujulaville8@gmail.com');

UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'jujulaville8@gmail.com';
