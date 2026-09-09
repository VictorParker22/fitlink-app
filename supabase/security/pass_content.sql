-- Proofs for migration 20260908120000 (pass content visibility).
--   Athlete C = 61b74c97 (client 7f14c282), enrolled in coach A's "Spring"
--               whose track names workout 447d460a and diet 1b350c66.
--   Athlete B = 751096de (client 269decac), coached by aef8549e, not enrolled.
--   Stranger  = f93f2129 (no rows).
-- Run with: python supabase/security/run_audit.py supabase/security/pass_content.sql

-- @@ allowed: enrolled athlete C reads the season's workout and its exercises
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.workouts w JOIN public.workout_exercises we ON we.workout_id = w.id JOIN public.exercises e ON e.id = we.exercise_id WHERE w.id = '447d460a-8812-4ca4-b5f9-90f4dbee6f01';
  IF n < 1 THEN RAISE EXCEPTION 'enrolled athlete cannot read the season workout (rows=%)', n; END IF;
END $$;
ROLLBACK;

-- @@ allowed: enrolled athlete C reads the season's diet plan and its foods
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.diet_plans d JOIN public.diet_plan_meals dpm ON dpm.diet_plan_id = d.id JOIN public.meals m ON m.id = dpm.meal_id WHERE d.id = '1b350c66-1f57-4d8e-9be5-9b16a88a227c';
  IF n < 1 THEN RAISE EXCEPTION 'enrolled athlete cannot read the season diet (rows=%)', n; END IF;
END $$;
ROLLBACK;

-- @@ blocked: athlete B (not enrolled) reads the same workout
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.workouts WHERE id = '447d460a-8812-4ca4-b5f9-90f4dbee6f01';
  IF n <> 0 THEN RAISE EXCEPTION 'unenrolled athlete read the pass workout'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;

-- @@ blocked: athlete B (not enrolled) reads the same diet plan
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.diet_plans WHERE id = '1b350c66-1f57-4d8e-9be5-9b16a88a227c';
  IF n <> 0 THEN RAISE EXCEPTION 'unenrolled athlete read the pass diet'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;

-- @@ blocked: a stranger reads the pass workout
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.workouts WHERE id = '447d460a-8812-4ca4-b5f9-90f4dbee6f01';
  IF n <> 0 THEN RAISE EXCEPTION 'stranger read the pass workout'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;

-- @@ blocked: anonymous calls my_track_ids
BEGIN;
SET LOCAL ROLE anon;
SELECT public.my_track_ids('workout');
ROLLBACK;

-- @@ blocked: enrolled athlete C still cannot read coach A's OTHER workouts
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
DO $$
DECLARE n int; total int;
BEGIN
  SELECT count(*) INTO n FROM public.workouts WHERE trainer_id = 'eefec23f-5734-445f-9fea-ff6e095fd348';
  SET LOCAL ROLE postgres;
  SELECT count(*) INTO total FROM public.workouts WHERE trainer_id = 'eefec23f-5734-445f-9fea-ff6e095fd348';
  IF total > 1 AND n >= total THEN RAISE EXCEPTION 'athlete sees the whole library (% of %)', n, total; END IF;
  RAISE EXCEPTION 'blocked as expected (% of % visible)', n, total;
END $$;
ROLLBACK;
