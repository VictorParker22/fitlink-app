-- PART 3: RLS policies and indexes (run after Part 1 and Part 2 succeed)

-- Enrollment RLS
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

-- Track events RLS
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
