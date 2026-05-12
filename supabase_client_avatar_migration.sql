-- Migration to add avatar_url to clients table

-- 1. Add avatar_url column to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS avatar_url text;

-- Note: The 'avatars' storage bucket and associated RLS policies 
-- already exist from the trainer avatar migration. Clients will use 
-- the same bucket.
