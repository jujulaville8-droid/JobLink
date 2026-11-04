-- ============================================================================
-- Security hardening, round 3
-- ============================================================================
-- Rounds 1 and 2 (20260601, 20260925) locked down users, companies and
-- job_listings. This migration closes signup role escalation, the stale admin
-- test on the messaging policies, cross-user access through the inbox and
-- presence RPCs, direct client writes to conversations, forged cv_url paths,
-- non-status edits to applications, and client writes to notification_log.
--
-- Everything here is idempotent and safe to re-run.
-- ============================================================================

BEGIN;


-- ============================================================================
-- C1a. handle_new_user: role allowlist
-- ============================================================================
-- Previously: the role was cast straight from raw_user_meta_data, which the
-- caller controls at signup, so signing up with {"role": "admin"} created an
-- admin-role user. Only 'employer' is honoured now; everything else is 'seeker'.
-- The on_auth_user_created trigger is unchanged and still calls this function.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN NEW.raw_user_meta_data->>'role' = 'employer' THEN 'employer'
      ELSE 'seeker'
    END::user_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================================
-- C1b. Messaging admin policies use is_admin_user()
-- ============================================================================
-- Previously: these tested users.role = 'admin', which is client-influenced and
-- changes on role switch. is_admin is the server-managed flag, and is_admin_user()
-- reads it without RLS recursion. Same names, tables, commands and scope.

DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;
CREATE POLICY "Admins can view all conversations"
  ON public.conversations FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "conv_select_admin" ON public.conversations;
CREATE POLICY "conv_select_admin"
  ON public.conversations FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages"
  ON public.messages FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "msg_select_admin" ON public.messages;
CREATE POLICY "msg_select_admin"
  ON public.messages FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can view all reports" ON public.conversation_reports;
CREATE POLICY "Admins can view all reports"
  ON public.conversation_reports FOR SELECT
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "Admins can update reports" ON public.conversation_reports;
CREATE POLICY "Admins can update reports"
  ON public.conversation_reports FOR UPDATE
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());


-- ============================================================================
-- C2. Inbox and presence RPC lockdown
-- ============================================================================
-- Previously: these SECURITY DEFINER functions trusted p_user_id, so any caller
-- could read another user's inbox or forge their presence. A signed-in caller
-- may now only act as themselves. auth.uid() is NULL for service-role and server
-- calls, which keep working for any p_user_id. Bodies are otherwise unchanged
-- from 20260322_fix_display_name_priority.sql and
-- 20260315_messaging_enhancements.sql.

