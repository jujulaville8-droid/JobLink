-- Employers may post without a subscription-based listing cap.
-- Keep the function and subscription schema dormant; other guards stay attached.
DROP TRIGGER IF EXISTS enforce_free_listing_cap ON public.job_listings;
