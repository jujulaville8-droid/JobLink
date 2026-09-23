-- Prevent authenticated clients from editing privileged public.users fields.
-- Legitimate changes are made by verified server routes using the service role.
CREATE OR REPLACE FUNCTION public.protect_user_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role NOT IN ('seeker', 'employer')
        OR NEW.email_verified = true
        OR NEW.is_banned = true
        OR NEW.is_admin = true
      THEN
        RAISE EXCEPTION 'Privileged user fields may only be changed by the server';
      END IF;
    ELSIF NEW.email IS DISTINCT FROM OLD.email
      OR NEW.role IS DISTINCT FROM OLD.role
      OR NEW.email_verified IS DISTINCT FROM OLD.email_verified
      OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
      OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
    THEN
      RAISE EXCEPTION 'Privileged user fields may only be changed by the server';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_privileged_fields ON public.users;
CREATE TRIGGER protect_user_privileged_fields
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_privileged_fields();

-- Conversation and participant rows are created by validated server routes.
-- Authenticated clients may still read their own threads and send messages as
-- participants, but they cannot manufacture arbitrary conversations.
DROP POLICY IF EXISTS "Authenticated users can insert conversations"
  ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can insert participants"
  ON public.conversation_participants;
