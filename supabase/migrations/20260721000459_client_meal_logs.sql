
CREATE TABLE IF NOT EXISTS client_meal_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  diet_plan_id UUID REFERENCES diet_plans(id) ON DELETE CASCADE,
  diet_plan_meal_id UUID REFERENCES diet_plan_meals(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, diet_plan_meal_id, logged_date)
);

ALTER TABLE client_meal_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own meal logs" ON client_meal_logs
  FOR ALL USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

CREATE POLICY "Trainers can read client meal logs" ON client_meal_logs
  FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE trainer_id = auth.uid()));

