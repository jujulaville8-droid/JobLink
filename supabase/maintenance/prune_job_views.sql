-- Run daily using a database maintenance identity (e.g. postgres), not the
-- application service role. Repeat batches until no rows are deleted.
-- This file does not schedule or execute a live database operation.
WITH expired AS (
  SELECT event_id FROM public.job_views
  WHERE viewed_at < now() - interval '90 days'
  ORDER BY viewed_at LIMIT 10000
  FOR UPDATE SKIP LOCKED
)
DELETE FROM public.job_views v USING expired e WHERE v.event_id = e.event_id;

-- Rotating abuse-control buckets are unusable after expiry; remove them too.
WITH expired AS (
  SELECT bucket FROM public.rate_limits
  WHERE bucket LIKE 'job-view:%' AND window_started_at < now() - interval '1 day'
  ORDER BY window_started_at LIMIT 10000
  FOR UPDATE SKIP LOCKED
)
DELETE FROM public.rate_limits r USING expired e WHERE r.bucket = e.bucket;
