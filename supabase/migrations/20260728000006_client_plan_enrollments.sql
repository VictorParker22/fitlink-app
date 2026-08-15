-- Migration: client_plan_enrollments + track_events
-- Connects pass progression tracks to automatic client workout scheduling

-- 1. Enrollment table (client <-> plan with frozen track snapshot)
CREATE TABLE IF NOT EXISTS client_plan_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  
  -- Frozen copy of the plan track at enrollment time
  track_snapshot JSONB NOT NULL DEFAULT '[]',
  
  -- Progression state
  track_position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  
  -- Dates
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  
  -- Coach control: if true, track_snapshot updates when coach edits plan
  sync_with_plan BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(client_id, plan_id)
);

ALTER TABLE client_plan_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own enrollments" ON client_plan_enrollments
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Trainers manage enrollments" ON client_plan_enrollments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM clients c 
      WHERE c.id = client_plan_enrollments.client_id 
      AND c.trainer_id = auth.uid()
    )
  );

CREATE INDEX idx_enrollments_client ON client_plan_enrollments(client_id);
CREATE INDEX idx_enrollments_plan ON client_plan_enrollments(plan_id);
CREATE INDEX idx_enrollments_status ON client_plan_enrollments(status);

-- 2. Track events ledger (completed, skipped, paused, resumed)
CREATE TABLE IF NOT EXISTS track_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enrollment_id UUID NOT NULL REFERENCES client_plan_enrollments(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  
  -- Event details
  track_position INTEGER NOT NULL,
  node_type TEXT NOT NULL,
  node_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('completed', 'skipped', 'paused', 'resumed')),
  
  -- Completion data (optional)
  workout_log_id UUID,
  duration_sec INTEGER,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE track_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients read own track events" ON track_events
  FOR SELECT USING (client_id = auth.uid());

CREATE POLICY "Trainers manage track events" ON track_events
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM client_plan_enrollments e
      JOIN clients c ON c.id = e.client_id
      WHERE e.id = track_events.enrollment_id
      AND c.trainer_id = auth.uid()
    )
  );

CREATE INDEX idx_track_events_enrollment ON track_events(enrollment_id);
CREATE INDEX idx_track_events_client ON track_events(client_id);
CREATE INDEX idx_track_events_type ON track_events(event_type);
