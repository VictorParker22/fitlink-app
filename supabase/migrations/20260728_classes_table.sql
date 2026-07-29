-- ============================================================
-- On-Demand Classes — Core Table
-- Coaches create and publish video classes for the marketplace
-- ============================================================

CREATE TABLE IF NOT EXISTS classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID NOT NULL REFERENCES trainers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  difficulty TEXT NOT NULL DEFAULT 'intermediate',
  duration_minutes INTEGER NOT NULL,
  video_url TEXT,
  thumbnail_url TEXT,
  equipment TEXT[] DEFAULT '{}',

  -- Access control
  is_free BOOLEAN DEFAULT false,
  plan_id UUID REFERENCES plans(id),

  -- Optional linked workout structure
  workout_id UUID REFERENCES workouts(id),

  -- Engagement metrics (updated via RPCs / triggers)
  status TEXT NOT NULL DEFAULT 'draft',
  take_count INTEGER DEFAULT 0,
  total_watch_minutes INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trainers manage own classes" ON classes
  FOR ALL USING (auth.uid() = trainer_id);

CREATE POLICY "Anyone can read published classes" ON classes
  FOR SELECT USING (status = 'published');

-- Indexes for fast catalog + analytics queries
CREATE INDEX idx_classes_status_category ON classes(status, category);
CREATE INDEX idx_classes_trainer ON classes(trainer_id);
CREATE INDEX idx_classes_created ON classes(created_at DESC);
