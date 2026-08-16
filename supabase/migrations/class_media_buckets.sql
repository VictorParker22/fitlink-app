-- ============================================================
-- Storage buckets for class media.
--
-- app/create-class.tsx has always uploaded to 'class-videos' and
-- 'class-thumbnails' — neither bucket existed, so every upload 404'd
-- and the coach saw a generic "Upload failed" with no explanation.
--
-- Public read: class playback and thumbnails are fetched by getPublicUrl
-- and rendered directly, the same as the existing avatars / diet-images
-- buckets. Writes are restricted to authenticated users.
--
-- Re-runnable.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('class-videos', 'class-videos', true, 524288000,  -- 500 MB
    ARRAY['video/mp4','video/quicktime','video/x-m4v','video/3gpp','video/webm']),
  ('class-thumbnails', 'class-thumbnails', true, 10485760,  -- 10 MB
    ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Anyone may read (public playback); only signed-in users may write.
DROP POLICY IF EXISTS "Class media is publicly readable" ON storage.objects;
CREATE POLICY "Class media is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('class-videos', 'class-thumbnails'));

DROP POLICY IF EXISTS "Authenticated users upload class media" ON storage.objects;
CREATE POLICY "Authenticated users upload class media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('class-videos', 'class-thumbnails'));

DROP POLICY IF EXISTS "Owners update class media" ON storage.objects;
CREATE POLICY "Owners update class media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('class-videos', 'class-thumbnails') AND owner = auth.uid());

DROP POLICY IF EXISTS "Owners delete class media" ON storage.objects;
CREATE POLICY "Owners delete class media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('class-videos', 'class-thumbnails') AND owner = auth.uid());
