-- Apply before deploying the Phase 2 posting flow. Existing RLS keeps drafts owner-only.
ALTER TYPE public.job_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TABLE public.job_listings
  ADD COLUMN IF NOT EXISTS benefits text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS draft_data jsonb;
-- draft_data stores incomplete form values, step and location arrangement.
-- Preserve all moderation protections while allowing private draft inserts.
CREATE OR REPLACE FUNCTION public.enforce_listing_moderation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  material_edit boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text <> 'draft' THEN
      NEW.status := 'pending_approval';
    END IF;
    NEW.is_featured := false;
    NEW.posted_by_admin := false;
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    RAISE EXCEPTION 'Featured placement is managed by the server';
  END IF;

  IF NEW.posted_by_admin IS DISTINCT FROM OLD.posted_by_admin THEN
    RAISE EXCEPTION 'posted_by_admin is managed by the server';
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'A listing cannot be moved to another company';
  END IF;

  -- Employers may close a listing, or resubmit a closed one for review.
  -- They may not promote anything to active themselves.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'closed' THEN
      RETURN NEW;
    ELSIF NEW.status = 'pending_approval' THEN
      NULL; -- allowed: voluntarily pulling a listing back for re-review
    ELSE
      RAISE EXCEPTION 'Listing approval is managed by the server';
    END IF;
  END IF;

  material_edit :=
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.location IS DISTINCT FROM OLD.location;

  IF material_edit AND OLD.status = 'active' THEN
    NEW.status := 'pending_approval';
  END IF;

  RETURN NEW;
END;
$$;

