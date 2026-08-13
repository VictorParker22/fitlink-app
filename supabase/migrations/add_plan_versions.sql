-- Version history for pass tracks — written every time a live pass's track
-- is republished, so the coach can see who is finishing which shape of the
-- season and roll back within 30 days.
CREATE TABLE IF NOT EXISTS plan_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  track JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE plan_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trainers manage own plan versions" ON plan_versions
  FOR ALL USING (EXISTS (SELECT 1 FROM plans p WHERE p.id = plan_versions.plan_id AND p.trainer_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_plan_versions_plan ON plan_versions(plan_id);
