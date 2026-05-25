CREATE TABLE IF NOT EXISTS gym_visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  check_in_time TIMESTAMPTZ DEFAULT now() NOT NULL,
  check_out_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE gym_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own gym visits" ON gym_visits
  FOR ALL USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

CREATE POLICY "Trainers can read client gym visits" ON gym_visits
  FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid()));
