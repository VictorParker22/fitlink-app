-- Add video_url column to workout_exercises table
-- This allows coaches to attach a demo video to each exercise in a workout
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Allow storage of exercise videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercise-videos', 'exercise-videos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload exercise videos
CREATE POLICY "Trainers can upload exercise videos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exercise-videos');

-- Allow public read access to exercise videos
CREATE POLICY "Public can view exercise videos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'exercise-videos');

-- Allow trainers to delete their own exercise videos
CREATE POLICY "Trainers can delete exercise videos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'exercise-videos');
