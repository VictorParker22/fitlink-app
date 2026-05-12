-- Add trial_end_date column to clients table
-- Default trial period is 20 days from created_at (computed in app if NULL)
-- Max trial is 40 days from created_at (enforced in app logic)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS trial_end_date timestamptz;

-- Set default trial_end_date for existing trial clients (20 days from creation)
UPDATE clients
  SET trial_end_date = created_at + interval '20 days'
  WHERE status = 'trial' AND trial_end_date IS NULL;
