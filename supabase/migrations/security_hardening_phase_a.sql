-- ============================================================
-- Security hardening, Phase A (.agents/SECURITY_FIX_PLAN.md)
--
-- Root cause for everything below: the anon key ships inside the app
-- binary, every policy is written for role `public` (which includes
-- `anon`), and every SECURITY DEFINER function is EXECUTE-able by
-- `anon`. So a `USING(true)` policy or an unguarded DEFINER function is
-- reachable by anyone who unzips the APK.
--
-- NOT done here, deliberately: revoking the blanket table DML grants
-- from anon/authenticated. That is the documented Supabase setup — RLS
-- is the intended gate — and revoking it would break the whole app.
-- The fix is surgical.
--
-- Re-runnable.
-- ============================================================


-- ── A1. Account takeover: link_client_to_auth_user ──────────────────
-- WAS: p_email/p_phone were free RPC parameters, never compared to the
-- caller. An attacker signed up as themselves, then called this with a
-- victim's email and got auth.uid() written into the victim's clients
-- row — inheriting their assessment_data, check-ins, health snapshots,
-- meal/workout logs, gym visits, progress photos, and the full message
-- thread with their coach, including the ability to send AS them.
--
-- NOW: the contact must match the caller's own JWT.
--
-- IMPORTANT — this check is necessary but not sufficient on its own:
-- if email confirmation is disabled in Supabase Auth, an attacker can
-- obtain a JWT carrying a victim's address without controlling the
-- mailbox, and the comparison passes. EMAIL CONFIRMATION MUST BE ON.
CREATE OR REPLACE FUNCTION public.link_client_to_auth_user(
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id   uuid := auth.uid();
  v_jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_client_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Already linked to some client row — never re-point an auth user.
  IF EXISTS (SELECT 1 FROM public.clients WHERE auth_user_id = v_user_id) THEN
    RETURN json_build_object('success', true, 'already_linked', true);
  END IF;

  IF p_email IS NOT NULL THEN
    -- The caller must BE this email.
    IF lower(p_email) <> v_jwt_email THEN
      RETURN json_build_object('success', false, 'error', 'Contact does not match your account');
    END IF;

    UPDATE public.clients
       SET auth_user_id = v_user_id
     WHERE lower(email) = lower(p_email)
       AND auth_user_id IS NULL
    RETURNING id INTO v_client_id;

  ELSIF p_phone IS NOT NULL THEN
    -- Phone signups authenticate as `{digits}@fitlink.phone` (see
    -- app/(auth)/client-signup.tsx), so the JWT email encodes the phone.
    -- Compare digits only — the stored value may carry +, spaces or dashes.
    IF regexp_replace(v_jwt_email, '@fitlink\.phone$', '') IS DISTINCT FROM
       regexp_replace(p_phone, '[^0-9]', '', 'g')
    THEN
      RETURN json_build_object('success', false, 'error', 'Contact does not match your account');
    END IF;

    UPDATE public.clients
       SET auth_user_id = v_user_id
     WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
           = regexp_replace(p_phone, '[^0-9]', '', 'g')
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


-- ── A2. PII oracle: lookup_client_by_contact ────────────────────────
-- Must stay anon-callable — it runs BEFORE signup to answer "did a coach
-- already add you?" (app/(auth)/client-signup.tsx). So it cannot require
-- auth. What it CAN stop doing is handing back data the caller did not
-- already have: it returned client_email and client_phone, neither of
-- which the signup screen ever reads. Feeding it a breach list turned it
-- into a phone-number harvester over the whole athlete base.
--
-- Residual, accepted for now: found/has_account/client_name/trainer_name
-- are what the flow genuinely needs, so a caller who already knows an
-- address still learns whether that person is a FitLink client. Closing
-- that fully means proving control of the contact (email OTP) before
-- answering — a signup redesign, tracked as a follow-up.
CREATE OR REPLACE FUNCTION public.lookup_client_by_contact(contact_value text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
           'found', true,
           'client_name', c.name,
           'trainer_name', t.name,
           'has_account', (c.auth_user_id IS NOT NULL)
         )
    INTO result
    FROM public.clients c
    LEFT JOIN public.trainers t ON t.id = c.trainer_id
   WHERE lower(c.email) = lower(contact_value)
      OR c.phone = contact_value
   LIMIT 1;

  RETURN coalesce(result, json_build_object('found', false));
END;
$function$;


-- ── A3. Health data was world-readable AND world-writable ───────────
-- Policies are OR-combined, so these three USING(true) policies made the
-- correctly-scoped ones ("Clients can manage own snapshots", "Trainers
-- can read client snapshots") decorative. Columns include heart rate,
-- resting HR, blood oxygen, systolic/diastolic BP, weight.
DROP POLICY IF EXISTS select_health_snapshots ON public.client_health_snapshots;
DROP POLICY IF EXISTS insert_health_snapshots ON public.client_health_snapshots;
DROP POLICY IF EXISTS update_health_snapshots ON public.client_health_snapshots;


-- ── A4. "Service role" policies that actually granted write to public ─
-- The service role BYPASSES RLS and never needed a policy. Their only
-- effect was granting INSERT/UPDATE to anon+authenticated with a `true`
-- predicate: anyone could PATCH themselves an active subscription
-- (bypassing Stripe entirely) or forge succeeded payment rows, which the
-- coach earnings screens then read as real money.
DROP POLICY IF EXISTS "Service role can insert client_subscriptions" ON public.client_subscriptions;
DROP POLICY IF EXISTS "Service role can update client_subscriptions" ON public.client_subscriptions;
DROP POLICY IF EXISTS "Service role can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Service role can update payments" ON public.payments;


-- ── A5. Message-thread injection: increment_conversation_unread ─────
-- WAS: no caller check at all. Anyone could write arbitrary text as the
-- inbox preview of any coach↔athlete thread, attributed to the other
-- party, with an unread badge — and with NO row in `messages` to audit
-- against. That is a phishing primitive inside a trusted thread, and a
-- direct violation of INVARIANTS §4 (never show what was not stored).
CREATE OR REPLACE FUNCTION public.increment_conversation_unread(
  conv_id uuid,
  new_last_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Caller must be one of the two participants.
  IF NOT EXISTS (
    SELECT 1
      FROM public.conversations c
      LEFT JOIN public.clients cl ON cl.id = c.client_id
     WHERE c.id = conv_id
       AND (c.trainer_id = auth.uid() OR cl.auth_user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not a participant in this conversation';
  END IF;

  UPDATE public.conversations
     SET unread_count    = unread_count + 1,
         last_message    = new_last_message,
         last_message_at = now()
   WHERE id = conv_id;
END;
$function$;


-- ── A6. Forged coach notifications ──────────────────────────────────
-- "Clients can send notifications" was INSERT WITH CHECK (true) for role
-- public: anon could POST a notification to any coach with attacker-
-- controlled title/description, rendered as a first-party system message.
DROP POLICY IF EXISTS "Clients can send notifications" ON public.notifications;
DROP POLICY IF EXISTS "Authenticated users can send notifications" ON public.notifications;

CREATE POLICY "Participants can send notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    -- A coach may write to themselves...
    trainer_id = auth.uid()
    -- ...and an athlete only to the coach they actually belong to.
    OR trainer_id IN (
      SELECT c.trainer_id FROM public.clients c WHERE c.auth_user_id = auth.uid()
    )
  );


-- ── A7. Live-class message moderation was unscoped ──────────────────
-- UPDATE USING (true) for role public: any user could edit any message
-- in any live class.
DROP POLICY IF EXISTS "Trainer moderation" ON public.live_class_messages;

-- The FK column is `live_class_id`, not `class_id`.
CREATE POLICY "Trainer moderation"
  ON public.live_class_messages FOR UPDATE TO authenticated
  USING (
    live_class_id IN (SELECT lc.id FROM public.live_classes lc WHERE lc.trainer_id = auth.uid())
  );


-- ── A8. Any athlete could wipe the shared exercise-video library ────
-- The DELETE policy checked the bucket and nothing else — no owner, no
-- path. One self-serve signup could loop the (publicly listable) bucket
-- and destroy every coach's exercise media platform-wide, leaving every
-- workout rendering broken URLs.
DROP POLICY IF EXISTS "Trainers can delete exercise videos" ON storage.objects;

CREATE POLICY "Owners delete exercise videos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exercise-videos' AND owner = auth.uid());


-- ── A9. Private chat attachments were anon-enumerable ───────────────
-- The SELECT policy was granted to `public`, so an unauthenticated
-- caller could LIST the bucket and then fetch every file any athlete or
-- coach ever sent in a private thread — body photos, injury photos,
-- medical documents.
--
-- PARTIAL FIX. This stops enumeration. It cannot stop URL-based reads,
-- because the bucket is `public: true` and the CDN serves objects
-- without consulting RLS. The complete fix is a private bucket plus
-- signed URLs, which needs app changes — Phase C3.
DROP POLICY IF EXISTS "Anyone can read chat attachments" ON storage.objects;

CREATE POLICY "Authenticated users read chat attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments');


-- ── A10. Functions that were never meant to be publicly callable ────
-- get_coach_watch_minutes drives the class revenue share; it leaked
-- every coach's monthly engagement (and therefore relative earnings) to
-- any anon caller. Only the edge function, which uses the service role,
-- needs it.
REVOKE EXECUTE ON FUNCTION public.get_coach_watch_minutes(text) FROM anon, authenticated;

-- Internal helpers: trigger/aggregate paths, not client APIs.
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.recalc_class_stats(uuid) FROM anon;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END $$;


-- ── A11. create_client_and_notify wrote phantom columns ─────────────
-- Caller validation here was already correct. But the notification
-- INSERT used `message` and `read`, and the table has `description` and
-- `is_read` — so it failed 42703 on every call and was swallowed by a
-- bare EXCEPTION WHEN OTHERS THEN NULL. No coach has ever received a
-- new-client notification from this path. INVARIANTS §3 + §2 in one
-- statement. The swallow is kept (the signup must not fail because a
-- notification did) but it now logs a warning instead of vanishing.
-- Signature, parameter ORDER, 'trial' status, lowercased email and the
-- already_exists return shape are all preserved EXACTLY as live. Only the
-- two phantom column names change (plus the silent swallow becomes a
-- warning). Replacing this with a different parameter order would create
-- a second overload rather than replacing the function.
CREATE OR REPLACE FUNCTION public.create_client_and_notify(
  p_name text,
  p_email text,
  p_trainer_id uuid,
  p_phone text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id UUID;
  v_client_id UUID;
BEGIN
  -- Verify the caller is authenticated
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if this user already has a client row
  IF EXISTS (SELECT 1 FROM public.clients WHERE auth_user_id = v_user_id) THEN
    RETURN json_build_object('success', false, 'reason', 'already_exists');
  END IF;

  -- Insert the client row
  INSERT INTO public.clients (name, email, phone, trainer_id, auth_user_id, status)
  VALUES (p_name, LOWER(p_email), p_phone, p_trainer_id, v_user_id, 'trial')
  RETURNING id INTO v_client_id;

  -- Notify the trainer (non-critical). Columns are `description` and
  -- `is_read` — this used to write `message` and `read`, which do not
  -- exist, so it failed 42703 every time and the bare NULL handler hid it.
  BEGIN
    INSERT INTO public.notifications (trainer_id, type, title, description, is_read)
    VALUES (
      p_trainer_id,
      'new_client',
      'New client',
      p_name || ' just signed up and chose you as their coach',
      false
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_client_and_notify: notification insert failed: %', SQLERRM;
  END;

  RETURN json_build_object('success', true, 'client_id', v_client_id);
END;
$function$;
