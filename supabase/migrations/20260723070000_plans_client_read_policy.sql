-- FitLink Migration: Allow clients to read plans (marketplace browsing)
-- The Explore tab marketplace needs to display all available coaching plans
-- from all trainers so clients can browse and subscribe.

-- Allow any authenticated user to read all plans (public marketplace catalog)
CREATE POLICY "Anyone can browse plans"
  ON plans FOR SELECT
  USING (true);

-- Allow clients to also read the trainers table for marketplace coach directory
-- (existing policy only allows reading their assigned trainer)
-- This is idempotent — will only create if the policy doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'trainers' 
    AND policyname = 'Anyone can browse trainers'
  ) THEN
    EXECUTE 'CREATE POLICY "Anyone can browse trainers" ON trainers FOR SELECT USING (true)';
  END IF;
END $$;
