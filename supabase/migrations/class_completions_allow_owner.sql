-- ============================================================
-- Let a coach record a completion on their OWN class.
--
-- harden_class_completions.sql required the writer to be a CLIENT of the
-- class's trainer. That correctly blocks forged rows, but it also blocks
-- the coach themself: previewing your own class produced an RLS denial
-- and no completion row, so nothing could be rated afterwards either.
--
-- Adds the owner branch, mirroring how scope_classes_to_coach.sql lets a
-- trainer read their own classes. The forgery guard is unchanged:
-- trainer_id must still equal the class's real owner.
--
-- Re-runnable.
-- ============================================================

DROP POLICY IF EXISTS "Clients write own completions" ON class_completions;
CREATE POLICY "Clients write own completions"
  ON class_completions FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1
      FROM classes cl
      WHERE cl.id = class_completions.class_id
        AND cl.trainer_id = class_completions.trainer_id
        AND (
          -- the coach who owns the class
          cl.trainer_id = auth.uid()
          -- or one of that coach's athletes
          OR EXISTS (
            SELECT 1 FROM clients c
            WHERE c.trainer_id = cl.trainer_id
              AND c.auth_user_id = auth.uid()
          )
        )
    )
  );
