CREATE TABLE IF NOT EXISTS client_workout_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  client_workout_id UUID REFERENCES client_workouts(id) ON DELETE SET NULL,
  workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  exercises JSONB,
  duration_minutes INTEGER,
  notes TEXT,
  completed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE client_workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own logs" ON client_workout_logs
  FOR ALL USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

CREATE POLICY "Trainers can read client logs" ON client_workout_logs
  FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid()));
