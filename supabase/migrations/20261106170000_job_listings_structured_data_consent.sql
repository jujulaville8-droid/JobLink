-- job_listings.structured_data_consent: the employer who posted a listing
-- ticked the consent checkbox on the post-job form, agreeing to JobLink
-- also publishing the posting's benefits and the company profile
-- description in the JobPosting structured data on the listing page, on
-- top of the standard posting details published for every listing.
-- structured_data_consent_at records when consent was given;
-- it is cleared when consent is withdrawn.
--
-- The widened fields are emitted only with permission recorded for the
-- listing: form consent for employer posted listings, or a recorded
-- employer approval in src/lib/seo/employerApproved.ts standing in for
-- form consent on admin posted listings, which never pass through the
-- posting form (see src/lib/seo/jobposting-consent.ts).
--
-- FALSE means "no consent recorded", which is every listing created before
-- this migration and every employer who leaves the checkbox unticked.
-- Idempotent so it can be re-run.

ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS structured_data_consent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.job_listings ADD COLUMN IF NOT EXISTS structured_data_consent_at TIMESTAMPTZ;
