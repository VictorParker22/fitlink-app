-- Add assessment_data JSONB column to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS assessment_data JSONB;

-- Note: No new RLS policies needed since existing clients policies
-- (select, update) cover all columns on the row.
