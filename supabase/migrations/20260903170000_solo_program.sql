-- ============================================================
-- Solo program: workouts the corner builds for a coachless athlete.
--
-- workouts.trainer_id and client_workouts.trainer_id were NOT NULL, so a
-- program with no coach could not exist. The solo-program function
-- (service role) writes them with trainer_id NULL; athletes already read
-- their assignments through client_workouts → workouts → workout_exercises.
-- ============================================================

ALTER TABLE public.workouts ALTER COLUMN trainer_id DROP NOT NULL;
ALTER TABLE public.client_workouts ALTER COLUMN trainer_id DROP NOT NULL;

-- Athletes read the exercises inside their assigned workouts. Coach-side
-- policies key on trainer_id and are unaffected by NULL.
DROP POLICY IF EXISTS "Clients can read assigned workout exercises" ON public.workout_exercises;
CREATE POLICY "Clients can read assigned workout exercises"
  ON public.workout_exercises FOR SELECT
  USING (workout_id IN (
    SELECT cw.workout_id FROM public.client_workouts cw
    WHERE cw.client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid())
  ));

-- Marks when the corner last built a program, so it is done once and
-- rebuilt only on request.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS solo_program_built_at timestamptz;
