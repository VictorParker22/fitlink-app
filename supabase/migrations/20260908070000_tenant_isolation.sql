-- 2026-09-08 — tenant isolation. Cross-user paths found by the authorization
-- review (supabase/security/authz_isolation.sql, run with two users plus an
-- anonymous session; .agents/AUTHZ_REVIEW.md has each finding):
--
--   1. A coach could write into ANY athlete's space: open a conversation,
--      book a session, assign a workout, plant a progress entry or a photo —
--      the INSERT policies only checked trainer_id = the coach, never that the
--      athlete was theirs. The athlete saw all of it (their own SELECT branch).
--   2. Any signed-in user could post into any live class chat under any name
--      ("Coach X: pay here"). Sender name now comes from the database and the
--      poster must be someone who can see the class.
--   3. An athlete's SELECT on trainers returned the coach's full row: push
--      token (Expo pushes need no auth — anyone holding it can phish that
--      phone), Stripe account id, Elite date, email, phone. Athletes now read
--      trainers_public, which gains the one flag checkout needs.
--   4. Coaches' custom meals and exercises were readable by everyone,
--      anonymous included. Library rows stay public; custom rows are visible
--      to their owner and to whoever can see a plan or workout using them.
--   5. Sign-up auto-bound a coach-typed client row to whoever signed up with
--      that email first, even unverified (Auth auto-confirm). Binding now
--      needs a verified contact: a confirmed phone, or an email that was
--      actually confirmed by mail. Invitation codes are the other way in.
--   6. Functions created this session were still EXECUTE-able by PUBLIC (a
--      REVOKE from anon/authenticated does not touch the PUBLIC grant).
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908070000_tenant_isolation.sql

-- ── 1. A coach writes only onto their own roster ────────────────────────────
DROP POLICY IF EXISTS conversations_insert ON public.conversations;
CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    (trainer_id = (select auth.uid())
       AND client_id IN (SELECT c.id FROM public.clients c WHERE c.trainer_id = (select auth.uid())))
    OR
    (client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (select auth.uid()) AND c.trainer_id = conversations.trainer_id))
  );

DROP POLICY IF EXISTS sessions_insert ON public.sessions;
CREATE POLICY sessions_insert ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id = (select auth.uid())
    AND (client_id IS NULL OR client_id IN (SELECT c.id FROM public.clients c WHERE c.trainer_id = (select auth.uid())))
  );

DROP POLICY IF EXISTS client_workouts_insert ON public.client_workouts;
CREATE POLICY client_workouts_insert ON public.client_workouts
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (SELECT c.id FROM public.clients c WHERE c.trainer_id = (select auth.uid()))
    OR client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS workout_logs_insert ON public.workout_logs;
CREATE POLICY workout_logs_insert ON public.workout_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (select auth.uid()))
    OR client_id IN (SELECT c.id FROM public.clients c WHERE c.trainer_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS client_progress_insert ON public.client_progress;
CREATE POLICY client_progress_insert ON public.client_progress
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (SELECT c.id FROM public.clients c WHERE c.auth_user_id = (select auth.uid()))
    OR (trainer_id = (select auth.uid())
        AND client_id IN (SELECT c.id FROM public.clients c WHERE c.trainer_id = (select auth.uid())))
  );

DROP POLICY IF EXISTS pp_trainer_insert ON public.progress_photos;
CREATE POLICY pp_trainer_insert ON public.progress_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    trainer_id = (select auth.uid())
    AND client_id IN (SELECT c.id FROM public.clients c WHERE c.trainer_id = (select auth.uid()))
  );

-- ── 2. Live chat: only people in the room, under their real name ────────────
-- can_view_live_class is called from the policy as the invoker, so
-- authenticated keeps EXECUTE; PUBLIC and anon lose it (part 6).
DROP POLICY IF EXISTS "Insert own messages only" ON public.live_class_messages;
DROP POLICY IF EXISTS live_class_messages_insert ON public.live_class_messages;
CREATE POLICY live_class_messages_insert ON public.live_class_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = (select auth.uid()) AND public.can_view_live_class(live_class_id));

CREATE OR REPLACE FUNCTION public.stamp_live_chat_sender()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := current_user;
  v_privileged boolean := v_role IN ('service_role', 'supabase_admin', 'postgres');
  v_uid uuid := auth.uid();
  v_name text;
