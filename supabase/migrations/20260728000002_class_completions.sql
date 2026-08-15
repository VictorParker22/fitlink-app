-- ============================================================
-- On-Demand Classes — Completion Tracking
-- Records every class session (partial or complete) for
-- analytics, revenue share calculation, and client history.
-- ============================================================

CREATE TABLE IF NOT EXISTS class_completions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  trainer_id UUID NOT NULL REFERENCES trainers(id),

  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  duration_sec INTEGER NOT NULL,
  target_duration_sec INTEGER NOT NULL,
  watch_minutes INTEGER NOT NULL,
  completed BOOLEAN DEFAULT false,
  calories_estimate INTEGER,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  pr DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE class_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients manage own completions" ON class_completions
  FOR ALL USING (auth.uid() = client_id);

CREATE POLICY "Trainers read completions on their classes" ON class_completions
  FOR SELECT USING (auth.uid() = trainer_id);

-- Indexes for history, analytics, and revenue calculation
CREATE INDEX idx_completions_client ON class_completions(client_id, completed_at DESC);
CREATE INDEX idx_completions_class ON class_completions(class_id);
CREATE INDEX idx_completions_trainer_month ON class_completions(trainer_id, completed_at);
CREATE INDEX idx_completions_watch_minutes ON class_completions(trainer_id, watch_minutes);
