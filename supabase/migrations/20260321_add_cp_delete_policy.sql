-- Add missing DELETE policy on conversation_participants
-- Without this, RLS silently blocks participant row deletion,
-- so "delete conversation" does nothing.

CREATE POLICY "cp_delete_own"
  ON public.conversation_participants FOR DELETE
  USING (user_id = auth.uid());
