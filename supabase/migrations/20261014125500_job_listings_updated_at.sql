-- job_listings.updated_at: authoritative content-modification time used for
-- sitemap <lastmod>. Bumped only when public listing content or status changes.
-- Already applied in production on 2026-10-14; idempotent so it can be re-run.

ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE public.job_listings SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE public.job_listings ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.job_listings ALTER COLUMN updated_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_job_listing_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.location IS DISTINCT FROM OLD.location
    OR NEW.job_type IS DISTINCT FROM OLD.job_type
    OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS job_listings_set_updated_at ON public.job_listings;
CREATE TRIGGER job_listings_set_updated_at
  BEFORE UPDATE ON public.job_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_job_listing_updated_at();
