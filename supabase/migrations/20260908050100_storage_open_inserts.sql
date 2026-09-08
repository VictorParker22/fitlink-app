-- 2026-09-08 — two storage buckets accepted uploads from ANY signed-in user
-- to ANY path: exercise-gifs ("Allow authenticated uploads") and
-- exercise-audio ("exercise_audio_insert"). Nothing in the app writes either
-- bucket with a user token: the exercise library was seeded server-side and
-- text-to-speech uploads with the service role (which bypasses these
-- policies). Left open they were a free CDN and a storage bill.
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908050100_storage_open_inserts.sql

DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "exercise_audio_insert" ON storage.objects;