BEGIN
  IF v_privileged AND v_uid IS NULL THEN
    RETURN NEW;
  END IF;
  -- The name is whoever is signed in, never the text the phone sent.
  SELECT t.name INTO v_name FROM public.trainers t WHERE t.id = v_uid;
  IF v_name IS NULL THEN
    SELECT c.name INTO v_name FROM public.clients c WHERE c.auth_user_id = v_uid ORDER BY c.created_at LIMIT 1;
  END IF;
  NEW.sender_name := LEFT(COALESCE(NULLIF(btrim(v_name), ''), 'Viewer'), 80);
  NEW.is_pinned := false;
  NEW.is_deleted := false;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.stamp_live_chat_sender() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_stamp_live_chat_sender ON public.live_class_messages;
CREATE TRIGGER trg_stamp_live_chat_sender
  BEFORE INSERT ON public.live_class_messages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_live_chat_sender();

-- ── 3. Athletes read the public coach card, never the private row ───────────
ALTER TABLE public.trainers_public ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sync_trainer_public()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.trainers_public (
    id, name, bio, specialization, specializations, certifications, working_hours,
    avatar_url, cover_url, onboarding_complete, created_at, coaching_mode, training_locations,
    stripe_charges_enabled
  ) VALUES (
    NEW.id, NEW.name, NEW.bio, NEW.specialization, NEW.specializations, NEW.certifications, NEW.working_hours,
    NEW.avatar_url, NEW.cover_url, NEW.onboarding_complete, NEW.created_at, NEW.coaching_mode, NEW.training_locations,
    COALESCE(NEW.stripe_charges_enabled, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    bio = EXCLUDED.bio,
    specialization = EXCLUDED.specialization,
    specializations = EXCLUDED.specializations,
    certifications = EXCLUDED.certifications,
    working_hours = EXCLUDED.working_hours,
    avatar_url = EXCLUDED.avatar_url,
    cover_url = EXCLUDED.cover_url,
    onboarding_complete = EXCLUDED.onboarding_complete,
    created_at = EXCLUDED.created_at,
    coaching_mode = EXCLUDED.coaching_mode,
    training_locations = EXCLUDED.training_locations,
    stripe_charges_enabled = EXCLUDED.stripe_charges_enabled;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_trainer_public ON public.trainers;
CREATE TRIGGER trg_sync_trainer_public
  AFTER INSERT OR UPDATE OF name, bio, specialization, specializations, certifications, working_hours,
    avatar_url, cover_url, onboarding_complete, coaching_mode, training_locations, stripe_charges_enabled
  ON public.trainers
  FOR EACH ROW EXECUTE FUNCTION public.sync_trainer_public();

UPDATE public.trainers_public tp
   SET stripe_charges_enabled = COALESCE(t.stripe_charges_enabled, false)
  FROM public.trainers t
 WHERE t.id = tp.id;

DROP POLICY IF EXISTS trainers_select ON public.trainers;
CREATE POLICY trainers_select ON public.trainers
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid())
    OR (org_id IS NOT NULL AND public.is_org_member(org_id, ARRAY['owner','admin']::public.org_role[]))
  );

-- ── 4. Custom libraries belong to their coach ───────────────────────────────
DROP POLICY IF EXISTS exercises_select ON public.exercises;
CREATE POLICY exercises_select ON public.exercises
  FOR SELECT TO anon, authenticated
  USING (
    COALESCE(is_custom, false) = false
    OR trainer_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.workout_exercises we WHERE we.exercise_id = exercises.id)
  );

DROP POLICY IF EXISTS meals_select ON public.meals;
CREATE POLICY meals_select ON public.meals
  FOR SELECT TO anon, authenticated
  USING (
    COALESCE(is_custom, false) = false
    OR trainer_id = (select auth.uid())
    OR EXISTS (SELECT 1 FROM public.diet_plan_meals dpm WHERE dpm.meal_id = meals.id)
  );

-- ── 5. A contact binds an account only once it is verified ──────────────────
-- Auth auto-confirm stamps email_confirmed_at at sign-up with no mail sent;
-- a real confirmation leaves confirmation_sent_at set too. Phone codes always
-- verify possession.
CREATE OR REPLACE FUNCTION public.contact_verified(p_user auth.users)
 RETURNS TABLE(email_ok boolean, phone_ok boolean)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT
    (p_user.email IS NOT NULL AND p_user.email_confirmed_at IS NOT NULL AND p_user.confirmation_sent_at IS NOT NULL),
    (p_user.phone IS NOT NULL AND p_user.phone_confirmed_at IS NOT NULL);
$function$;
REVOKE EXECUTE ON FUNCTION public.contact_verified(auth.users) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_client_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_email_ok boolean;
  v_phone_ok boolean;
