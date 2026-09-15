-- Solo athletes check in too (2026-09-16). client_checkins.trainer_id was NOT NULL
-- from the coached-only days; a Solo athlete's row has no coach and the corner
-- replies instead. The coach-side inbox filters by trainer_id, so NULL rows
-- never appear there.
ALTER TABLE public.client_checkins ALTER COLUMN trainer_id DROP NOT NULL;
