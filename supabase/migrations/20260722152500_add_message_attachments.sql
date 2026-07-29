ALTER TABLE messages
ADD COLUMN attachment_url TEXT,
ADD COLUMN attachment_type TEXT;

-- Create chat-attachments bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for chat-attachments
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Anyone can read chat attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-attachments');
