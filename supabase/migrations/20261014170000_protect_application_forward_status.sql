-- Employer-forward tracking is written only by the server (service_role) after
-- it attempts to email the application to the employer. Employers and seekers
-- must not be able to set or alter it through the Data API. Modeled on
-- protect_company_contact_email: the actual Postgres execution role is used,
-- not user-editable request claims.
CREATE OR REPLACE FUNCTION public.protect_application_forward_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.employer_forward_status IS NOT NULL
      OR NEW.employer_forward_attempted_at IS NOT NULL
      OR NEW.employer_forwarded_at IS NOT NULL THEN
      RAISE EXCEPTION 'Application forward status is managed by the server'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.employer_forward_status IS DISTINCT FROM OLD.employer_forward_status
    OR NEW.employer_forward_attempted_at IS DISTINCT FROM OLD.employer_forward_attempted_at
    OR NEW.employer_forwarded_at IS DISTINCT FROM OLD.employer_forwarded_at THEN
    RAISE EXCEPTION 'Application forward status is managed by the server'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_application_forward_status ON public.applications;
CREATE TRIGGER protect_application_forward_status
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_application_forward_status();
