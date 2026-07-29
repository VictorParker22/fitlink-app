-- Add image_url to diet_plans
ALTER TABLE diet_plans
ADD COLUMN IF NOT EXISTS image_url text;

-- Create diet-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('diet-images', 'diet-images', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for diet-images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'diet-images' );

CREATE POLICY "Authenticated users can upload diet images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'diet-images' AND
  auth.role() = 'authenticated'
);
