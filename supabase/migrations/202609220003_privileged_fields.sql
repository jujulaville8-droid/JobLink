BEGIN;
-- Restored production has no June trigger; install it explicitly.
-- Prevent authenticated clients from editing privileged public.users fields.
-- Legitimate changes are made by verified server routes using the service role.
CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role NOT IN ('seeker', 'employer')
        OR NEW.email_verified = true
        OR NEW.is_banned = true
        OR NEW.is_admin = true
      THEN
        RAISE EXCEPTION 'Privileged user fields may only be changed by the server';
      END IF;
    ELSIF NEW.email IS DISTINCT FROM OLD.email
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
      OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
      OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
    THEN
      RAISE EXCEPTION 'Privileged user fields may only be changed by the server';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_privileged_fields ON public.users;
CREATE TRIGGER protect_user_privileged_fields
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_privileged_fields();


CREATE OR REPLACE FUNCTION public.protect_company_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT EXISTS (
   SELECT 1 FROM public.users WHERE id = auth.uid() AND (is_admin OR role = 'admin')
 ) THEN
   IF TG_OP = 'INSERT' THEN
     IF NEW.is_pro OR NEW.is_verified OR NEW.pro_expires_at IS NOT NULL OR NEW.stripe_customer_id IS NOT NULL THEN
       RAISE EXCEPTION 'Company privileges are managed by the server' USING ERRCODE = '42501';
     END IF;
   ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.is_pro IS DISTINCT FROM OLD.is_pro
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified OR NEW.pro_expires_at IS DISTINCT FROM OLD.pro_expires_at
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
     RAISE EXCEPTION 'Company privileges are managed by the server' USING ERRCODE = '42501';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_company_fields BEFORE INSERT OR UPDATE ON public.companies
 FOR EACH ROW EXECUTE FUNCTION public.protect_company_fields();

CREATE OR REPLACE FUNCTION public.protect_listing_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE c public.companies; trusted boolean;
BEGIN
 trusted := auth.role() = 'service_role' OR EXISTS (
   SELECT 1 FROM public.users WHERE id = auth.uid() AND (is_admin OR role = 'admin'));
 IF NOT coalesce(trusted, false) THEN
   IF TG_OP = 'INSERT' THEN
     IF NEW.status <> 'pending_approval' OR NEW.is_featured OR NEW.posted_by_admin THEN
       RAISE EXCEPTION 'Listings require approval' USING ERRCODE = '42501';
     END IF;
   ELSE
     IF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
       OR NEW.posted_by_admin IS DISTINCT FROM OLD.posted_by_admin
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
       RAISE EXCEPTION 'Listing privileges are managed by the server' USING ERRCODE = '42501';
     END IF;
     -- An employer can close a listing or submit a closed listing for review.
     IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       NEW.status = 'closed' OR (OLD.status = 'closed' AND NEW.status = 'pending_approval')) THEN
       RAISE EXCEPTION 'Listings require approval' USING ERRCODE = '42501';
     END IF;
     -- Changes to published content require renewed moderation.
     IF OLD.status = 'active' AND NEW.status = 'active' AND
       (to_jsonb(NEW) - ARRAY['status']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status']) THEN
       NEW.status := 'pending_approval';
     END IF;
   END IF;
 END IF;
 -- A row lock serializes all quota-consuming inserts/transitions for this company.
 SELECT * INTO STRICT c FROM public.companies WHERE id = NEW.company_id FOR UPDATE;
 IF NEW.status IN ('active','pending_approval') AND (NEW.expires_at IS NULL OR NEW.expires_at > now())
   AND NOT (c.is_pro AND (c.pro_expires_at IS NULL OR c.pro_expires_at > now()))
   AND NOT coalesce(trusted, false) THEN
   IF EXISTS (SELECT 1 FROM public.job_listings j WHERE j.company_id = NEW.company_id
     AND j.id <> NEW.id AND j.status IN ('active','pending_approval')
     AND (j.expires_at IS NULL OR j.expires_at > now())) THEN
     RAISE EXCEPTION 'Free accounts include one active or pending listing' USING ERRCODE = '23514';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_listing_fields BEFORE INSERT OR UPDATE ON public.job_listings
 FOR EACH ROW EXECUTE FUNCTION public.protect_listing_fields();

-- Also protect the payment link added to users; the earlier trigger protects roles.
CREATE OR REPLACE FUNCTION public.protect_user_billing() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
   IF (TG_OP = 'INSERT' AND NEW.stripe_customer_id IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id) THEN
     RAISE EXCEPTION 'Billing identity is server-managed' USING ERRCODE = '42501';
   END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_user_billing BEFORE INSERT OR UPDATE ON public.users
 FOR EACH ROW EXECUTE FUNCTION public.protect_user_billing();

CREATE OR REPLACE FUNCTION public.owns_cv_object(p_user_id uuid, p_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT p_path LIKE p_user_id::text || '/%'
   AND p_path !~ '(^|/)\.\.?(/|$)' AND p_path !~ '[%\\]'
   AND EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'cvs' AND name = p_path
     AND owner_id = p_user_id::text);
$$;
REVOKE ALL ON FUNCTION public.owns_cv_object(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_cv_object(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_cv_path() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
   RAISE EXCEPTION 'Profile ownership cannot change' USING ERRCODE = '42501';
 END IF;
 IF NEW.cv_url IS NOT NULL AND NEW.cv_url <> '' AND
   (TG_OP = 'INSERT' OR NEW.cv_url IS DISTINCT FROM OLD.cv_url) AND
   NOT public.owns_cv_object(NEW.user_id, NEW.cv_url) THEN
   RAISE EXCEPTION 'CV must reference your own uploaded object' USING ERRCODE = '42501';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER protect_cv_path BEFORE INSERT OR UPDATE ON public.seeker_profiles
 FOR EACH ROW EXECUTE FUNCTION public.protect_cv_path();
REVOKE ALL ON FUNCTION public.protect_company_fields(), public.protect_listing_fields(),
 public.protect_user_billing(), public.protect_cv_path() FROM PUBLIC, anon, authenticated;
COMMIT;
