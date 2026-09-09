-- A paid pass must let the athlete read the pass (2026-09-08, first live purchase).
--
-- The tenant-isolation sweep (20260908070000) scoped workouts_select to
-- rows assigned through client_workouts and diet_plans_select to rows
-- assigned through client_diets. That closed "read every pass's workouts"
-- and also closed the ones an athlete PAID for: a season's track_snapshot
-- names workout and diet ids that are never assigned row-by-row, so the
-- Train tab sat on "Loading the session details…" forever and the Food tab
-- was empty.
--
-- my_track_ids(kind) = the ids of that kind in the caller's own active or
-- completed enrolments (client_plan_enrollments RLS already limits those
-- rows to the athlete and their coach) plus the track of the plan the
-- athlete is attached to (clients.plan_id, written only by the server).
-- Both SELECT policies gain `id IN (SELECT my_track_ids(...))`.
-- Child tables follow automatically: workout_exercises_select and
-- diet_plan_meals_select are parent-scoped EXISTS, exercises/meals are
-- readable when a visible parent row references them.

CREATE OR REPLACE FUNCTION public.my_track_ids(p_kind text)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
  SELECT DISTINCT (n->>'id')::uuid
  FROM public.client_plan_enrollments e
  JOIN public.clients c ON c.id = e.client_id AND c.auth_user_id = (SELECT auth.uid())
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.track_snapshot, '[]'::jsonb)) n
  WHERE e.status IN ('active', 'completed')
    AND n->>'type' = p_kind
    AND (n->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION
  SELECT DISTINCT (n->>'id')::uuid
  FROM public.clients c
  JOIN public.plans p ON p.id = c.plan_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.track, '[]'::jsonb)) n
  WHERE c.auth_user_id = (SELECT auth.uid())
    AND n->>'type' = p_kind
    AND (n->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

REVOKE EXECUTE ON FUNCTION public.my_track_ids(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_track_ids(text) TO authenticated;

DROP POLICY IF EXISTS workouts_select ON public.workouts;
CREATE POLICY workouts_select ON public.workouts
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT client_workouts.workout_id FROM public.client_workouts
      WHERE client_workouts.client_id IN (
        SELECT clients.id FROM public.clients WHERE clients.auth_user_id = (SELECT auth.uid())
      )
    )
    OR trainer_id = (SELECT auth.uid())
    OR id IN (SELECT public.my_track_ids('workout'))
  );

DROP POLICY IF EXISTS diet_plans_select ON public.diet_plans;
CREATE POLICY diet_plans_select ON public.diet_plans
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = trainer_id
    OR id IN (
      SELECT client_diets.diet_plan_id FROM public.client_diets
      WHERE client_diets.client_id IN (
        SELECT clients.id FROM public.clients WHERE clients.auth_user_id = (SELECT auth.uid())
      )
    )
    OR id IN (SELECT public.my_track_ids('diet'))
  );

NOTIFY pgrst, 'reload schema';
