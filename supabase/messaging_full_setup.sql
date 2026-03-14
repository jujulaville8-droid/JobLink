-- =====================================================================
-- JOBLINK MESSAGING - COMPLETE SETUP
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Safe to run multiple times - uses IF NOT EXISTS throughout.
-- =====================================================================

-- ═══════════════════════════════════════════════════════════════════════
-- PART 1: CORE MESSAGING TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- Conversations (1:1 with applications)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(application_id)
);

-- Conversation Participants
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add is_archived column (safe if already exists)
ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 2: INDEXES
-- ═══════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_conv_participants_user_id
  ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv_user
  ON public.conversation_participants(conversation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conv_participants_archived
  ON public.conversation_participants(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at
  ON public.conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_application_id
  ON public.conversations(application_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc
  ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_asc
  ON public.messages(conversation_id, created_at ASC);

-- ═══════════════════════════════════════════════════════════════════════
-- PART 3: RLS POLICIES FOR CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first to avoid "already exists" errors
DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can insert conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can view all conversations" ON public.conversations;

CREATE POLICY "Participants can view conversations"
  ON public.conversations FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  ));

CREATE POLICY "Participants can update conversations"
  ON public.conversations FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = conversations.id AND cp.user_id = auth.uid()
  ));

CREATE POLICY "Authenticated users can insert conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can view all conversations"
  ON public.conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- conversation_participants policies
DROP POLICY IF EXISTS "Users can view own participation" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view co-participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Authenticated users can insert participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update own participation" ON public.conversation_participants;

CREATE POLICY "Users can view own participation"
  ON public.conversation_participants FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view co-participants"
  ON public.conversation_participants FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = conversation_participants.conversation_id
      AND cp2.user_id = auth.uid()
  ));

CREATE POLICY "Authenticated users can insert participants"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update own participation"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

-- messages policies
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;

CREATE POLICY "Participants can view messages"
  ON public.messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id = messages.conversation_id AND cp.user_id = auth.uid()
  ));

CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
        AND cp.is_blocked = false
    )
  );

CREATE POLICY "Admins can view all messages"
  ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════
-- PART 4: TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════

-- Denormalize last message onto conversations
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_text = LEFT(NEW.body, 150),
    last_message_at = NEW.created_at,
    last_message_sender_id = NEW.sender_id
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_message ON public.messages;
CREATE TRIGGER on_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message();

-- Un-archive conversation when new message arrives
CREATE OR REPLACE FUNCTION public.unarchive_on_new_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversation_participants
  SET is_archived = FALSE
  WHERE conversation_id = NEW.conversation_id
    AND user_id != NEW.sender_id
    AND is_archived = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_message_unarchive ON public.messages;
CREATE TRIGGER on_new_message_unarchive
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.unarchive_on_new_message();

-- ═══════════════════════════════════════════════════════════════════════
-- PART 5: ENHANCEMENT TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- User Messaging Settings
CREATE TABLE IF NOT EXISTS public.user_messaging_settings (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  sms_notifications BOOLEAN NOT NULL DEFAULT FALSE,
  show_online_status BOOLEAN NOT NULL DEFAULT TRUE,
  show_read_receipts BOOLEAN NOT NULL DEFAULT TRUE,
  notification_cooldown_minutes INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_messaging_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own messaging settings" ON public.user_messaging_settings;
DROP POLICY IF EXISTS "Users can insert own messaging settings" ON public.user_messaging_settings;
DROP POLICY IF EXISTS "Users can update own messaging settings" ON public.user_messaging_settings;

CREATE POLICY "Users can view own messaging settings"
  ON public.user_messaging_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own messaging settings"
  ON public.user_messaging_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own messaging settings"
  ON public.user_messaging_settings FOR UPDATE
  USING (user_id = auth.uid());

-- User Presence / Last Seen
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_online BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users can upsert own presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users can update own presence" ON public.user_presence;

CREATE POLICY "Authenticated users can view presence"
  ON public.user_presence FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can upsert own presence"
  ON public.user_presence FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own presence"
  ON public.user_presence FOR UPDATE
  USING (user_id = auth.uid());

-- Notification Log
CREATE TABLE IF NOT EXISTS public.notification_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_conv
  ON public.notification_log(user_id, conversation_id, created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_log;
DROP POLICY IF EXISTS "System can insert notifications" ON public.notification_log;

CREATE POLICY "Users can view own notifications"
  ON public.notification_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON public.notification_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Message Templates
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role TEXT NOT NULL CHECK (role IN ('employer', 'seeker')),
  label TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view active templates" ON public.message_templates;

CREATE POLICY "Authenticated users can view active templates"
  ON public.message_templates FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = TRUE);

-- Seed templates (only if table is empty)
INSERT INTO public.message_templates (role, label, body, sort_order)
SELECT * FROM (VALUES
  ('employer', 'Thanks for applying', 'Thank you for applying to this position. We have received your application and will review it shortly.', 1),
  ('employer', 'Schedule an interview', 'We were impressed by your application and would like to schedule an interview. Are you available this week? Please let us know your preferred times.', 2),
  ('employer', 'Request more information', 'Thank you for your interest in this position. Could you please provide some additional information to help us with our review?', 3),
  ('employer', 'Still interested?', 'We wanted to follow up on your application. Are you still interested in this position? We would love to hear from you.', 4),
  ('employer', 'Moving forward with others', 'Thank you for your interest and the time you invested in applying. After careful consideration, we have decided to move forward with other candidates. We wish you the best in your job search.', 5),
  ('employer', 'Position filled', 'We wanted to let you know that this position has been filled. Thank you for your interest, and we encourage you to apply for future openings.', 6),
  ('seeker', 'Interested in position', 'I am very interested in this position and believe my skills and experience would be a great fit. I would welcome the opportunity to discuss this further.', 1),
  ('seeker', 'Available for interview', 'Thank you for considering my application. I am available for an interview at your convenience. Please let me know the preferred date and time.', 2),
  ('seeker', 'Following up', 'I wanted to follow up on my application. I remain very interested in this opportunity and would appreciate any update on the status of my application.', 3),
  ('seeker', 'Thank you for the update', 'Thank you for the update. I appreciate you keeping me informed about the status of my application.', 4),
  ('seeker', 'Sending additional info', 'As requested, please find the additional information below. Please let me know if you need anything else.', 5)
) AS t(role, label, body, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.message_templates LIMIT 1);

-- Conversation Reports
CREATE TABLE IF NOT EXISTS public.conversation_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) > 0 AND char_length(reason) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, reported_by)
);

