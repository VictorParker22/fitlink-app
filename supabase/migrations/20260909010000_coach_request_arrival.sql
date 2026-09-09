-- A coaching request reaches the coach (2026-09-09, canvas "Coach Request Arrival").
--
-- Before: request_coach wrote a notification with no metadata ("Accept or
-- decline from Clients"), nothing pushed it to the phone, the Notifications
-- row was not tappable, and the only place to answer was a row in Clients.
--
-- 1. request_coach's notification carries client_id, the in-app route
--    (/request/<client_id>) and the intake summary the push and the row show.
-- 2. notify_push_on_notification: AFTER INSERT on notifications, posts the row
--    to send-push-notification through pg_net with a hook secret from Vault
--    (`notify_hook_secret`, set with store_platform_secret and mirrored as the
--    function's NOTIFY_HOOK_SECRET) in an x-notify-hook header; the bearer is
--    the public anon key (Vault `supabase_anon_key`) so the gateway's JWT check
--    passes. The function resolves the coach's token
--    with the service role. 'message' rows are skipped: the chat screens push
--    those themselves. A push failure never fails the insert.
--    Definer, postgres-owned, not callable over RPC.

CREATE OR REPLACE FUNCTION public.request_coach(
  p_trainer_id uuid,
  p_intake jsonb DEFAULT '{}'::jsonb,
  p_message text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_id uuid;
  v_trainer uuid;
  v_requested uuid;
  v_conv_id uuid;
  v_name text;
  v_summary text;
  v_days text;
  v_setting text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_trainer_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.trainers WHERE id = p_trainer_id) THEN
    RETURN json_build_object('success', false, 'reason', 'no_such_coach');
  END IF;

  SELECT id, trainer_id, requested_trainer_id, name
    INTO v_client_id, v_trainer, v_requested, v_name
    FROM public.clients WHERE auth_user_id = v_user_id LIMIT 1;

  IF v_trainer IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'already_coached');
  END IF;
  IF v_requested IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'already_pending', 'requested_trainer_id', v_requested);
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (name, email, trainer_id, auth_user_id, status)
    VALUES (COALESCE(NULLIF(p_name, ''), 'Athlete'), NULLIF(LOWER(p_email), ''), NULL, v_user_id, 'solo')
    RETURNING id, name INTO v_client_id, v_name;
  END IF;

  UPDATE public.clients
     SET requested_trainer_id = p_trainer_id,
         coach_requested_at = now(),
         name = COALESCE(NULLIF(p_name, ''), name),
         email = COALESCE(NULLIF(LOWER(p_email), ''), email),
         assessment_data = COALESCE(assessment_data, '{}'::jsonb)
           || jsonb_build_object('intake', COALESCE(p_intake, '{}'::jsonb) || '{"source":"marketplace"}'::jsonb)
   WHERE id = v_client_id
   RETURNING name INTO v_name;

  SELECT id INTO v_conv_id FROM public.conversations
   WHERE client_id = v_client_id AND trainer_id = p_trainer_id LIMIT 1;
  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (client_id, trainer_id)
    VALUES (v_client_id, p_trainer_id) RETURNING id INTO v_conv_id;
  END IF;
  IF NULLIF(p_message, '') IS NOT NULL THEN
    INSERT INTO public.messages (conversation_id, sender_type, content)
    VALUES (v_conv_id, 'client', LEFT(p_message, 4000));
    BEGIN
      PERFORM public.increment_conversation_unread(v_conv_id, LEFT(p_message, 4000));
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.conversations SET last_message = LEFT(p_message, 4000), last_message_at = now() WHERE id = v_conv_id;
    END;
  END IF;

  -- The one line every surface shows: goal · days · setting, from the
  -- athlete's own answers (clamped; the intake is athlete-written).
  v_days := CASE
    WHEN jsonb_typeof(p_intake->'training_days') = 'array' AND jsonb_array_length(p_intake->'training_days') > 0
      THEN (SELECT string_agg(initcap(LEFT(d, 3)), ' · ') FROM jsonb_array_elements_text(p_intake->'training_days') d)
    WHEN (p_intake->>'days') ~ '^[0-9]+$' THEN (p_intake->>'days') || ' days a week'
    ELSE NULL END;
  v_setting := CASE COALESCE(p_intake->>'setting', p_intake->>'location')
    WHEN 'gym' THEN 'Gym' WHEN 'home' THEN 'Home' WHEN 'outdoors' THEN 'Outdoors'
    WHEN 'coach_location' THEN 'Coach''s studio' WHEN 'flexible' THEN 'Anywhere' ELSE NULL END;
  v_summary := concat_ws(' · ', NULLIF(LEFT(p_intake->>'goal', 80), ''), v_days, v_setting);

  BEGIN
    INSERT INTO public.notifications (trainer_id, type, title, description, is_read, metadata)
    VALUES (p_trainer_id, 'coach_request',
            LEFT(COALESCE(v_name, 'An athlete'), 60) || ' wants to train with you',
            CASE WHEN v_summary <> '' THEN v_summary || '. ' ELSE '' END || 'Read their note and answer.',
            false,
            jsonb_build_object('client_id', v_client_id, 'url', '/request/' || v_client_id::text, 'summary', v_summary));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_coach: notification insert failed: %', SQLERRM;
  END;

  RETURN json_build_object('success', true, 'client_id', v_client_id, 'conversation_id', v_conv_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_coach(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_coach(uuid, jsonb, text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- Every notification row becomes a push, from the database.
-- ------------------------------------------------------------
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
BEGIN
  IF NEW.trainer_id IS NULL OR NEW.type = 'message' THEN
    RETURN NEW;
  END IF;
  BEGIN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'notify_hook_secret' LIMIT 1;
    -- The gateway verifies the bearer as a JWT, so the public anon key rides
    -- there and the hook secret in its own header (the function checks it).
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
      body := jsonb_build_object(
        'toTrainerId', NEW.trainer_id,
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

DROP TRIGGER IF EXISTS trg_notify_push ON public.notifications;
CREATE TRIGGER trg_notify_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_notification();
