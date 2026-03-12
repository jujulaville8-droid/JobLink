-- Fix: Scope company-logos uploads to the user's own folder
-- Previously any authenticated user could upload to any path in the bucket

DROP POLICY IF EXISTS "Employers can upload company logos" ON storage.objects;

CREATE POLICY "Employers can upload company logos" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'company-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
