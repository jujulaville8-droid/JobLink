-- job_listings.salary_type: the pay period the salary_min/salary_max figures are
-- quoted in. The post-job form has always collected it ("Hourly", "Weekly", ...)
-- but had nowhere to store it, so an employer who typed 25 and picked Hourly got
-- a listing that read "EC$25 /mo" to job seekers. Also feeds the Google
-- JobPosting baseSalary.unitText at src/app/jobs/[id]/page.tsx.
--
-- NULL means "period not recorded", which is every listing created before this
-- migration. The UI falls back to no period rather than guessing a month.
-- Idempotent so it can be re-run.

ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS salary_type TEXT;

ALTER TABLE public.job_listings DROP CONSTRAINT IF EXISTS job_listings_salary_type_check;
ALTER TABLE public.job_listings ADD CONSTRAINT job_listings_salary_type_check
  CHECK (salary_type IS NULL OR salary_type IN ('hourly', 'weekly', 'biweekly', 'monthly', 'annually'));
