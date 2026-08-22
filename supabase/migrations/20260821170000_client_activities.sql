-- client_activities — manual activity logs from the athlete's Activity screen
-- ("Golf 45min" style entries). Deliberately NOT client_workout_logs: that
-- table's exercises/workout_id semantics feed coach analytics
-- (lib/workoutCounts.ts) and manual rows would corrupt them.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS client_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  category TEXT,
  name TEXT,
  duration_minutes INTEGER,
  location TEXT,
  notes TEXT,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_activities ENABLE ROW LEVEL SECURITY;

-- Policies mirror the client-owned pattern used by client_meal_logs/gym_visits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_activities' AND policyname = 'Clients can manage own activities'
  ) THEN
    CREATE POLICY "Clients can manage own activities" ON client_activities
      FOR ALL USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'client_activities' AND policyname = 'Trainers can read client activities'
  ) THEN
    CREATE POLICY "Trainers can read client activities" ON client_activities
      FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_activities_client_date
  ON client_activities (client_id, activity_date);
