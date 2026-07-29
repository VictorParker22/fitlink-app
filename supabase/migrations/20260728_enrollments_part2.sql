-- PART 2: Create the track events table (run after Part 1 succeeds)
CREATE TABLE IF NOT EXISTS track_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID NOT NULL REFERENCES client_plan_enrollments(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  track_position INTEGER NOT NULL,
  node_type TEXT NOT NULL,
  node_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('completed', 'skipped', 'paused', 'resumed')),
  workout_log_id UUID,
  duration_sec INTEGER,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