ALTER TABLE public.conversation_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can report conversations they participate in" ON public.conversation_reports;
DROP POLICY IF EXISTS "Users can view own reports" ON public.conversation_reports;
DROP POLICY IF EXISTS "Admins can view all reports" ON public.conversation_reports;
DROP POLICY IF EXISTS "Admins can update reports" ON public.conversation_reports;

CREATE POLICY "Users can report conversations they participate in"
  ON public.conversation_reports FOR INSERT
  WITH CHECK (
    reported_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_reports.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own reports"
  ON public.conversation_reports FOR SELECT
  USING (reported_by = auth.uid());

CREATE POLICY "Admins can view all reports"
  ON public.conversation_reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update reports"
  ON public.conversation_reports FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════
-- PART 6: RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Optimized inbox query
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
    ) AS unread_count,
    cp.is_archived,
    cp_other.user_id AS other_user_id,
    COALESCE(
      sp.first_name || ' ' || sp.last_name,
      co.company_name,
      'Unknown'
    ) AS other_display_name,
    COALESCE(sp.avatar_url, co.logo_url) AS other_avatar_url,
    COALESCE(jl.title, 'Unknown Position') AS job_title,
    COALESCE(co_job.company_name, 'Unknown Company') AS company_name,
    COALESCE(a.status, 'applied') AS application_status
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

-- Single conversation metadata
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
      sp.first_name || ' ' || sp.last_name,
      co.company_name,
      'Unknown'
    ) AS other_display_name,
    COALESCE(sp.avatar_url, co.logo_url) AS other_avatar_url,
    COALESCE(
      CASE WHEN ums.show_online_status = TRUE OR ums.show_online_status IS NULL
        THEN up.is_online ELSE FALSE END,
      FALSE
    ) AS other_is_online,
    CASE WHEN ums.show_online_status = TRUE OR ums.show_online_status IS NULL
      THEN up.last_seen_at ELSE NULL END AS other_last_seen_at,
    COALESCE(jl.title, 'Unknown Position') AS job_title,
    COALESCE(co_job.company_name, 'Unknown Company') AS company_name,
    COALESCE(a.status, 'applied') AS application_status,
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

-- Total unread count (excludes archived)
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
  ) sub;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Presence heartbeat
CREATE OR REPLACE FUNCTION public.upsert_presence(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.user_presence (user_id, last_seen_at, is_online, updated_at)
  VALUES (p_user_id, NOW(), TRUE, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET last_seen_at = NOW(), is_online = TRUE, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark stale users offline
CREATE OR REPLACE FUNCTION public.mark_stale_users_offline()
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_presence
  SET is_online = FALSE, updated_at = NOW()
  WHERE is_online = TRUE
    AND last_seen_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════
-- PART 7: REALTIME
-- ═══════════════════════════════════════════════════════════════════════

-- Safely add tables to realtime publication
DO $$
BEGIN
  -- messages
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  -- conversation_participants
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
  END IF;

  -- user_presence
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- DONE! Messaging system is fully set up.
-- ═══════════════════════════════════════════════════════════════════════
