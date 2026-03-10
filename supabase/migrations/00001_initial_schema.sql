-- ============================================
-- JobLink Database Schema
-- Antigua's Job Platform
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ENUM TYPES
-- ============================================

CREATE TYPE user_role AS ENUM ('seeker', 'employer', 'admin');
CREATE TYPE visibility_mode AS ENUM ('actively_looking', 'open', 'not_looking');
CREATE TYPE job_type AS ENUM ('full_time', 'part_time', 'seasonal', 'contract');
CREATE TYPE job_status AS ENUM ('active', 'closed', 'pending_approval');
CREATE TYPE application_status AS ENUM ('applied', 'shortlisted', 'rejected', 'hired');

-- ============================================
-- USERS TABLE
-- Extends Supabase Auth (auth.users)
-- ============================================

CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'seeker',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- SEEKER PROFILES
-- ============================================

CREATE TABLE public.seeker_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  location TEXT,
  bio TEXT,
  skills TEXT[] DEFAULT '{}',
  experience_years INTEGER,
  education TEXT,
  cv_url TEXT,
  visibility visibility_mode NOT NULL DEFAULT 'actively_looking',
  profile_complete_pct INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- COMPANIES
-- ============================================

CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  industry TEXT,
  website TEXT,
  location TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_pro BOOLEAN NOT NULL DEFAULT FALSE,
  pro_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- JOB LISTINGS
-- ============================================

CREATE TABLE public.job_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  job_type job_type NOT NULL DEFAULT 'full_time',
  salary_min INTEGER,
  salary_max INTEGER,
  salary_visible BOOLEAN NOT NULL DEFAULT TRUE,
  location TEXT,
  requires_work_permit BOOLEAN NOT NULL DEFAULT FALSE,
  status job_status NOT NULL DEFAULT 'pending_approval',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- APPLICATIONS
-- ============================================

CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  seeker_id UUID NOT NULL REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
  cover_letter_url TEXT,
  cover_letter_text TEXT,
  status application_status NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, seeker_id)
);

-- ============================================
-- JOB ALERTS
-- ============================================

CREATE TABLE public.job_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seeker_id UUID NOT NULL REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
  keywords TEXT[] DEFAULT '{}',
  industry TEXT,
  job_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- SAVED JOBS
-- ============================================

CREATE TABLE public.saved_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seeker_id UUID NOT NULL REFERENCES public.seeker_profiles(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(seeker_id, job_id)
);

-- ============================================
-- REPORTED LISTINGS
-- ============================================

CREATE TABLE public.reported_listings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES public.job_listings(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_seeker_profiles_user_id ON public.seeker_profiles(user_id);
CREATE INDEX idx_seeker_profiles_visibility ON public.seeker_profiles(visibility);
CREATE INDEX idx_companies_user_id ON public.companies(user_id);
CREATE INDEX idx_job_listings_company_id ON public.job_listings(company_id);
CREATE INDEX idx_job_listings_status ON public.job_listings(status);
CREATE INDEX idx_job_listings_category ON public.job_listings(category);
CREATE INDEX idx_job_listings_job_type ON public.job_listings(job_type);
CREATE INDEX idx_job_listings_expires_at ON public.job_listings(expires_at);
CREATE INDEX idx_applications_job_id ON public.applications(job_id);
CREATE INDEX idx_applications_seeker_id ON public.applications(seeker_id);
CREATE INDEX idx_applications_status ON public.applications(status);
CREATE INDEX idx_job_alerts_seeker_id ON public.job_alerts(seeker_id);
CREATE INDEX idx_saved_jobs_seeker_id ON public.saved_jobs(seeker_id);
CREATE INDEX idx_reported_listings_job_id ON public.reported_listings(job_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seeker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reported_listings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: USERS
-- ============================================

-- Users can read their own record
CREATE POLICY "Users can view own record"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "Admins can view all users"
  ON public.users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can update their own record
CREATE POLICY "Users can update own record"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

-- Allow insert on signup (via trigger or service role)
CREATE POLICY "Users can insert own record"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- RLS POLICIES: SEEKER PROFILES
-- ============================================

-- Seekers can view and edit their own profile
CREATE POLICY "Seekers can view own profile"
  ON public.seeker_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Seekers can update own profile"
  ON public.seeker_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Seekers can insert own profile"
  ON public.seeker_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Employers can view profiles of seekers who applied to their listings
CREATE POLICY "Employers can view applicant profiles"
  ON public.seeker_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.job_listings j ON a.job_id = j.id
      JOIN public.companies c ON j.company_id = c.id
      WHERE a.seeker_id = seeker_profiles.id
      AND c.user_id = auth.uid()
    )
  );

