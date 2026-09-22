-- Additive compatibility schema. Compare with the restored schema before deployment.
BEGIN;
ALTER TABLE public.seeker_profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.conversations ALTER COLUMN application_id DROP NOT NULL;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE TABLE IF NOT EXISTS public.subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
 user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
 stripe_subscription_id text NOT NULL UNIQUE, stripe_customer_id text NOT NULL,
 status text NOT NULL, current_period_end timestamptz NOT NULL,
 event_created bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ALTER COLUMN company_id DROP NOT NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS event_created bigint NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_id_unique ON public.subscriptions(stripe_subscription_id);
CREATE TABLE IF NOT EXISTS public.ai_purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 feature text NOT NULL, stripe_session_id text NOT NULL UNIQUE, purchased_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_purchases_session_unique ON public.ai_purchases(stripe_session_id);
CREATE TABLE IF NOT EXISTS public.ai_usage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 feature text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_user_feature_time ON public.ai_usage(user_id, feature, created_at);
CREATE TABLE IF NOT EXISTS public.ai_resume_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
 preview_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_resume_preview_user_unique ON public.ai_resume_previews(user_id);
CREATE TABLE IF NOT EXISTS public.stripe_events (
 id text PRIMARY KEY, event_type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.ai_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_purchases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_purchases TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_resume_previews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_resume_previews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_resume_previews TO service_role;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stripe_events TO service_role;
GRANT SELECT ON public.subscriptions TO authenticated;
DROP POLICY IF EXISTS subscriptions_owner_read ON public.subscriptions;
CREATE POLICY subscriptions_owner_read ON public.subscriptions FOR SELECT TO authenticated
 USING (user_id = auth.uid() OR EXISTS(SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE TABLE IF NOT EXISTS public.cv_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cv_profile_id uuid NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
 title text NOT NULL, role text, url text, description text, start_date text, end_date text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.cv_projects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_projects TO authenticated;
GRANT ALL ON public.cv_projects TO service_role;
DROP POLICY IF EXISTS cv_projects_owner ON public.cv_projects;
CREATE POLICY cv_projects_owner ON public.cv_projects FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()));
CREATE TABLE IF NOT EXISTS public.cv_languages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cv_profile_id uuid NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
 name text NOT NULL, proficiency text NOT NULL DEFAULT 'Conversational', sort_order integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.cv_languages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_languages TO authenticated;
GRANT ALL ON public.cv_languages TO service_role;
DROP POLICY IF EXISTS cv_languages_owner ON public.cv_languages;
CREATE POLICY cv_languages_owner ON public.cv_languages FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()));
CREATE TABLE IF NOT EXISTS public.cv_volunteer (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cv_profile_id uuid NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
 organization text NOT NULL, role text, description text, start_date text, end_date text, is_current boolean NOT NULL DEFAULT false, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.cv_volunteer ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_volunteer TO authenticated;
GRANT ALL ON public.cv_volunteer TO service_role;
DROP POLICY IF EXISTS cv_volunteer_owner ON public.cv_volunteer;
CREATE POLICY cv_volunteer_owner ON public.cv_volunteer FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()));
CREATE TABLE IF NOT EXISTS public.cv_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cv_profile_id uuid NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
 organization text NOT NULL, role text, year_joined text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.cv_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_memberships TO authenticated;
GRANT ALL ON public.cv_memberships TO service_role;
DROP POLICY IF EXISTS cv_memberships_owner ON public.cv_memberships;
CREATE POLICY cv_memberships_owner ON public.cv_memberships FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()));
CREATE TABLE IF NOT EXISTS public.cv_references (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cv_profile_id uuid NOT NULL REFERENCES public.cv_profiles(id) ON DELETE CASCADE,
 name text NOT NULL, title text, company text, phone text, email text, relationship text, sort_order integer NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.cv_references ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_references TO authenticated;
GRANT ALL ON public.cv_references TO service_role;
DROP POLICY IF EXISTS cv_references_owner ON public.cv_references;
CREATE POLICY cv_references_owner ON public.cv_references FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()))
 WITH CHECK (EXISTS(SELECT 1 FROM public.cv_profiles p WHERE p.id = cv_profile_id AND p.user_id = auth.uid()));
ALTER TABLE public.cv_work_experiences ALTER COLUMN start_date DROP NOT NULL;
COMMIT;
