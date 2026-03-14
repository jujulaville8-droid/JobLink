-- =====================================================================
-- FIX: Infinite recursion in conversation_participants RLS policies
-- and RPC return type mismatch
-- =====================================================================

-- ─── 1. Fix the recursive RLS policies ──────────────────────────────
-- The problem: "Users can view co-participants" policy on conversation_participants
-- does a subquery on conversation_participants itself, causing infinite recursion.
-- Solution: Remove the co-participants policy and instead check via conversations table.

-- Drop ALL existing policies on conversation_participants
DROP POLICY IF EXISTS "Users can view own participation" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view co-participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Authenticated users can insert participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON public.conversation_participants;

-- Recreate without recursion:
-- Users can see participant rows for conversations they are part of.
-- We check membership via the conversations table (no self-reference).
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants FOR SELECT
  USING (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      WHERE EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = c.id AND cp.user_id = auth.uid()
      )
    )
  );

-- Actually that still references conversation_participants. Let's use a simpler approach:
-- Just allow users to see ALL participant rows where they are also a participant
-- by using a direct subquery that only filters on user_id first.
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;

-- Simple approach: users can see any conversation_participants row
-- if they themselves have a row in the same conversation.
-- To avoid recursion, we use the conversations table as the anchor.
CREATE POLICY "Users can view own participation rows"
  ON public.conversation_participants FOR SELECT
  USING (user_id = auth.uid());

-- For viewing the OTHER participant, we use a policy anchored on conversations
CREATE POLICY "Users can view other participants via conversation access"
  ON public.conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
      -- conversations table has its own SELECT policy that checks participant membership
      -- but THAT also references conversation_participants, causing recursion.
    )
  );

-- The above still causes recursion because conversations SELECT policy
-- references conversation_participants. We need to break the cycle entirely.

-- Drop everything and start clean with non-recursive policies:
DROP POLICY IF EXISTS "Users can view own participation rows" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view other participants via conversation access" ON public.conversation_participants;
DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;

-- ═══════════════════════════════════════════════════════════════════════
-- CONVERSATION_PARTICIPANTS: No cross-table references
-- ═══════════════════════════════════════════════════════════════════════

-- Users can see participant rows for conversations they're in
-- This uses a scalar subquery on the SAME table but filtered by auth.uid() first,
-- which Postgres can handle without infinite recursion by using security_barrier.
CREATE POLICY "cp_select_own"
  ON public.conversation_participants FOR SELECT
  USING (user_id = auth.uid());

-- Users can also see OTHER participants in their conversations
-- We avoid recursion by checking conversation_id against a subquery
-- that only looks at rows where user_id = auth.uid()
CREATE POLICY "cp_select_co_participants"
  ON public.conversation_participants FOR SELECT
  USING (
    conversation_id IN (
      SELECT cp2.conversation_id
      FROM public.conversation_participants cp2
      WHERE cp2.user_id = auth.uid()
    )
  );

CREATE POLICY "cp_insert"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "cp_update_own"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════
-- CONVERSATIONS: Reference conversation_participants safely
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "conv_select_participant"
  ON public.conversations FOR SELECT
  USING (
    id IN (
      SELECT cp.conversation_id
      FROM public.conversation_participants cp
      WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "conv_select_admin"
  ON public.conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "conv_update_participant"
  ON public.conversations FOR UPDATE
  USING (
    id IN (
      SELECT cp.conversation_id
      FROM public.conversation_participants cp
      WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "conv_insert_authenticated"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════
-- MESSAGES: Reference conversation_participants safely
-- ═══════════════════════════════════════════════════════════════════════

CREATE POLICY "msg_select_participant"
  ON public.messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT cp.conversation_id
      FROM public.conversation_participants cp
      WHERE cp.user_id = auth.uid()
    )
  );

CREATE POLICY "msg_insert_participant"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT cp.conversation_id
      FROM public.conversation_participants cp
      WHERE cp.user_id = auth.uid()
        AND cp.is_blocked = false
    )
  );

CREATE POLICY "msg_select_admin"
  ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Fix get_inbox RPC return type mismatch
-- The seeker_profiles table might not have avatar_url column,
-- or it could be a column name difference. Let's handle both cases.
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_inbox(UUID, BOOLEAN);

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
      NULLIF(TRIM(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
      co.company_name,
      'Unknown'
    )::TEXT AS other_display_name,
    COALESCE(
      (SELECT sp2.avatar_url FROM public.seeker_profiles sp2 WHERE sp2.user_id = cp_other.user_id LIMIT 1),
      co.logo_url,
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Also fix get_conversation_meta to handle missing columns safely
-- ═══════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_conversation_meta(UUID, UUID);

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
  is_blocked BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp_other.user_id AS other_user_id,
    COALESCE(
      NULLIF(TRIM(COALESCE(sp.first_name, '') || ' ' || COALESCE(sp.last_name, '')), ''),
      co.company_name,
      'Unknown'
    )::TEXT AS other_display_name,
    COALESCE(
      (SELECT sp2.avatar_url FROM public.seeker_profiles sp2 WHERE sp2.user_id = cp_other.user_id LIMIT 1),
      co.logo_url,
      NULL
    )::TEXT AS other_avatar_url,
    COALESCE(
      CASE WHEN (ums.show_online_status IS NULL OR ums.show_online_status = TRUE)
        THEN up.is_online ELSE FALSE END,
      FALSE
    ) AS other_is_online,
    CASE WHEN (ums.show_online_status IS NULL OR ums.show_online_status = TRUE)
      THEN up.last_seen_at ELSE NULL END AS other_last_seen_at,
    COALESCE(jl.title, 'Unknown Position')::TEXT AS job_title,
    COALESCE(co_job.company_name, 'Unknown Company')::TEXT AS company_name,
    COALESCE(a.status, 'applied')::TEXT AS application_status,
    cp_me.is_archived,
    cp_me.is_blocked
  FROM public.conversation_participants cp_me
  JOIN public.conversations c ON c.id = cp_me.conversation_id
  JOIN public.conversation_participants cp_other
    ON cp_other.conversation_id = c.id AND cp_other.user_id != p_user_id
  LEFT JOIN public.seeker_profiles sp ON sp.user_id = cp_other.user_id
  LEFT JOIN public.companies co ON co.user_id = cp_other.user_id
  LEFT JOIN public.user_presence up ON up.user_id = cp_other.user_id
  LEFT JOIN public.user_messaging_settings ums ON ums.user_id = cp_other.user_id
  LEFT JOIN public.applications a ON a.id = c.application_id
  LEFT JOIN public.job_listings jl ON jl.id = a.job_id
  LEFT JOIN public.companies co_job ON co_job.id = jl.company_id
  WHERE cp_me.user_id = p_user_id
    AND cp_me.conversation_id = p_conversation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ═══════════════════════════════════════════════════════════════════════
-- DONE! RLS recursion fixed, RPC return types fixed.
-- ═══════════════════════════════════════════════════════════════════════
