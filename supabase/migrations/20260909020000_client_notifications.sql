-- Athletes get notifications too (2026-09-09).
--
-- notifications had only trainer_id: an athlete had no inbox and no push for
-- anything except a chat message. Now a row names EITHER recipient; the
-- athlete reads and marks their own rows; the push bridge sends to whichever
-- side the row names; and the moments that matter to an athlete write one:
--   - the coach answers their request (respond_coach_request: accepted / declined)
--   - the coach assigns a session (client_workouts by a coach; one row per
--     15 minutes so assigning a week is one notice, not seven)
--   - a meal plan lands (client_diets for a coach's plan)
--   - a session is booked (sessions, unless the athlete booked it themselves)
--   - a paid pass puts them on a roster (_shared/enrollment.ts, service role)
-- Every writer is the server (definer triggers / RPCs); guard_notification_insert
-- keeps ordinary roles to the athlete→coach types, and a coach may write only
-- the assignment types into their own athletes' inboxes.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ALTER COLUMN trainer_id DROP NOT NULL;
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_recipient;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_recipient CHECK (trainer_id IS NOT NULL OR client_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS notifications_client_id_idx ON public.notifications (client_id, created_at DESC);
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['message','score','water','workout','nutrition','file','coach_request','new_client','invite_accepted','client_left','cohort_over_capacity','pass_purchased','coach_accepted','coach_declined','session']));

-- ── Row security: each side reads and marks its own rows ─────────────────────
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    trainer_id = (SELECT auth.uid())
    OR client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS notifications_update ON public.notifications;
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    trainer_id = (SELECT auth.uid())
    OR client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    trainer_id = (SELECT auth.uid())
    OR client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE TO authenticated
  USING (
    trainer_id = (SELECT auth.uid())
    OR client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    -- a coach's own inbox, or an athlete writing into their coach's inbox
    trainer_id = (SELECT auth.uid())
    OR trainer_id IN (SELECT c.trainer_id FROM public.clients c WHERE c.auth_user_id = (SELECT auth.uid()))
    -- a coach writing into one of their own athletes' inboxes
    OR client_id IN (SELECT c.id FROM public.clients c WHERE c.trainer_id = (SELECT auth.uid()))
  );

-- ── Guard: who may write which type where ────────────────────────────────────
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
  IF NEW.client_id IS NOT NULL THEN
    -- Into an athlete's inbox: only their coach, only the assignment types.
    IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.trainer_id = v_uid) THEN
      RAISE EXCEPTION 'an athlete''s notifications are written by their coach or the server'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.type IS NULL OR NEW.type NOT IN ('workout', 'nutrition', 'file', 'message', 'session') THEN
      RAISE EXCEPTION 'that notification type is written by the server'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.is_read := false;
  ELSIF v_uid IS NOT NULL AND NEW.trainer_id IS DISTINCT FROM v_uid THEN
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

-- ── Push bridge: whichever side the row names ────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_secret text;
  v_anon text;
  v_url text;
  v_to jsonb;
