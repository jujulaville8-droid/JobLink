BEGIN;
-- Fix: Prioritize company name over seeker name when company exists
--
-- The bug: When a seeker views a conversation, the employer's personal name
-- from seeker_profiles shows instead of their company name, because the
-- COALESCE prioritizes seeker_profiles over companies.
--
-- The fix: Always prioritize company_name first. If the user has a company,
-- show that. Otherwise fall back to seeker first/last name.

-- ═══════════════════════════════════════════════════════════════════════
-- Fix get_inbox
-- ═══════════════════════════════════════════════════════════════════════


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
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Identity mismatch' USING ERRCODE = '42501';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public STABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- Fix get_conversation_meta
-- ═══════════════════════════════════════════════════════════════════════


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
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Identity mismatch' USING ERRCODE = '42501';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

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
    WHERE cp.user_id = auth.uid() AND p_user_id = auth.uid()
      AND cp.is_archived = FALSE
  ) sub;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public STABLE;


CREATE OR REPLACE FUNCTION public.upsert_presence(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Identity mismatch' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.user_presence (user_id, last_seen_at, is_online, updated_at)
  VALUES (p_user_id, NOW(), TRUE, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen_at = NOW(), is_online = TRUE, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;


REVOKE ALL ON FUNCTION public.get_inbox(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.get_conversation_meta(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_meta(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_total_unread_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_total_unread_count(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.upsert_presence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_presence(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.mark_stale_users_offline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stale_users_offline() TO service_role;
ALTER FUNCTION public.mark_stale_users_offline() SET search_path = pg_catalog, public;
COMMIT;
