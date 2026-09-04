-- ============================================================
-- Coach requests are REQUESTS (2026-09-04).
--
-- Bug: a solo athlete who asked to join a coach was attached to that coach
-- on the spot (clients.trainer_id set by create_client_and_notify). The
-- athlete app keys everything on trainer_id, so the corner's programme
-- vanished and the coach's empty library took its place before the coach
-- had even seen the request.
--
-- Model now:
--   clients.requested_trainer_id  — the coach being asked (pending)
--   clients.coach_requested_at    — when
--   clients.coach_accepted_at     — set by the coach's accept; the app uses
--                                   it to tell the athlete the switch happened
--   clients.trainer_id            — ONLY set by the coach accepting
--
-- Athletes and coaches move between these states through SECURITY DEFINER
-- RPCs; the columns are revoked from direct UPDATE by authenticated users
-- so no client can attach itself to a coach.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS requested_trainer_id uuid REFERENCES public.trainers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coach_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS coach_accepted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_requested_trainer
  ON public.clients(requested_trainer_id) WHERE requested_trainer_id IS NOT NULL;

-- The requested coach may READ the row to review the request. Writes go
-- through respond_coach_request() only.
DROP POLICY IF EXISTS "Requested coach reads the request" ON public.clients;
CREATE POLICY "Requested coach reads the request"
  ON public.clients FOR SELECT TO authenticated
  USING (requested_trainer_id = auth.uid());

-- The requested coach may read the athlete's conversation and messages
-- before accepting (conversations_select keys on trainer_id, which the
-- request RPC sets on the conversation row, so that already works).

-- Guardrail: nobody attaches themselves. Coaches keep status/notes updates.
REVOKE UPDATE (trainer_id, requested_trainer_id, coach_requested_at, coach_accepted_at)
  ON public.clients FROM authenticated;

-- The athlete may read the requested coach's public card.
-- (trainers_public is a view readable by any signed-in user; nothing to add.)

-- ------------------------------------------------------------
-- request_coach: athlete → pending request + intro message + coach notice
-- ------------------------------------------------------------
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
    -- Coachless athlete with no row yet (never opened Solo): create the
    -- self-managed row so the request has somewhere to live.
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
   WHERE id = v_client_id;

  -- One conversation per (client, coach); the intro message lands in it.
  -- Done here because athletes cannot INSERT conversations under RLS — the
  -- old client-side insert failed silently and coaches never saw the note.
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
REVOKE EXECUTE ON FUNCTION public.request_coach(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_coach(uuid, jsonb, text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- cancel_coach_request: athlete withdraws
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_coach_request()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_client_id uuid;
  v_requested uuid;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id, requested_trainer_id INTO v_client_id, v_requested
    FROM public.clients WHERE auth_user_id = v_user_id LIMIT 1;
  IF v_client_id IS NULL OR v_requested IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'nothing_pending');
  END IF;
  UPDATE public.clients SET requested_trainer_id = NULL, coach_requested_at = NULL WHERE id = v_client_id;
  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_coach_request() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_coach_request() TO authenticated;

-- ------------------------------------------------------------
-- respond_coach_request: coach accepts (attaches) or declines
-- ------------------------------------------------------------
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

  IF p_accept THEN
    -- Roster-cap triggers fire on this UPDATE; a full roster raises here.
    UPDATE public.clients
       SET trainer_id = v_trainer,
           requested_trainer_id = NULL,
           coach_accepted_at = now(),
           status = 'trial'
     WHERE id = p_client_id;

    SELECT split_part(COALESCE(t.name, ''), ' ', 1) INTO v_first FROM public.trainers t WHERE t.id = v_trainer;
    v_line := 'I''ve taken you on. From here your sessions come from me — I''ll set up your first week shortly. Anything your corner built stays in your history.';
    SELECT id INTO v_conv_id FROM public.conversations WHERE client_id = p_client_id AND trainer_id = v_trainer LIMIT 1;
    IF v_conv_id IS NULL THEN
      INSERT INTO public.conversations (client_id, trainer_id) VALUES (p_client_id, v_trainer) RETURNING id INTO v_conv_id;
    END IF;
    INSERT INTO public.messages (conversation_id, sender_type, content) VALUES (v_conv_id, 'trainer', v_line);
    UPDATE public.conversations SET last_message = v_line, last_message_at = now() WHERE id = v_conv_id;
  ELSE
    UPDATE public.clients SET requested_trainer_id = NULL, coach_requested_at = NULL WHERE id = p_client_id;
  END IF;

  RETURN json_build_object('success', true, 'accepted', p_accept);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.respond_coach_request(uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.respond_coach_request(uuid, boolean) TO authenticated;

-- ------------------------------------------------------------
-- create_client_and_notify: an EXISTING coachless row (solo athlete) now
-- becomes a pending request instead of an instant attachment, so older
-- app builds get the same semantics. A brand-new signup that picked a
-- coach during onboarding is unchanged.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_client_and_notify(p_name text, p_email text, p_trainer_id uuid, p_phone text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
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

  IF v_client_id IS NOT NULL THEN
    RETURN public.request_coach(p_trainer_id, '{}'::jsonb, NULL, p_name, p_email);
  END IF;

  INSERT INTO public.clients (name, email, phone, trainer_id, auth_user_id, status)
  VALUES (p_name, LOWER(p_email), p_phone, p_trainer_id, v_user_id, 'trial')
  RETURNING id INTO v_client_id;

  BEGIN
    INSERT INTO public.notifications (trainer_id, type, title, description, is_read)
    VALUES (p_trainer_id, 'new_client', 'New client', p_name || ' just signed up and chose you as their coach', false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_client_and_notify: notification insert failed: %', SQLERRM;
  END;

  RETURN json_build_object('success', true, 'client_id', v_client_id);
END;
$$;

-- ------------------------------------------------------------
-- Backfill: marketplace requests that were attached on the spot but never
-- accepted become pending requests again.
-- ------------------------------------------------------------
UPDATE public.clients
   SET requested_trainer_id = trainer_id,
       trainer_id = NULL,
       coach_requested_at = COALESCE(coach_requested_at, created_at)
 WHERE trainer_id IS NOT NULL
   AND status = 'trial'
   AND assessment_data->'intake'->>'source' = 'marketplace'
   AND coach_accepted_at IS NULL;