-- Employers can view actively_looking profiles
CREATE POLICY "Employers can view actively looking profiles"
  ON public.seeker_profiles FOR SELECT
  USING (
    visibility = 'actively_looking'
    AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'employer'
    )
  );

-- Admins can view all profiles
CREATE POLICY "Admins can view all seeker profiles"
  ON public.seeker_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS POLICIES: COMPANIES
-- ============================================

-- Company profiles are publicly readable
CREATE POLICY "Companies are publicly viewable"
  ON public.companies FOR SELECT
  USING (true);

-- Employers can insert their own company
CREATE POLICY "Employers can insert own company"
  ON public.companies FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Employers can update their own company
CREATE POLICY "Employers can update own company"
  ON public.companies FOR UPDATE
  USING (user_id = auth.uid());

-- Admins can update any company (verification, pro status)
CREATE POLICY "Admins can update any company"
  ON public.companies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS POLICIES: JOB LISTINGS
-- ============================================

-- Active jobs are publicly readable
CREATE POLICY "Active jobs are publicly viewable"
  ON public.job_listings FOR SELECT
  USING (status = 'active');

-- Employers can view their own listings (any status)
CREATE POLICY "Employers can view own listings"
  ON public.job_listings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = job_listings.company_id
      AND companies.user_id = auth.uid()
    )
  );

-- Employers can insert listings for their company
CREATE POLICY "Employers can insert listings"
  ON public.job_listings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = job_listings.company_id
      AND companies.user_id = auth.uid()
    )
  );

-- Employers can update their own listings
CREATE POLICY "Employers can update own listings"
  ON public.job_listings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.companies
      WHERE companies.id = job_listings.company_id
      AND companies.user_id = auth.uid()
    )
  );

-- Admins can view all listings
CREATE POLICY "Admins can view all listings"
  ON public.job_listings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update any listing (approve, feature, etc.)
CREATE POLICY "Admins can update any listing"
  ON public.job_listings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS POLICIES: APPLICATIONS
-- ============================================

-- Seekers can view their own applications
CREATE POLICY "Seekers can view own applications"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.seeker_profiles
      WHERE seeker_profiles.id = applications.seeker_id
      AND seeker_profiles.user_id = auth.uid()
    )
  );

-- Seekers can insert applications
CREATE POLICY "Seekers can insert applications"
  ON public.applications FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.seeker_profiles
      WHERE seeker_profiles.id = applications.seeker_id
      AND seeker_profiles.user_id = auth.uid()
    )
  );

-- Employers can view applications to their listings
CREATE POLICY "Employers can view applications to own listings"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_listings j
      JOIN public.companies c ON j.company_id = c.id
      WHERE j.id = applications.job_id
      AND c.user_id = auth.uid()
    )
  );

-- Employers can update application status for their listings
CREATE POLICY "Employers can update application status"
  ON public.applications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.job_listings j
      JOIN public.companies c ON j.company_id = c.id
      WHERE j.id = applications.job_id
      AND c.user_id = auth.uid()
    )
  );

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
  ON public.applications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS POLICIES: JOB ALERTS
-- ============================================

CREATE POLICY "Seekers can manage own alerts"
  ON public.job_alerts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.seeker_profiles
      WHERE seeker_profiles.id = job_alerts.seeker_id
      AND seeker_profiles.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS POLICIES: SAVED JOBS
-- ============================================

CREATE POLICY "Seekers can manage own saved jobs"
  ON public.saved_jobs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.seeker_profiles
      WHERE seeker_profiles.id = saved_jobs.seeker_id
      AND seeker_profiles.user_id = auth.uid()
    )
  );

-- ============================================
-- RLS POLICIES: REPORTED LISTINGS
-- ============================================

-- Any logged-in user can report a listing
CREATE POLICY "Users can insert reports"
  ON public.reported_listings FOR INSERT
  WITH CHECK (auth.uid() = reported_by);

-- Admins can view all reports
CREATE POLICY "Admins can view all reports"
  ON public.reported_listings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- FUNCTION: Auto-create user record on signup
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'seeker')::user_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- FUNCTION: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.seeker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- STORAGE BUCKETS
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('cvs', 'cvs', false),
  ('cover-letters', 'cover-letters', false),
  ('company-logos', 'company-logos', true);

-- Storage policies: CVs
CREATE POLICY "Seekers can upload own CV"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cvs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Seekers can view own CV"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cvs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies: Cover letters
CREATE POLICY "Seekers can upload cover letters"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cover-letters'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies: Company logos (public read)
CREATE POLICY "Anyone can view company logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

CREATE POLICY "Employers can upload company logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-logos'
    AND auth.uid() IS NOT NULL
  );
