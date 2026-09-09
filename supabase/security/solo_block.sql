-- Proofs for migration 20260908110000 (solo_block + coachless diet plans).
-- Run with: python supabase/security/run_audit.py supabase/security/solo_block.sql
-- Athlete C (61b74c97, client 7f14c282) is the subject; athlete B (751096de)
-- is the stranger. A throwaway coachless plan is created as postgres and
-- removed at the end.

-- @@ blocked: athlete sets their own solo_block
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
UPDATE public.clients SET solo_block = '{"week": 4}'::jsonb WHERE auth_user_id = '61b74c97-20c6-44aa-947c-72dec7719c89';
ROLLBACK;

-- @@ allowed: athlete still edits their own units
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
UPDATE public.clients SET weight_unit = 'kg' WHERE auth_user_id = '61b74c97-20c6-44aa-947c-72dec7719c89';
ROLLBACK;

-- @@ allowed: service role writes a coachless plan and the athlete reads it
BEGIN;
INSERT INTO public.diet_plans (id, trainer_id, name, category) VALUES ('11111111-2222-3333-4444-555555555555', NULL, 'proof plan', 'balanced');
INSERT INTO public.meals (id, name, category, calories, protein, carbs, fat, trainer_id, is_custom) VALUES ('11111111-2222-3333-4444-666666666666', 'proof food', 'Lunch', 100, 10, 10, 1, NULL, true);
INSERT INTO public.diet_plan_meals (diet_plan_id, meal_id, order_index, meal_time, servings, slot_index) VALUES ('11111111-2222-3333-4444-555555555555', '11111111-2222-3333-4444-666666666666', 0, 'lunch', 1, 1);
INSERT INTO public.client_diets (client_id, diet_plan_id, assigned_date) VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5'::uuid, '11111111-2222-3333-4444-555555555555', current_date);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.client_diets cd JOIN public.diet_plans d ON d.id = cd.diet_plan_id JOIN public.diet_plan_meals dpm ON dpm.diet_plan_id = d.id JOIN public.meals m ON m.id = dpm.meal_id WHERE d.id = '11111111-2222-3333-4444-555555555555';
  IF n <> 1 THEN RAISE EXCEPTION 'athlete cannot read their coachless plan (rows=%)', n; END IF;
END $$;
ROLLBACK;

-- @@ blocked: a stranger reads the coachless plan
BEGIN;
INSERT INTO public.diet_plans (id, trainer_id, name, category) VALUES ('11111111-2222-3333-4444-555555555555', NULL, 'proof plan', 'balanced');
INSERT INTO public.client_diets (client_id, diet_plan_id, assigned_date) VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5'::uuid, '11111111-2222-3333-4444-555555555555', current_date);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.diet_plans WHERE id = '11111111-2222-3333-4444-555555555555';
  IF n <> 0 THEN RAISE EXCEPTION 'stranger read the plan'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;

-- @@ blocked: athlete inserts a coachless plan themselves
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
INSERT INTO public.diet_plans (trainer_id, name, category) VALUES (NULL, 'mine', 'balanced');
ROLLBACK;