BEGIN
  SELECT email_ok, phone_ok INTO v_email_ok, v_phone_ok FROM public.contact_verified(NEW);
  IF v_email_ok THEN
    UPDATE public.clients SET auth_user_id = NEW.id
     WHERE LOWER(email) = LOWER(NEW.email) AND auth_user_id IS NULL;
  END IF;
  IF v_phone_ok THEN
    UPDATE public.clients SET auth_user_id = NEW.id
     WHERE regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = regexp_replace(NEW.phone, '[^0-9]', '', 'g')
       AND auth_user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_client_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_email_ok boolean;
  v_phone_ok boolean;
BEGIN
  SELECT email_ok, phone_ok INTO v_email_ok, v_phone_ok FROM public.contact_verified(NEW);
  IF v_phone_ok THEN
    UPDATE public.clients SET auth_user_id = NEW.id
     WHERE auth_user_id IS NULL
       AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = regexp_replace(NEW.phone, '[^0-9]', '', 'g');
    IF FOUND THEN RETURN NEW; END IF;
  END IF;
  IF v_email_ok THEN
    UPDATE public.clients SET auth_user_id = NEW.id
     WHERE auth_user_id IS NULL AND LOWER(email) = LOWER(NEW.email);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_link_client_auth_user ON auth.users;
CREATE TRIGGER trg_link_client_auth_user
  AFTER INSERT OR UPDATE OF phone, email, email_confirmed_at, phone_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_client_auth_user();

CREATE OR REPLACE FUNCTION public.link_client_to_auth_user(p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id   uuid := auth.uid();
  v_user      auth.users;
  v_email_ok  boolean;
  v_phone_ok  boolean;
  v_client_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Already linked to some client row — never re-point an auth user.
  IF EXISTS (SELECT 1 FROM public.clients WHERE auth_user_id = v_user_id) THEN
    RETURN json_build_object('success', true, 'already_linked', true);
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = v_user_id;
  SELECT email_ok, phone_ok INTO v_email_ok, v_phone_ok FROM public.contact_verified(v_user);

  IF p_email IS NOT NULL THEN
    IF lower(p_email) <> lower(COALESCE(v_user.email, '')) THEN
      RETURN json_build_object('success', false, 'error', 'Contact does not match your account');
    END IF;
    IF NOT v_email_ok THEN
      RETURN json_build_object('success', false, 'error', 'verify_contact');
    END IF;
    UPDATE public.clients SET auth_user_id = v_user_id
     WHERE lower(email) = lower(p_email) AND auth_user_id IS NULL
    RETURNING id INTO v_client_id;

  ELSIF p_phone IS NOT NULL THEN
    IF regexp_replace(COALESCE(v_user.phone, ''), '[^0-9]', '', 'g') IS DISTINCT FROM regexp_replace(p_phone, '[^0-9]', '', 'g')
       AND regexp_replace(lower(COALESCE(v_user.email, '')), '@fitlink\.phone$', '') IS DISTINCT FROM regexp_replace(p_phone, '[^0-9]', '', 'g') THEN
      RETURN json_build_object('success', false, 'error', 'Contact does not match your account');
    END IF;
    -- A {digits}@fitlink.phone account was created by a phone code; a real
    -- phone column needs phone_confirmed_at.
    IF NOT (v_phone_ok OR lower(COALESCE(v_user.email, '')) LIKE '%@fitlink.phone') THEN
      RETURN json_build_object('success', false, 'error', 'verify_contact');
    END IF;
    UPDATE public.clients SET auth_user_id = v_user_id
     WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
       AND auth_user_id IS NULL
    RETURNING id INTO v_client_id;
  ELSE
    RETURN json_build_object('success', false, 'error', 'No contact provided');
  END IF;

  IF v_client_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No matching invitation found');
  END IF;

  RETURN json_build_object('success', true, 'client_id', v_client_id);
END;
$function$;

-- ── 6. PUBLIC grants on server-only functions ───────────────────────────────
REVOKE EXECUTE ON FUNCTION public.can_view_live_class(uuid) FROM PUBLIC, anon;
-- The chat INSERT policy evaluates this as the signed-in user, so that role
-- needs an explicit grant once the PUBLIC one is gone.
GRANT EXECUTE ON FUNCTION public.can_view_live_class(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_live_class_viewers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_enrollment_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_notification_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_plan_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_went_live_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_client_checkins_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_message_rate_limit() FROM PUBLIC, anon, authenticated;
