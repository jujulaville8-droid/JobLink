-- ============================================================================
-- Security hardening 3b — production addendum to 20261104_security_hardening_3
-- ============================================================================
-- Written at apply time (2026-11-04) after the pre-flight checks against
-- production (hfcfuvbyqxkvnenfykex) showed two drifts between the migrations
-- in this repo and the live database:
--
-- 1. Production's messaging tables carry a THIRD policy naming line (short
--    names) that migration 3 does not drop:
--      conversation_participants.cp_update  (UPDATE, USING user_id = auth.uid(),
--                                            NO WITH CHECK — the C3 hijack policy)
--      conversations.conv_insert            (INSERT, WITH CHECK auth.uid() IS NOT NULL)
--      conversations.conv_update            (UPDATE, USING participant, no WITH CHECK — M6)
--    Migration 3's table-level REVOKE on conversation_participants blunts
--    cp_update, but all three are dropped here so the lockdown is complete
--    and the surviving policy set matches the reviewed design.
--
-- 2. Production's applications table has four columns the repo migrations do
--    not know about (employer_forward_status, employer_forward_attempted_at,
--    employer_forwarded_at, employer_delivery_path — the employer forwarding
--    pipeline, written server-side). Migration 3's guard_application_writes
--    freezes columns by explicit list, so those four were left client
--    writable. The function is recreated here with the full production
--    column list (minus status) frozen. Forwarding writes run as
--    service_role and are exempt, as before.
--
-- Apply AFTER 20261104_security_hardening_3.sql.
-- ============================================================================

DROP POLICY IF EXISTS "cp_update" ON public.conversation_participants;
DROP POLICY IF EXISTS "conv_insert" ON public.conversations;
DROP POLICY IF EXISTS "conv_update" ON public.conversations;

CREATE OR REPLACE FUNCTION public.guard_application_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.status := 'applied';
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.job_id IS DISTINCT FROM OLD.job_id
        OR NEW.seeker_id IS DISTINCT FROM OLD.seeker_id
        OR NEW.cover_letter_url IS DISTINCT FROM OLD.cover_letter_url
        OR NEW.cover_letter_text IS DISTINCT FROM OLD.cover_letter_text
        OR NEW.applied_at IS DISTINCT FROM OLD.applied_at
        OR NEW.employer_forward_status IS DISTINCT FROM OLD.employer_forward_status
        OR NEW.employer_forward_attempted_at IS DISTINCT FROM OLD.employer_forward_attempted_at
        OR NEW.employer_forwarded_at IS DISTINCT FROM OLD.employer_forwarded_at
        OR NEW.employer_delivery_path IS DISTINCT FROM OLD.employer_delivery_path
      THEN
        RAISE EXCEPTION 'Only the status of an application may be changed';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
