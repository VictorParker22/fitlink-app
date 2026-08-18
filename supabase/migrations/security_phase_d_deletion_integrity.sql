-- ============================================================
-- Phase D — account deletion actually deletes.
--
-- Found while checking what the three audits did NOT cover.
-- delete_client_account() removes the clients row and relies on FK
-- cascades for everything else. Fourteen tables cascade correctly —
-- but THREE carry a client_id with no foreign key at all, so an
-- athlete who deletes their account leaves these behind forever:
--
--   client_habits            daily habit ticks
--   client_plan_enrollments  which coach's season they bought and how
--                            far through it they got
--   track_events             per-node season history
--
-- That is a deletion promise the app does not keep (App Store 5.1.1(v)
-- and, for EU athletes, an erasure obligation).
--
-- Verified 0 existing orphans in all three before adding the
-- constraints, so no row is destroyed by this migration — it only
-- changes what happens on FUTURE deletes.
--
-- Re-runnable.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'client_habits_client_id_fkey' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.client_habits
      ADD CONSTRAINT client_habits_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'client_plan_enrollments_client_id_fkey' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.client_plan_enrollments
      ADD CONSTRAINT client_plan_enrollments_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'track_events_client_id_fkey' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.track_events
      ADD CONSTRAINT track_events_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
  END IF;
END $$;
