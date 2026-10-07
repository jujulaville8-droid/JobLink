-- Employer notification routing is set by authenticated admin server routes.
-- Some existing installations already have this column; do not backfill,
-- normalize, or overwrite any stored contact when reconciling the schema.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Separate from the existing billing/verification protection so ordinary
-- self-serve company profile and logo updates keep their existing behavior.
-- The actual Postgres execution role is used, not user-editable request claims.
CREATE OR REPLACE FUNCTION public.protect_company_contact_email()
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
    IF NEW.contact_email IS NOT NULL THEN
      RAISE EXCEPTION 'Company notification contact is managed by the server'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.contact_email IS DISTINCT FROM OLD.contact_email THEN
    RAISE EXCEPTION 'Company notification contact is managed by the server'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_company_contact_email ON public.companies;
CREATE TRIGGER protect_company_contact_email
  BEFORE INSERT OR UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_company_contact_email();

-- Validation remains in the admin application parser. A format CHECK, even
-- NOT VALID, would reject unrelated updates to malformed legacy contacts.
-- Those values are retained, and the notification recipient parser rejects
-- invalid or placeholder addresses at delivery time.
