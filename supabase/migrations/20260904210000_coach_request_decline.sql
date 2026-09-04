-- ============================================================
-- A declined coach request should be visible to the athlete for a while,
-- not just vanish. respond_coach_request(false) stamps the decline; the
-- home shows one honest line for a week; a new request clears it.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS coach_declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS coach_declined_by uuid REFERENCES public.trainers(id) ON DELETE SET NULL;

REVOKE UPDATE (coach_declined_at, coach_declined_by) ON public.clients FROM authenticated;

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

  IF p_accept THEN
    -- Roster-cap triggers fire on this UPDATE; a full roster raises here.
    UPDATE public.clients
       SET trainer_id = v_trainer,
           requested_trainer_id = NULL,
           coach_accepted_at = now(),
           coach_declined_at = NULL,
           coach_declined_by = NULL,
           status = 'trial'
     WHERE id = p_client_id;

    v_line := 'I''ve taken you on. From here your sessions come from me — I''ll set up your first week shortly. Anything your corner built stays in your history.';
    SELECT id INTO v_conv_id FROM public.conversations WHERE client_id = p_client_id AND trainer_id = v_trainer LIMIT 1;
    IF v_conv_id IS NULL THEN
      INSERT INTO public.conversations (client_id, trainer_id) VALUES (p_client_id, v_trainer) RETURNING id INTO v_conv_id;
    END IF;
    INSERT INTO public.messages (conversation_id, sender_type, content) VALUES (v_conv_id, 'trainer', v_line);
    UPDATE public.conversations SET last_message = v_line, last_message_at = now() WHERE id = v_conv_id;
  ELSE
    UPDATE public.clients
       SET requested_trainer_id = NULL,
           coach_requested_at = NULL,
           coach_declined_at = now(),
           coach_declined_by = v_trainer
     WHERE id = p_client_id;
  END IF;

  RETURN json_build_object('success', true, 'accepted', p_accept);
END;
$$;

-- A fresh request clears the old decline.
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
         coach_declined_at = NULL,
         coach_declined_by = NULL,
         name = COALESCE(NULLIF(p_name, ''), name),
         email = COALESCE(NULLIF(LOWER(p_email), ''), email),
         assessment_data = COALESCE(assessment_data, '{}'::jsonb)
           || jsonb_build_object('intake', COALESCE(p_intake, '{}'::jsonb) || '{"source":"marketplace"}'::jsonb)
   WHERE id = v_client_id;

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

  BEGIN
    INSERT INTO public.notifications (trainer_id, type, title, description, is_read)
    VALUES (p_trainer_id, 'coach_request', 'Coaching request',
            COALESCE(v_name, 'An athlete') || ' asked to train with you. Accept or decline from Clients.', false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'request_coach: notification insert failed: %', SQLERRM;
  END;

  RETURN json_build_object('success', true, 'client_id', v_client_id, 'conversation_id', v_conv_id);
END;
$$;