BEGIN
  IF NEW.type = 'message' THEN
    RETURN NEW;
  END IF;
  IF NEW.client_id IS NOT NULL THEN
    v_to := jsonb_build_object('toClientId', NEW.client_id);
  ELSIF NEW.trainer_id IS NOT NULL THEN
    v_to := jsonb_build_object('toTrainerId', NEW.trainer_id);
  ELSE
    RETURN NEW;
  END IF;
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_hook_secret' LIMIT 1;
    SELECT decrypted_secret INTO v_anon FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key' LIMIT 1;
    IF v_secret IS NULL OR v_anon IS NULL THEN
      RETURN NEW;
    END IF;
    v_url := COALESCE(NEW.metadata->>'url', '/notifications');
    IF v_url !~ '^/[A-Za-z0-9/_()\-]*$' THEN
      v_url := '/notifications';
    END IF;
    PERFORM net.http_post(
      url := 'https://qcmtaskhyhwzyoegtfpw.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_anon, 'apikey', v_anon, 'x-notify-hook', v_secret),
      body := v_to || jsonb_build_object(
        'title', LEFT(NEW.title, 120),
        'body', LEFT(NEW.description, 240),
        'data', jsonb_build_object('url', v_url, 'type', NEW.type, 'notification_id', NEW.id)
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_push_on_notification: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_push_on_notification() FROM PUBLIC, anon, authenticated;

-- ── The coach answered (accepted / declined) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_coach_request(p_client_id uuid, p_accept boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_trainer uuid := auth.uid();
  v_requested uuid;
  v_existing uuid;
  v_conv_id uuid;
  v_first text;
  v_line text;
BEGIN
  IF v_trainer IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT requested_trainer_id, trainer_id INTO v_requested, v_existing
    FROM public.clients WHERE id = p_client_id;
  IF v_requested IS NULL OR v_requested <> v_trainer THEN
    RETURN json_build_object('success', false, 'reason', 'not_your_request');
  END IF;
  IF v_existing IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'already_coached');
  END IF;

  SELECT split_part(COALESCE(t.name, ''), ' ', 1) INTO v_first FROM public.trainers t WHERE t.id = v_trainer;
  v_first := COALESCE(NULLIF(v_first, ''), 'Your coach');

  IF p_accept THEN
    UPDATE public.clients
       SET trainer_id = v_trainer,
           requested_trainer_id = NULL,
           coach_accepted_at = now(),
           status = 'trial'
     WHERE id = p_client_id;

    v_line := 'I''ve taken you on. From here your sessions come from me — I''ll set up your first week shortly. Anything your corner built stays in your history.';
    SELECT id INTO v_conv_id FROM public.conversations WHERE client_id = p_client_id AND trainer_id = v_trainer LIMIT 1;
    IF v_conv_id IS NULL THEN
      INSERT INTO public.conversations (client_id, trainer_id) VALUES (p_client_id, v_trainer) RETURNING id INTO v_conv_id;
    END IF;
    INSERT INTO public.messages (conversation_id, sender_type, content) VALUES (v_conv_id, 'trainer', v_line);
    UPDATE public.conversations SET last_message = v_line, last_message_at = now() WHERE id = v_conv_id;

    BEGIN
      INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
      VALUES (p_client_id, 'coach_accepted', v_first || ' took you on',
              'Your sessions now come from ' || v_first || '. Your first week lands on Home.',
              false, jsonb_build_object('url', '/(client-tabs)/', 'trainer_id', v_trainer));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'respond_coach_request: athlete notification failed: %', SQLERRM;
    END;
  ELSE
    UPDATE public.clients SET requested_trainer_id = NULL, coach_requested_at = NULL, coach_declined_at = now(), coach_declined_by = v_trainer WHERE id = p_client_id;
    BEGIN
      INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
      VALUES (p_client_id, 'coach_declined', v_first || ' can''t take you on right now',
              'There are plenty of other coaches on FitLink worth a look.',
              false, jsonb_build_object('url', '/(client-tabs)/find-coach', 'trainer_id', v_trainer));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'respond_coach_request: athlete notification failed: %', SQLERRM;
    END;
  END IF;

  RETURN json_build_object('success', true, 'accepted', p_accept);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.respond_coach_request(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.respond_coach_request(uuid, boolean) TO authenticated;

-- ── A coach assigned a session ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_client_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_first text;
  v_workout text;
BEGIN
  IF NEW.trainer_id IS NULL OR NEW.client_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Assigning a week is one notice, not seven.
  IF EXISTS (SELECT 1 FROM public.notifications n WHERE n.client_id = NEW.client_id AND n.type = 'workout' AND n.created_at > now() - interval '15 minutes') THEN
    RETURN NEW;
  END IF;
  SELECT split_part(COALESCE(t.name, ''), ' ', 1) INTO v_first FROM public.trainers t WHERE t.id = NEW.trainer_id;
  SELECT w.name INTO v_workout FROM public.workouts w WHERE w.id = NEW.workout_id;
  BEGIN
    INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
    VALUES (NEW.client_id, 'workout',
            'New session from ' || COALESCE(NULLIF(v_first, ''), 'your coach'),
            COALESCE(LEFT(v_workout, 80), 'A session') || CASE WHEN NEW.assigned_date IS NOT NULL THEN ' · ' || to_char(NEW.assigned_date, 'Dy DD Mon') ELSE '' END,
            false, jsonb_build_object('url', '/(client-tabs)/workouts', 'client_workout_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_on_assignment: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_client_on_assignment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_client_assignment ON public.client_workouts;
CREATE TRIGGER trg_notify_client_assignment
  AFTER INSERT ON public.client_workouts
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_assignment();

-- ── A coach's meal plan landed ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_client_on_diet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_first text;
  v_plan text;
  v_trainer uuid;
BEGIN
  SELECT d.name, d.trainer_id INTO v_plan, v_trainer FROM public.diet_plans d WHERE d.id = NEW.diet_plan_id;
  IF v_trainer IS NULL THEN
    RETURN NEW; -- the corner's own plan: the corner already says so
  END IF;
  SELECT split_part(COALESCE(t.name, ''), ' ', 1) INTO v_first FROM public.trainers t WHERE t.id = v_trainer;
  BEGIN
    INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
    VALUES (NEW.client_id, 'nutrition',
            'New meal plan from ' || COALESCE(NULLIF(v_first, ''), 'your coach'),
            COALESCE(LEFT(v_plan, 80), 'Your plan') || ' is on your Food tab.',
            false, jsonb_build_object('url', '/(client-tabs)/my-diet', 'diet_plan_id', NEW.diet_plan_id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_on_diet: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_client_on_diet() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_client_diet ON public.client_diets;
CREATE TRIGGER trg_notify_client_diet
  AFTER INSERT ON public.client_diets
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_diet();

-- ── A session was booked ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_client_on_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_first text;
  v_athlete_uid uuid;
BEGIN
  IF NEW.client_id IS NULL OR NEW.trainer_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT auth_user_id INTO v_athlete_uid FROM public.clients WHERE id = NEW.client_id;
  IF v_athlete_uid IS NOT NULL AND v_athlete_uid = auth.uid() THEN
    RETURN NEW; -- the athlete booked it themselves
  END IF;
  SELECT split_part(COALESCE(t.name, ''), ' ', 1) INTO v_first FROM public.trainers t WHERE t.id = NEW.trainer_id;
  BEGIN
    INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
    VALUES (NEW.client_id, 'session',
            'Session booked with ' || COALESCE(NULLIF(v_first, ''), 'your coach'),
            COALESCE(NEW.type, 'Session') || ' · ' || to_char(NEW.date, 'Dy DD Mon, HH24:MI'),
            false, jsonb_build_object('url', '/(client-tabs)/my-sessions', 'session_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_on_session: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_client_on_session() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_notify_client_session ON public.sessions;
CREATE TRIGGER trg_notify_client_session
  AFTER INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.notify_client_on_session();

NOTIFY pgrst, 'reload schema';
