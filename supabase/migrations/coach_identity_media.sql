-- ============================================================
-- Coach identity media (COACH_IDENTITY_PLAN.md, Phase 1).
--
-- Ladder's product surface is the coach's photograph; ours has nowhere
-- to put one. Two columns and a bucket:
--
--   trainers.cover_url  the coach's hero photo (them coaching, their
--                       space) — distinct from avatar_url, the 34pt
--                       face used in chat rows.
--   plans.cover_url     a pass's own card image, chosen per program.
--
-- Bucket 'coach-media' is public-read like avatars, but writes are
-- OWNER-SCOPED BY PATH: the object key must start with the uploader's
-- auth uid. The class buckets let any signed-in user write anywhere,
-- which means any athlete could overwrite any coach's cover. Not here.
--
-- Re-runnable.
-- ============================================================

ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS cover_url text;
ALTER TABLE public.plans    ADD COLUMN IF NOT EXISTS cover_url text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('coach-media', 'coach-media', true, 15728640,  -- 15 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Coach media is publicly readable" ON storage.objects;
CREATE POLICY "Coach media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'coach-media');

DROP POLICY IF EXISTS "Coaches write their own media path" ON storage.objects;
CREATE POLICY "Coaches write their own media path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'coach-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Coaches update their own media path" ON storage.objects;
CREATE POLICY "Coaches update their own media path"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'coach-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Coaches delete their own media path" ON storage.objects;
CREATE POLICY "Coaches delete their own media path"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'coach-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
