-- ═══════════════════════════════════════════════════════════════════════════
-- Scope on-demand classes to the coach relationship
--
-- DECISION: on-demand classes are a COACH-SCOPED library, not a cross-coach
-- marketplace. An athlete sees only the published classes of the coach they
-- are actually a client of. This matches the business model — the coach owns
-- the client relationship and FitLink takes a cut of what the coach sells.
--
-- GAP BEING CLOSED: 20260728000001_classes_table.sql shipped
--   CREATE POLICY "Anyone can read published classes" ON classes
--     FOR SELECT USING (status = 'published');
-- which made every coach's entire published library readable by every
-- authenticated user on the platform.
--
-- PRECEDENT: 20260803_live_class_security.sql section 5 already hardened
-- live_classes the same way ("Clients view accessible live classes"). This
-- migration copies that policy structure verbatim so the two class surfaces
-- (live and on-demand) have identical access semantics.
--
-- ID SPACES (verified against the migrations — getting this wrong caused a
-- production outage before, see fix_enrollment_client_rls.sql):
--   trainers.id        = auth.users.id   (AppContext queries trainers by user.id)
--   classes.trainer_id → trainers.id     so classes.trainer_id = auth.uid()
--   clients.trainer_id → trainers.id     so clients.trainer_id = auth.uid() for the coach
--   clients.auth_user_id → auth.users.id the athlete's own auth id
-- The athlete hop is therefore clients.auth_user_id = auth.uid()
--                          AND clients.trainer_id  = classes.trainer_id.
-- NOT clients.id, and NOT class_completions.client_id (that one is an auth id).
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- The permissive policy this migration exists to remove.
DROP POLICY IF EXISTS "Anyone can read published classes" ON classes;

-- Also drop by our own name so the migration is idempotent.
DROP POLICY IF EXISTS "Clients view accessible classes" ON classes;

CREATE POLICY "Clients view accessible classes"
  ON classes FOR SELECT
  USING (
    -- Trainer sees own classes (any status — drafts included, matches the
    -- existing "Trainers manage own classes" FOR ALL policy)
    trainer_id = auth.uid()
    OR
    -- Client sees published classes from their assigned trainer only
    (
      status = 'published'
      AND EXISTS (
        SELECT 1 FROM clients c
        WHERE c.auth_user_id = auth.uid()
          AND c.trainer_id = classes.trainer_id
      )
    )
  );

-- The trainer's full management policy from 20260728000001 is left intact:
--   CREATE POLICY "Trainers manage own classes" ON classes
--     FOR ALL USING (auth.uid() = trainer_id);
-- Recreated here only if it is missing, so a fresh apply is self-sufficient.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'classes'
      AND policyname = 'Trainers manage own classes'
  ) THEN
    EXECUTE 'CREATE POLICY "Trainers manage own classes" ON classes FOR ALL USING (auth.uid() = trainer_id)';
  END IF;
END $$;

-- Supports the EXISTS lookup above.
CREATE INDEX IF NOT EXISTS idx_clients_auth_user_trainer
  ON clients(auth_user_id, trainer_id);