CREATE OR REPLACE FUNCTION public.get_inbox(
  p_user_id UUID,
  p_archived BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  conversation_id UUID,
  application_id UUID,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_sender_id UUID,
  conversation_created_at TIMESTAMPTZ,
  unread_count BIGINT,
  is_archived BOOLEAN,
  other_user_id UUID,
  other_display_name TEXT,
  other_avatar_url TEXT,
  job_title TEXT,
  company_name TEXT,
  application_status TEXT
) AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id AS conversation_id,
    c.application_id,
    c.last_message_text,
    c.last_message_at,
    c.last_message_sender_id,
    c.created_at AS conversation_created_at,
    COALESCE(
      (SELECT COUNT(*)
       FROM public.messages m
       WHERE m.conversation_id = c.id
         AND m.created_at > cp.last_read_at
         AND m.sender_id != p_user_id
      ), 0
    )::BIGINT AS unread_count,
    cp.is_archived,
    cp_other.user_id AS other_user_id,
    COALESCE(
      co.company_name,
      NULLIF(TRIM(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
      'Unknown'
    )::TEXT AS other_display_name,
    COALESCE(
      co.logo_url,
      (SELECT sp2.avatar_url FROM public.seeker_profiles sp2 WHERE sp2.user_id = cp_other.user_id LIMIT 1),
      NULL
    )::TEXT AS other_avatar_url,
    COALESCE(jl.title, 'Unknown Position')::TEXT AS job_title,
    COALESCE(co_job.company_name, 'Unknown Company')::TEXT AS company_name,
    COALESCE(a.status, 'applied')::TEXT AS application_status
  FROM public.conversation_participants cp
  JOIN public.conversations c ON c.id = cp.conversation_id
  JOIN public.conversation_participants cp_other
    ON cp_other.conversation_id = c.id AND cp_other.user_id != p_user_id
  LEFT JOIN public.seeker_profiles sp ON sp.user_id = cp_other.user_id
  LEFT JOIN public.companies co ON co.user_id = cp_other.user_id
  LEFT JOIN public.applications a ON a.id = c.application_id
  LEFT JOIN public.job_listings jl ON jl.id = a.job_id
  LEFT JOIN public.companies co_job ON co_job.id = jl.company_id
  WHERE cp.user_id = p_user_id
    AND cp.is_archived = p_archived
    AND c.last_message_at IS NOT NULL
  ORDER BY c.last_message_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_conversation_meta(
  p_user_id UUID,
  p_conversation_id UUID
)
RETURNS TABLE (
  other_user_id UUID,
  other_display_name TEXT,
  other_avatar_url TEXT,
  other_is_online BOOLEAN,
  other_last_seen_at TIMESTAMPTZ,
  job_title TEXT,
  company_name TEXT,
  application_status TEXT,
  is_archived BOOLEAN,
  is_blocked BOOLEAN,
  dialogue_open BOOLEAN,
  seeker_user_id UUID
) AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    cp_other.user_id AS other_user_id,
    COALESCE(
      co.company_name,
      NULLIF(TRIM(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
      'Unknown'
    ) AS other_display_name,
    COALESCE(
      co.logo_url,
      sp.avatar_url
    ) AS other_avatar_url,
    COALESCE(
      CASE WHEN ums.show_online_status = TRUE OR ums.show_online_status IS NULL
        THEN up.is_online ELSE FALSE END,
      FALSE
    ) AS other_is_online,
    CASE WHEN ums.show_online_status = TRUE OR ums.show_online_status IS NULL
      THEN up.last_seen_at ELSE NULL END AS other_last_seen_at,
    COALESCE(jl.title, 'Unknown Position') AS job_title,
    COALESCE(co_job.company_name, 'Unknown Company') AS company_name,
    COALESCE(a.status::text, 'applied') AS application_status,
    cp_me.is_archived,
    cp_me.is_blocked,
    EXISTS(
      SELECT 1 FROM public.messages m
      WHERE m.conversation_id = p_conversation_id
        AND m.sender_id = co_job.user_id
    ) AS dialogue_open,
    sp_seeker.user_id AS seeker_user_id
  FROM public.conversation_participants cp_me
  JOIN public.conversations c ON c.id = cp_me.conversation_id
  JOIN public.conversation_participants cp_other
    ON cp_other.conversation_id = c.id AND cp_other.user_id != p_user_id
  LEFT JOIN public.seeker_profiles sp ON sp.user_id = cp_other.user_id
  LEFT JOIN public.companies co ON co.user_id = cp_other.user_id
  LEFT JOIN public.user_presence up ON up.user_id = cp_other.user_id
  LEFT JOIN public.user_messaging_settings ums ON ums.user_id = cp_other.user_id
  LEFT JOIN public.applications a ON a.id = c.application_id
  LEFT JOIN public.seeker_profiles sp_seeker ON sp_seeker.id = a.seeker_id
  LEFT JOIN public.job_listings jl ON jl.id = a.job_id
  LEFT JOIN public.companies co_job ON co_job.id = jl.company_id
  WHERE cp_me.user_id = p_user_id
    AND cp_me.conversation_id = p_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- SQL-language function: the guard is a predicate, so a mismatched caller gets
-- no rows from the subquery and the outer COALESCE returns 0.
CREATE OR REPLACE FUNCTION public.get_total_unread_count(p_user_id UUID)
RETURNS INTEGER AS $$
  SELECT COALESCE(SUM(msg_count)::INTEGER, 0)
  FROM (
    SELECT COUNT(*) AS msg_count
    FROM public.conversation_participants cp
    JOIN public.messages m
      ON m.conversation_id = cp.conversation_id
      AND m.created_at > cp.last_read_at
      AND m.sender_id != cp.user_id
    WHERE cp.user_id = p_user_id
      AND cp.is_archived = FALSE
      AND (auth.uid() IS NULL OR p_user_id = auth.uid())
  ) sub;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION public.upsert_presence(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN;
  END IF;

  INSERT INTO public.user_presence (user_id, last_seen_at, is_online, updated_at)
  VALUES (p_user_id, NOW(), TRUE, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen_at = NOW(), is_online = TRUE, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.mark_stale_users_offline()
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_presence
  SET is_online = FALSE, updated_at = NOW()
  WHERE is_online = TRUE
    AND last_seen_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_inbox(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox(UUID, BOOLEAN) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_conversation_meta(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_meta(UUID, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_total_unread_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_total_unread_count(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_presence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_presence(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.mark_stale_users_offline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stale_users_offline() TO service_role;


-- ============================================================================
-- C3+M6. Conversation write lockdown
-- ============================================================================
-- Conversations and participants are created by validated server routes using
-- the service role. Clients may only change their own read and archive state.
--
-- The policy and the column grants are a pair: the policy scopes rows to the
-- owner, and the column grants make conversation_id and is_blocked unwritable
-- by clients. The SECURITY DEFINER unarchive and last-message triggers are
-- unaffected. SELECT and DELETE policies and messages policies are untouched.

DROP POLICY IF EXISTS "Users can update own participation" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_update_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "Authenticated users can insert participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_insert" ON public.conversation_participants;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "conv_insert_authenticated" ON public.conversations;
DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "conv_update_participant" ON public.conversations;

REVOKE UPDATE ON public.conversation_participants FROM authenticated;
GRANT UPDATE (last_read_at, is_archived) ON public.conversation_participants TO authenticated;

DROP POLICY IF EXISTS "Users can update own participation flags" ON public.conversation_participants;
CREATE POLICY "Users can update own participation flags"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ============================================================================
-- H1. cv_url owner-prefix guard on seeker_profiles
-- ============================================================================
-- Previously: a seeker could point cv_url at another user's file, and
-- /api/cv-download would then sign that path with the service role.
--
-- A trigger rather than a table CHECK, so rows that already violate the rule do
-- not fail the migration. Empty string is allowed because it references no file
-- and the web profile form sends cv_url = '' when a seeker has no CV. On UPDATE
-- the guard fires only when cv_url itself is being set or changed, so a legacy
-- row (e.g. an old full-URL cv_url) cannot trap its owner out of unrelated
-- profile saves; setting any NEW value that violates the prefix rule is blocked
-- on both INSERT and UPDATE.

CREATE OR REPLACE FUNCTION public.guard_seeker_profile_cv_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NEW.cv_url IS NOT NULL
      AND NEW.cv_url <> ''
      AND (
        NEW.cv_url NOT LIKE (NEW.user_id::text || '/%')
        OR NEW.cv_url LIKE '%/../%'
        OR NEW.cv_url LIKE '%/..'
      )
      AND (TG_OP = 'INSERT' OR NEW.cv_url IS DISTINCT FROM OLD.cv_url)
    THEN
      RAISE EXCEPTION 'cv_url must reference a file in the profile owner''s folder';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_seeker_profile_cv_url ON public.seeker_profiles;
CREATE TRIGGER guard_seeker_profile_cv_url
  BEFORE INSERT OR UPDATE ON public.seeker_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_seeker_profile_cv_url();


-- ============================================================================
-- M2. Applications write guards
-- ============================================================================
-- Previously: "Seekers can insert applications" let a seeker choose their own
-- status, and "Employers can update application status" allowed an update of any
-- column. Non-service callers now always insert as 'applied' and may change only
-- status.
--
-- Frozen columns are every column other than status in the migrations. The table
-- has no created_at or updated_at column, so neither is referenced: naming one
-- would fail every client update with 'record "new" has no field'.

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
      THEN
        RAISE EXCEPTION 'Only the status of an application may be changed';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_application_writes ON public.applications;
CREATE TRIGGER guard_application_writes
  BEFORE INSERT OR UPDATE ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_application_writes();


-- ============================================================================
-- M5. notification_log becomes service-role only
-- ============================================================================
-- Previously: any signed-in user could insert a log row for any user and
-- conversation. Users can still read their own rows.

DROP POLICY IF EXISTS "System can insert notifications" ON public.notification_log;

COMMIT;
