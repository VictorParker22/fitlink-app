-- ============================================================
-- One lift-weight unit per athlete (2026-09-05).
--
-- Lift weights in client_workout_logs.exercises[].sets[].weight are bare
-- numbers. Until now the assigned-workout player labelled them "lbs" and the
-- strength session labelled them "kg" while both fed the same PR map. From
-- here every screen reads and labels from clients.weight_unit (default lbs,
-- toggled in the athlete's profile). Stored numbers are NOT converted: they
-- are read in the athlete's current unit. New sets also stamp `unit` in the
-- JSONB so a future honest conversion is possible.
--
-- The athlete's own-row UPDATE policy (clients_update) covers this column;
-- guard_entitlement_columns does not inspect it.
-- ============================================================
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS weight_unit text NOT NULL DEFAULT 'lbs';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_weight_unit_check') THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_weight_unit_check CHECK (weight_unit IN ('lbs', 'kg'));
  END IF;
END $$;
