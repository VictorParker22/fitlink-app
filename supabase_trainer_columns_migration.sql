-- Add missing columns to trainers table
-- These are referenced by the app (settings, wizard, profile) but were never migrated

ALTER TABLE trainers ADD COLUMN IF NOT EXISTS specialization text;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS certifications text;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS working_hours jsonb;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS notification_prefs jsonb;
ALTER TABLE trainers ADD COLUMN IF NOT EXISTS avatar_url text;
