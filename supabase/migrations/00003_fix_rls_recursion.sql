-- Fix infinite recursion in users table RLS policies
-- The "Admins can view all users" policy queries public.users from within a policy on public.users

DROP POLICY IF EXISTS "Admins can view all users" ON public.users;

-- Use auth.users metadata instead to check admin role (avoids recursion)
CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

-- Also fix the admin policies on other tables that reference public.users
-- These won't cause infinite recursion but it's cleaner to use auth.users

DROP POLICY IF EXISTS "Admins can view all seeker profiles" ON public.seeker_profiles;
CREATE POLICY "Admins can view all seeker profiles"
  ON public.seeker_profiles FOR SELECT
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can update any company" ON public.companies;
CREATE POLICY "Admins can update any company"
  ON public.companies FOR UPDATE
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can view all listings" ON public.job_listings;
CREATE POLICY "Admins can view all listings"
  ON public.job_listings FOR SELECT
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can update any listing" ON public.job_listings;
CREATE POLICY "Admins can update any listing"
  ON public.job_listings FOR UPDATE
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can view all applications" ON public.applications;
CREATE POLICY "Admins can view all applications"
  ON public.applications FOR SELECT
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS "Admins can view all reports" ON public.reported_listings;
CREATE POLICY "Admins can view all reports"
  ON public.reported_listings FOR SELECT
  USING (
    (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'admin'
  );

-- Also fix employer policies that reference public.users (to avoid potential recursion)
DROP POLICY IF EXISTS "Employers can view actively looking profiles" ON public.seeker_profiles;
CREATE POLICY "Employers can view actively looking profiles"
  ON public.seeker_profiles FOR SELECT
  USING (
    visibility = 'actively_looking'
    AND (SELECT raw_user_meta_data->>'role' FROM auth.users WHERE id = auth.uid()) = 'employer'
  );
