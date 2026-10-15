-- Optional application deadline set by admins on the post-job / edit-job forms.
-- Date-only: the listing stays open through this Antigua calendar date and is
-- treated as closed (no longer available, noindex, no JobPosting markup, no
-- applications or alerts) once it has passed. Status is not changed by this.
ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS closes_after DATE;

-- Partial index for the public "still open" filter.
CREATE INDEX IF NOT EXISTS job_listings_closes_after_idx
  ON public.job_listings (closes_after)
  WHERE closes_after IS NOT NULL;

-- updated_at (sitemap lastmod) also moves when the deadline changes.
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
    OR NEW.closes_after IS DISTINCT FROM OLD.closes_after
  THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;
