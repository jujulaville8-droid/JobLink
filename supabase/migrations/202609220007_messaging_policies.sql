BEGIN;
-- Break the legacy participant-policy recursion without exposing other conversations.
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=p_conversation_id AND user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
DROP POLICY IF EXISTS "Users can view co-participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "cp_select_co_participants" ON public.conversation_participants;
CREATE POLICY participant_membership ON public.conversation_participants FOR SELECT TO authenticated
 USING(public.is_conversation_member(conversation_id));
DROP POLICY IF EXISTS cp_insert ON public.conversation_participants;
DROP POLICY IF EXISTS conv_insert ON public.conversations;
REVOKE INSERT, UPDATE ON public.conversation_participants FROM PUBLIC, anon, authenticated;
GRANT UPDATE(last_read_at,is_archived,is_blocked) ON public.conversation_participants TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM PUBLIC, anon, authenticated;

-- Dialogue/rejection gating also applies to direct database writes.
CREATE OR REPLACE FUNCTION public.can_send_message(p_conversation_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.conversation_participants cp
   JOIN public.conversations c ON c.id=cp.conversation_id
   LEFT JOIN public.applications a ON a.id=c.application_id
   LEFT JOIN public.job_listings j ON j.id=a.job_id
   LEFT JOIN public.companies co ON co.id=j.company_id
   LEFT JOIN public.seeker_profiles sp ON sp.id=a.seeker_id
   WHERE cp.user_id=auth.uid() AND cp.conversation_id=p_conversation_id AND NOT cp.is_blocked
     AND (c.application_id IS NULL OR sp.user_id <> auth.uid() OR (a.status <> 'rejected' AND EXISTS(
       SELECT 1 FROM public.messages m WHERE m.conversation_id=c.id AND m.sender_id=co.user_id)))
 );
$$;
REVOKE ALL ON FUNCTION public.can_send_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_message(uuid) TO authenticated;
CREATE POLICY message_send_guard ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(sender_id=auth.uid() AND public.can_send_message(conversation_id));
ALTER FUNCTION public.update_conversation_last_message() SET search_path = pg_catalog, public;
ALTER FUNCTION public.unarchive_on_new_message() SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.update_conversation_last_message(),public.unarchive_on_new_message() FROM PUBLIC,anon,authenticated;

-- This existing policy helper must not reveal relationships for an arbitrary employer.
CREATE OR REPLACE FUNCTION public.is_employer_of_applicant(p_seeker_id uuid,p_employer_uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT p_employer_uid=auth.uid() AND EXISTS (
   SELECT 1 FROM public.applications a JOIN public.job_listings j ON a.job_id=j.id
   LEFT JOIN public.companies c ON j.company_id=c.id WHERE a.seeker_id=p_seeker_id AND c.user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_employer_of_applicant(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_employer_of_applicant(uuid,uuid) TO authenticated;
COMMIT;
