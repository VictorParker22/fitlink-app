-- ============================================================
-- Phase E — private media buckets.
--
-- Phase A stopped anon ENUMERATION of chat-attachments. It could not stop
-- anon READS, because `public: true` means the storage CDN serves the object
-- without ever consulting RLS — the policy only ever governed listing and
-- writing. Attachments in a coaching DM are body photos, injury photos and
-- medical documents, and progress-photos is literally a body-photo bucket.
--
-- This flips both to private, so every read now requires a signed URL, which
-- in turn requires the caller to pass the SELECT policy below.
--
-- READ SCOPING. Uploads are moving to `{uid}/{file}` paths (client change in
-- the same commit), so an attachment's first path segment identifies the
-- uploader. A conversation participant may read the other participant's
-- objects; nobody else may.
--
-- KNOWN BEHAVIOUR CHANGE, stated plainly: objects uploaded BEFORE this change
-- have flat filenames with no uid segment, so `storage.foldername(name)[1]`
-- is NULL for them and they resolve to owner-only. The sender still sees their
-- own old attachments; the recipient will not. There are 29 such objects, all
-- pre-launch test data. Rewriting them would mean rewriting messages.attachment_url
-- too, which is not worth it for test rows — but if this is ever run against
-- real history, migrate the objects first.
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id IN ('chat-attachments', 'progress-photos');

-- ── chat-attachments ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat attachments" ON storage.objects;

CREATE POLICY "Participants read chat attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.conversations cv
        LEFT JOIN public.clients cl ON cl.id = cv.client_id
        WHERE (cv.trainer_id = auth.uid() OR cl.auth_user_id = auth.uid())
          AND (storage.foldername(name))[1] IN (cv.trainer_id::text, cl.auth_user_id::text)
      )
    )
  );

CREATE POLICY "Users upload chat attachments to own path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own chat attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner = auth.uid());

-- ── progress-photos ─────────────────────────────────────────────────
-- Had NO policies at all, so uploads could never have succeeded. The athlete
-- owns the photo; their coach may see it (that is the point of the feature).
DROP POLICY IF EXISTS "Owner and coach read progress photos" ON storage.objects;
CREATE POLICY "Owner and coach read progress photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'progress-photos'
    AND (
      owner = auth.uid()
      OR (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.trainer_id = auth.uid()
          AND (storage.foldername(name))[1] IN (c.id::text, c.auth_user_id::text)
      )
    )
  );

DROP POLICY IF EXISTS "Users upload progress photos to own path" ON storage.objects;
CREATE POLICY "Users upload progress photos to own path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'progress-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      -- A coach logging progress on behalf of their athlete writes under
      -- that athlete's clients.id.
      OR EXISTS (
        SELECT 1 FROM public.clients c
        WHERE c.trainer_id = auth.uid()
          AND (storage.foldername(name))[1] = c.id::text
      )
    )
  );

DROP POLICY IF EXISTS "Owners delete progress photos" ON storage.objects;
CREATE POLICY "Owners delete progress photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'progress-photos' AND owner = auth.uid());

-- ── class media: stop arbitrary object names in a public bucket ─────
-- UPDATE/DELETE were already owner-scoped, so a coach's existing video could
-- never be overwritten. What remained was unbounded arbitrary upload — free
-- malware/phishing hosting on our own CDN origin — plus path squatting.
DROP POLICY IF EXISTS "Authenticated users upload class media" ON storage.objects;
CREATE POLICY "Coaches upload class media to own path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = ANY (ARRAY['class-videos', 'class-thumbnails'])
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── exercise-videos / diet-images: same treatment ───────────────────
DROP POLICY IF EXISTS "Trainers can upload exercise videos" ON storage.objects;
CREATE POLICY "Trainers upload exercise videos to own path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'exercise-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can upload diet images" ON storage.objects;
CREATE POLICY "Users upload diet images to own path"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'diet-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
