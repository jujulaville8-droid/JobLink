-- ═══════════════════════════════════════════════════════════════════════
-- CV Builder Schema
-- Structured CV data stored alongside existing seeker_profiles.
-- Contact info is NOT duplicated — read from seeker_profiles + users.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── cv_profiles ─────────────────────────────────────────────────────
CREATE TABLE public.cv_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  job_title TEXT,
  summary TEXT,
  completion_percentage INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cv_profiles_user_id ON public.cv_profiles(user_id);

ALTER TABLE public.cv_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_profiles_select_own"
  ON public.cv_profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "cv_profiles_insert_own"
  ON public.cv_profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cv_profiles_update_own"
  ON public.cv_profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "cv_profiles_delete_own"
  ON public.cv_profiles FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "cv_profiles_select_admin"
  ON public.cv_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER set_cv_profiles_updated_at
  BEFORE UPDATE ON public.cv_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── cv_work_experiences ─────────────────────────────────────────────
CREATE TABLE public.cv_work_experiences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cv_profile_id UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  location TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cv_work_experiences_profile ON public.cv_work_experiences(cv_profile_id);

ALTER TABLE public.cv_work_experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_work_exp_select_own"
  ON public.cv_work_experiences FOR SELECT
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_work_exp_insert_own"
  ON public.cv_work_experiences FOR INSERT
  WITH CHECK (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_work_exp_update_own"
  ON public.cv_work_experiences FOR UPDATE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_work_exp_delete_own"
  ON public.cv_work_experiences FOR DELETE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_work_exp_select_admin"
  ON public.cv_work_experiences FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER set_cv_work_experiences_updated_at
  BEFORE UPDATE ON public.cv_work_experiences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── cv_education ────────────────────────────────────────────────────
CREATE TABLE public.cv_education (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cv_profile_id UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
  institution TEXT NOT NULL,
  degree TEXT NOT NULL,
  field_of_study TEXT,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cv_education_profile ON public.cv_education(cv_profile_id);

ALTER TABLE public.cv_education ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_edu_select_own"
  ON public.cv_education FOR SELECT
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_edu_insert_own"
  ON public.cv_education FOR INSERT
  WITH CHECK (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_edu_update_own"
  ON public.cv_education FOR UPDATE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_edu_delete_own"
  ON public.cv_education FOR DELETE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_edu_select_admin"
  ON public.cv_education FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER set_cv_education_updated_at
  BEFORE UPDATE ON public.cv_education
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── cv_skills ───────────────────────────────────────────────────────
CREATE TABLE public.cv_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cv_profile_id UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_cv_skills_profile ON public.cv_skills(cv_profile_id);

ALTER TABLE public.cv_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_skills_select_own"
  ON public.cv_skills FOR SELECT
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_skills_insert_own"
  ON public.cv_skills FOR INSERT
  WITH CHECK (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_skills_update_own"
  ON public.cv_skills FOR UPDATE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_skills_delete_own"
  ON public.cv_skills FOR DELETE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_skills_select_admin"
  ON public.cv_skills FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- ─── cv_awards ───────────────────────────────────────────────────────
CREATE TABLE public.cv_awards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cv_profile_id UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  issuer TEXT,
  date_received DATE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_cv_awards_profile ON public.cv_awards(cv_profile_id);

ALTER TABLE public.cv_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_awards_select_own"
  ON public.cv_awards FOR SELECT
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_awards_insert_own"
  ON public.cv_awards FOR INSERT
  WITH CHECK (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_awards_update_own"
  ON public.cv_awards FOR UPDATE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_awards_delete_own"
  ON public.cv_awards FOR DELETE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_awards_select_admin"
  ON public.cv_awards FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- ─── cv_certifications ──────────────────────────────────────────────
CREATE TABLE public.cv_certifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cv_profile_id UUID NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  issuing_organization TEXT,
  issue_date DATE,
  expiry_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_cv_certifications_profile ON public.cv_certifications(cv_profile_id);

ALTER TABLE public.cv_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_certs_select_own"
  ON public.cv_certifications FOR SELECT
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_certs_insert_own"
  ON public.cv_certifications FOR INSERT
  WITH CHECK (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_certs_update_own"
  ON public.cv_certifications FOR UPDATE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_certs_delete_own"
  ON public.cv_certifications FOR DELETE
  USING (cv_profile_id IN (SELECT id FROM public.cv_profiles WHERE user_id = auth.uid()));

CREATE POLICY "cv_certs_select_admin"
  ON public.cv_certifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- ─── cv_events (analytics) ──────────────────────────────────────────
CREATE TABLE public.cv_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cv_events_user_id ON public.cv_events(user_id);
CREATE INDEX idx_cv_events_event_type ON public.cv_events(event_type);
CREATE INDEX idx_cv_events_created_at ON public.cv_events(created_at);

ALTER TABLE public.cv_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cv_events_insert_own"
  ON public.cv_events FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cv_events_select_admin"
  ON public.cv_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));
