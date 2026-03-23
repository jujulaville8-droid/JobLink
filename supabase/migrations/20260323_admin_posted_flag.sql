-- Add flag to track jobs posted by admin on behalf of a company
ALTER TABLE public.job_listings
  ADD COLUMN IF NOT EXISTS posted_by_admin boolean DEFAULT false;
