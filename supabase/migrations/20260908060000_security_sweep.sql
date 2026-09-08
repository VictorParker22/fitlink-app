-- 2026-09-08 — security sweep, part two. Every remaining table, RPC and
-- policy was read with the same question as the self-grant audit: "what can
-- the row's own user, or any signed-in stranger, do here that they should
-- not". What this closes:
--
--   1. workout_exercises SELECT was `true`: the sets/reps/exercise ids of any
--      workout were readable by anyone holding the workout id — and pass
--      outlines (plans.track, public by design as the sales pitch) hand out
--      those ids. The paid content of every pass was one query away.
--   2. diet_plan_meals SELECT was `true`: same shape for diet plans.
--   3. increment_viewer_count / decrement_viewer_count added ±1 for any
--      caller on any class, unbounded. Viewer counts now come from a
--      presence table keyed by (class, user), and only someone who can see
--      the class (owner, roster athlete, invite holder) can join it.
--   4. notifications INSERT let an athlete write ANY type into their coach's
--      inbox — "X bought a pass", "new client" — with any title. Athlete
--      inserts are now limited to the activity types the app actually sends.
--   5. create_client_and_notify attached a brand-new athlete to ANY coach as
--      a 'trial' member with no consent — the one path that still bypassed
--      "clients.trainer_id is set only by the coach accepting". It now creates
--      the coachless row and files a request, like every other path.
--   6. log_audit_event was callable by any signed-in user (fake 'critical'
--      security events in the ops dashboard); cohort_member_count by anon.
--   7. The diet-images bucket could be LISTED by anyone (the public SELECT
--      policy); public buckets serve objects by URL without it.
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908060000_security_sweep.sql

-- ── 1–2. Child rows are visible only when the parent is ─────────────────────
DROP POLICY IF EXISTS workout_exercises_select ON public.workout_exercises;
CREATE POLICY workout_exercises_select ON public.workout_exercises
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_exercises.workout_id));

DROP POLICY IF EXISTS diet_plan_meals_select ON public.diet_plan_meals;
CREATE POLICY diet_plan_meals_select ON public.diet_plan_meals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.diet_plans d WHERE d.id = diet_plan_meals.diet_plan_id));

-- ── 3. Viewer presence ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.live_class_viewers (
  live_class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_class_id, user_id)
);
ALTER TABLE public.live_class_viewers ENABLE ROW LEVEL SECURITY;
-- No policies: only the two definer functions below touch it.

CREATE OR REPLACE FUNCTION public.can_view_live_class(p_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.live_classes lc
     WHERE lc.id = p_class_id
       AND (lc.trainer_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.clients c
                        WHERE c.auth_user_id = auth.uid() AND c.trainer_id = lc.trainer_id)
            OR EXISTS (SELECT 1 FROM public.live_class_access a
                        WHERE a.live_class_id = lc.id AND a.user_id = auth.uid()))
  );
$function$;
REVOKE EXECUTE ON FUNCTION public.can_view_live_class(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_viewer_count(class_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF NOT public.can_view_live_class(class_id) THEN
    RAISE EXCEPTION 'Not allowed to watch this class' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- One seat per person however many times the player mounts.
  INSERT INTO public.live_class_viewers (live_class_id, user_id)
  VALUES (class_id, auth.uid())
  ON CONFLICT DO NOTHING;
  UPDATE public.live_classes
     SET viewer_count = (SELECT count(*) FROM public.live_class_viewers v WHERE v.live_class_id = class_id)
   WHERE id = class_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrement_viewer_count(class_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  DELETE FROM public.live_class_viewers WHERE live_class_id = class_id AND user_id = auth.uid();
  UPDATE public.live_classes
     SET viewer_count = (SELECT count(*) FROM public.live_class_viewers v WHERE v.live_class_id = class_id)
   WHERE id = class_id;
END;
$function$;

-- Ending a class clears its seats so a count never lingers.
CREATE OR REPLACE FUNCTION public.clear_live_class_viewers()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IN ('ended', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.live_class_viewers WHERE live_class_id = NEW.id;
    NEW.viewer_count := 0;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.clear_live_class_viewers() FROM anon, authenticated;
DROP TRIGGER IF EXISTS trg_clear_live_class_viewers ON public.live_classes;
CREATE TRIGGER trg_clear_live_class_viewers
  BEFORE UPDATE OF status ON public.live_classes
  FOR EACH ROW EXECUTE FUNCTION public.clear_live_class_viewers();

-- ── 4. An athlete's notification to their coach is an activity, never a sale ─
CREATE OR REPLACE FUNCTION public.guard_notification_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := current_user;
  v_privileged boolean := v_role IN ('service_role', 'supabase_admin', 'postgres', 'supabase_auth_admin');
  v_uid uuid := auth.uid();
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;
  IF v_uid IS NOT NULL AND NEW.trainer_id IS DISTINCT FROM v_uid THEN
    -- Written by an athlete into a coach's inbox.
    IF NEW.type IS NULL OR NEW.type NOT IN ('workout', 'score', 'water', 'nutrition', 'file', 'message') THEN
      RAISE EXCEPTION 'that notification type is written by the server'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.is_read := false;
  END IF;
  NEW.title := LEFT(COALESCE(NEW.title, ''), 140);
  NEW.description := LEFT(NEW.description, 600);
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.guard_notification_insert() FROM anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_notification_insert ON public.notifications;
CREATE TRIGGER trg_guard_notification_insert
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_notification_insert();

-- ── 5. Choosing a coach is a request, on every path ─────────────────────────
CREATE OR REPLACE FUNCTION public.create_client_and_notify(p_name text, p_email text, p_trainer_id uuid, p_phone text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_client_id uuid;
  v_existing_trainer uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, trainer_id INTO v_client_id, v_existing_trainer
    FROM public.clients WHERE auth_user_id = v_user_id LIMIT 1;

  IF v_client_id IS NOT NULL AND v_existing_trainer IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'already_exists');
  END IF;

  IF v_client_id IS NULL THEN
    -- Coachless until the coach accepts (respond_coach_request) or the
    -- athlete arrives through an invite (accept_invite). Attaching here
    -- put a stranger on any coach's roster, uninvited and unaccepted.
    INSERT INTO public.clients (name, email, phone, trainer_id, auth_user_id, status)
    VALUES (COALESCE(NULLIF(p_name, ''), 'Athlete'), NULLIF(LOWER(p_email), ''), NULLIF(p_phone, ''), NULL, v_user_id, 'solo')
    RETURNING id INTO v_client_id;
  END IF;

  RETURN public.request_coach(p_trainer_id, '{}'::jsonb, NULL, p_name, p_email);
END;
$function$;

-- ── 6. Server-only helpers stay server-only ────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, public.audit_severity, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cohort_member_count(uuid) FROM anon;

-- ── 7. Public buckets serve by URL; nobody needs to list them ───────────────
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
