-- Historical migration ID retained. The destructive SQL has moved to
-- supabase/reset/legacy_fresh_schema.sql and MUST NOT run during deployment.
-- Existing databases must preserve their recorded migration history.
-- See docs/deployment.md for restoration and isolated test bootstrap instructions.
DO $$ BEGIN
 RAISE EXCEPTION 'Legacy reset migration blocked. Reconcile migration history with the restored database; do not reset production.';
END $$;
