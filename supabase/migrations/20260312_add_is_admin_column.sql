-- Add is_admin column to persist admin privilege across role switches.
-- Previously, switching to seeker/employer overwrote the admin role,
-- making it impossible to switch back.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any user currently with role='admin' gets is_admin=true
UPDATE public.users SET is_admin = true WHERE role = 'admin';

-- Update RLS policies to check is_admin instead of role='admin'
-- (Existing policies still work since admin users keep role='admin' initially,
-- but this ensures they work after role switching too)

-- Drop and recreate admin policies to use is_admin
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can view all seeker profiles" ON public.seeker_profiles;
CREATE POLICY "Admins can view all seeker profiles" ON public.seeker_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can update any company" ON public.companies;
CREATE POLICY "Admins can update any company" ON public.companies
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can view all listings" ON public.job_listings;
CREATE POLICY "Admins can view all listings" ON public.job_listings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can update any listing" ON public.job_listings;
CREATE POLICY "Admins can update any listing" ON public.job_listings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can view all applications" ON public.applications;
CREATE POLICY "Admins can view all applications" ON public.applications
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can view all reports" ON public.reported_listings;
CREATE POLICY "Admins can view all reports" ON public.reported_listings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
