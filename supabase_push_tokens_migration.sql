-- Add push_token column to trainers table
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS push_token text;

-- Add push_token column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS push_token text;
