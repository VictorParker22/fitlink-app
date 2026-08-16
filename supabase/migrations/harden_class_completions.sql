-- ============================================================
-- Harden class_completions — close the revenue-forgery surface.
--
-- The original policy (20260728000002_class_completions.sql) was:
--     FOR ALL USING (auth.uid() = client_id)
-- with no WITH CHECK. FOR ALL applies USING to reads/updates/deletes,
-- but an INSERT is governed by WITH CHECK — and with none defined,
-- Postgres falls back to USING, which only asserts that the row names
-- YOU as the client. Nothing constrained trainer_id, class_id or
-- watch_minutes against reality.
--
-- So any authenticated athlete could insert:
--     { client_id: self, trainer_id: <any coach>, watch_minutes: 99999 }
-- and class_revenue_shares is computed from exactly those columns
-- (see idx_completions_trainer_month / idx_completions_watch_minutes).
-- That is fabricated payout input, writable by any user.
--
-- This migration keeps completions self-owned AND forces every row to
-- describe a real, reachable class: trainer_id must match the class's
-- actual owner, and the athlete must be that coach's client (the same
-- relationship test scope_classes_to_coach.sql uses for SELECT).
--
-- NOTE ON IDS: class_completions.client_id references auth.users(id),
-- i.e. it holds an AUTH id (not clients.id). classes.trainer_id and
-- clients.trainer_id both reference trainers(id), and trainers.id IS
-- the coach's auth id. The athlete hop is therefore
-- clients.auth_user_id = auth.uid(). Getting this wrong is what broke
-- enrollments before (see fix_enrollment_client_rls.sql).
--
-- Re-runnable.
-- ============================================================

DROP POLICY IF EXISTS "Clients manage own completions" ON class_completions;
DROP POLICY IF EXISTS "Clients read own completions" ON class_completions;
DROP POLICY IF EXISTS "Clients write own completions" ON class_completions;
DROP POLICY IF EXISTS "Clients update own completions" ON class_completions;

-- Read: your own rows, unchanged.
CREATE POLICY "Clients read own completions"
  ON class_completions FOR SELECT
  USING (auth.uid() = client_id);

-- Insert: your own row, and it must describe a class you can actually
-- reach — trainer_id has to be the class's real owner, and you have to
-- be a client of that coach.
CREATE POLICY "Clients write own completions"
  ON class_completions FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1
      FROM classes cl
      JOIN clients c
        ON c.trainer_id = cl.trainer_id
      WHERE cl.id = class_completions.class_id
        AND cl.trainer_id = class_completions.trainer_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- Update: only your own rows, and the same integrity check on the
-- result, so a row cannot be edited into naming another coach.
CREATE POLICY "Clients update own completions"
  ON class_completions FOR UPDATE
  USING (auth.uid() = client_id)
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1
      FROM classes cl
      WHERE cl.id = class_completions.class_id
        AND cl.trainer_id = class_completions.trainer_id
    )
  );

-- Trainers keep their existing read access (policy left intact).

-- Watch time cannot exceed the class's own target by more than a small
-- tolerance — a completion is bounded by the length of the thing watched.
-- Guarded so re-running is safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'class_completions_watch_minutes_sane'
  ) THEN
    ALTER TABLE class_completions
      ADD CONSTRAINT class_completions_watch_minutes_sane
      CHECK (
        watch_minutes >= 0
        AND duration_sec >= 0
        AND watch_minutes <= (target_duration_sec / 60) + 5
      );
  END IF;
END $$;

-- Supports the EXISTS lookups above.
CREATE INDEX IF NOT EXISTS idx_clients_auth_user_trainer
  ON clients(auth_user_id, trainer_id);
