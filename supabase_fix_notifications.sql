-- Fix notifications realtime + RLS
-- ============================================================
-- The existing RLS policy (auth.uid() = trainer_id) IS correct
-- because trainers.id = auth.uid() in this app.
--
-- The only issue was the realtime subscription in the app code
-- filtering by 'user_id' instead of 'trainer_id' (fixed in AppContext.tsx).
--
-- This SQL is optional — run it if notifications still don't show up,
-- to re-create the RLS policy with separate SELECT/UPDATE/INSERT:
-- ============================================================

-- Drop old combined policy
DROP POLICY IF EXISTS "Trainers can manage their own notifications" ON notifications;

-- Trainers can read their own notifications
CREATE POLICY "Trainers can read own notifications"
  ON notifications FOR SELECT
  USING (trainer_id = auth.uid());

-- Trainers can update their own notifications (mark as read)
CREATE POLICY "Trainers can update own notifications"
  ON notifications FOR UPDATE
  USING (trainer_id = auth.uid());

-- Allow any authenticated user to insert notifications (for client signup alerts)
CREATE POLICY "Authenticated users can send notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
