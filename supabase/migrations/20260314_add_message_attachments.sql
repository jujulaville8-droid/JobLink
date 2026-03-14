-- Add attachment support to messages table
ALTER TABLE public.messages
  ADD COLUMN attachment_url TEXT DEFAULT NULL,
  ADD COLUMN attachment_name TEXT DEFAULT NULL;

-- Update the body check constraint to allow empty body when attachment is present
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_body_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_body_or_attachment_check
  CHECK (
    (char_length(body) > 0 AND char_length(body) <= 5000)
    OR attachment_url IS NOT NULL
  );
