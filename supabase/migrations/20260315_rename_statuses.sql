-- Migration: Rename application statuses
-- shortlisted -> interview, hired -> hold

-- Step 1: Add new enum values
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'interview';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'hold';

-- Step 2: Migrate existing data (must be in a separate transaction from ADD VALUE in some PG versions)
-- Run this after the above completes:
UPDATE applications SET status = 'interview' WHERE status = 'shortlisted';
UPDATE applications SET status = 'hold' WHERE status = 'hired';

-- Note: PostgreSQL doesn't support removing enum values directly.
-- The old values ('shortlisted', 'hired') will remain in the enum type but won't be used.
-- This is safe — no data will reference them after the migration.
