CREATE TABLE IF NOT EXISTS client_health_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  steps INTEGER DEFAULT 0,
  heart_rate INTEGER,
  resting_heart_rate INTEGER,
  active_calories INTEGER DEFAULT 0,
  basal_calories INTEGER DEFAULT 0,
  total_calories INTEGER DEFAULT 0,
  blood_oxygen REAL,
  blood_pressure_systolic REAL,
  blood_pressure_diastolic REAL,
  weight REAL,
  weekly_steps JSONB,
  last_synced TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, date)
);

ALTER TABLE client_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own snapshots" ON client_health_snapshots
  FOR ALL USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

CREATE POLICY "Trainers can read client snapshots" ON client_health_snapshots
  FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid()));
