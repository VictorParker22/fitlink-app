-- Fix: athletes could never read their own enrollments.
--
-- The original policies compared client_plan_enrollments.client_id (a
-- clients-table id) directly against auth.uid() (an auth user id) — two
-- different id spaces, so the SELECT always returned zero rows for athletes.
-- The correct check joins through clients.auth_user_id, the same way every
-- other client-owned table's policy does.
--
-- Also backfills track_snapshot for enrollments that were frozen from an
-- empty source (enrollClientInPlan used to snapshot local state that could
-- be empty), copying the plan's current track. Safe to re-run.

DROP POLICY IF EXISTS "Clients read own enrollments" ON client_plan_enrollments;
CREATE POLICY "Clients read own enrollments" ON client_plan_enrollments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_plan_enrollments.client_id
        AND c.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients read own track events" ON track_events;
CREATE POLICY "Clients read own track events" ON track_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = track_events.client_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- Athletes advance their own track_position when completing track workouts.
DROP POLICY IF EXISTS "Clients update own enrollments" ON client_plan_enrollments;
CREATE POLICY "Clients update own enrollments" ON client_plan_enrollments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = client_plan_enrollments.client_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- Backfill empty snapshots from the plan's current track.
UPDATE client_plan_enrollments e
SET track_snapshot = p.track
FROM plans p
WHERE p.id = e.plan_id
  AND (e.track_snapshot IS NULL OR jsonb_array_length(e.track_snapshot) = 0)
  AND p.track IS NOT NULL
  AND jsonb_array_length(p.track) > 0;
