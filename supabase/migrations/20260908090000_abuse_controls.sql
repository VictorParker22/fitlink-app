-- 2026-09-08 — abuse and cost controls at the database.
--
-- PostgREST hands the caller's address to SQL (request.headers →
-- x-forwarded-for; probed 2026-09-08), so anonymous routes can be limited
-- per IP inside the database, and signed-in writes per account, without a
-- function in front of every table.
--
--   1. request_ip()            — the caller's address, or NULL off the API.
--   2. rate_limit_writes()     — a BEFORE INSERT trigger: N rows per window
--                                per account (or per IP when anonymous).
--                                Attached to messages, notifications,
--                                conversations, coach_reports,
--                                live_class_messages, waitlist_signups.
--   3. waitlist_signups        — one row per address; a repeat is a no-op.
--   4. lookup_client_by_contact, invite_public — 30 per hour per IP when
--                                called from the API as anon/authenticated.
--   5. request_coach           — 10 per day per athlete (request → cancel →
--                                request churn spammed coaches' inboxes).
--   6. Storage buckets         — size and MIME limits on every bucket that
--                                had none.
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908090000_abuse_controls.sql

DROP FUNCTION IF EXISTS public.request_ip_probe();

-- ── 1. Who is calling ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_ip()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT NULLIF(btrim(split_part(
    COALESCE(current_setting('request.headers', true)::json->>'x-forwarded-for',
             current_setting('request.headers', true)::json->>'cf-connecting-ip', ''), ',', 1)), '');
$function$;
REVOKE EXECUTE ON FUNCTION public.request_ip() FROM PUBLIC, anon, authenticated;

/** 'anon' | 'authenticated' | 'service_role' | NULL (direct connection). */
CREATE OR REPLACE FUNCTION public.request_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'role', '');
$function$;
REVOKE EXECUTE ON FUNCTION public.request_role() FROM PUBLIC, anon, authenticated;

-- ── 2. Write floods ──────────────────────────────────────────────────────────
-- TG_ARGV: bucket, limit, window_seconds. Privileged connections pass.
CREATE OR REPLACE FUNCTION public.rate_limit_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := public.request_role();
  v_key text;
  v_ok boolean;
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  v_key := COALESCE(auth.uid()::text, 'ip:' || COALESCE(public.request_ip(), 'unknown'));
  v_ok := public.check_key_rate_limit(v_key, 'w:' || TG_TABLE_NAME || ':' || TG_ARGV[0], TG_ARGV[1]::int, TG_ARGV[2]::int);
  IF NOT v_ok THEN
    RAISE EXCEPTION 'rate_limited: too many % in a short time', TG_TABLE_NAME
      USING ERRCODE = 'P0001', HINT = 'Try again in a while.';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.rate_limit_writes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_rate_messages_hour ON public.messages;
CREATE TRIGGER trg_rate_messages_hour BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('hour', '300', '3600');
DROP TRIGGER IF EXISTS trg_rate_messages_day ON public.messages;
CREATE TRIGGER trg_rate_messages_day BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('day', '2000', '86400');

DROP TRIGGER IF EXISTS trg_rate_notifications_hour ON public.notifications;
CREATE TRIGGER trg_rate_notifications_hour BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('hour', '120', '3600');

DROP TRIGGER IF EXISTS trg_rate_conversations_day ON public.conversations;
CREATE TRIGGER trg_rate_conversations_day BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('day', '50', '86400');

DROP TRIGGER IF EXISTS trg_rate_coach_reports_day ON public.coach_reports;
CREATE TRIGGER trg_rate_coach_reports_day BEFORE INSERT ON public.coach_reports
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('day', '5', '86400');

DROP TRIGGER IF EXISTS trg_rate_live_chat_hour ON public.live_class_messages;
CREATE TRIGGER trg_rate_live_chat_hour BEFORE INSERT ON public.live_class_messages
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('hour', '300', '3600');

DROP TRIGGER IF EXISTS trg_rate_waitlist_hour ON public.waitlist_signups;
CREATE TRIGGER trg_rate_waitlist_hour BEFORE INSERT ON public.waitlist_signups
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('hour', '5', '3600');

-- ── 3. One waitlist row per address ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.waitlist_dedupe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  IF EXISTS (SELECT 1 FROM public.waitlist_signups w WHERE lower(w.email) = NEW.email) THEN
    RETURN NULL;  -- already on the list: a quiet no-op, not an error the form has to explain
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.waitlist_dedupe() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_waitlist_dedupe ON public.waitlist_signups;
CREATE TRIGGER trg_waitlist_dedupe BEFORE INSERT ON public.waitlist_signups
  FOR EACH ROW EXECUTE FUNCTION public.waitlist_dedupe();

-- ── 4. Anonymous lookups: 30 an hour per address ────────────────────────────
CREATE OR REPLACE FUNCTION public.api_rate_ok(p_bucket text, p_limit integer, p_window integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := public.request_role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('anon', 'authenticated') THEN
    RETURN true;  -- edge functions with the service role carry their own limits
  END IF;
  RETURN public.check_key_rate_limit(
    COALESCE(auth.uid()::text, 'ip:' || COALESCE(public.request_ip(), 'unknown')),
    p_bucket, p_limit, p_window);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.api_rate_ok(text, integer, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.lookup_client_by_contact(contact_value text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result json;
  v_contact text := LEFT(btrim(COALESCE(contact_value, '')), 200);
BEGIN
  IF v_contact = '' THEN
    RETURN json_build_object('found', false);
  END IF;
  IF NOT public.api_rate_ok('lookup_client_by_contact', 30, 3600) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', HINT = 'Too many lookups. Try again in an hour.';
  END IF;

  SELECT json_build_object(
           'found', true,
           'trainer_name', split_part(COALESCE(t.name, ''), ' ', 1),
           'has_account', (c.auth_user_id IS NOT NULL)
         )
    INTO result
    FROM public.clients c
    LEFT JOIN public.trainers t ON t.id = c.trainer_id
   WHERE lower(c.email) = lower(v_contact)
      OR c.phone = v_contact
   LIMIT 1;

  RETURN coalesce(result, json_build_object('found', false));
END;
$function$;

CREATE OR REPLACE FUNCTION public.invite_public(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv public.invites;
  v_class public.live_classes;
  v_coach jsonb;
  v_live jsonb;
  v_expired boolean;
BEGIN
  IF length(v_code) <> 6 THEN
    RETURN NULL;
  END IF;
  -- STABLE functions may not write, so the limiter runs in its own definer
  -- (VOLATILE) function; a refusal surfaces as an error, not a NULL card.
  IF NOT public.api_rate_ok('invite_public', 30, 3600) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001', HINT = 'Too many lookups. Try again in an hour.';
  END IF;

  SELECT * INTO v_inv FROM public.invites WHERE code = v_code;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_expired := now() > v_inv.expires_at OR v_inv.status IN ('revoked', 'expired');

  SELECT jsonb_build_object(
           'id', tp.id,
           'name', tp.name,
           'avatar_url', tp.avatar_url,
           'specialization', tp.specialization,
           'specializations', to_jsonb(tp.specializations),
           'bio', tp.bio)
    INTO v_coach
    FROM public.trainers_public tp
   WHERE tp.id = v_inv.trainer_id;

  IF v_inv.kind = 'live' THEN
    SELECT * INTO v_class FROM public.live_classes WHERE id = v_inv.live_class_id;
    IF v_class.id IS NULL OR v_class.status IN ('ended', 'cancelled') THEN
      v_expired := true;
    END IF;
    v_live := jsonb_build_object(
      'class_id', v_inv.live_class_id,
      'title', v_class.title,
      'status', v_class.status,
      'playback_id', CASE WHEN v_class.status = 'live' THEN v_class.mux_playback_id ELSE NULL END,
      'went_live_at', v_class.went_live_at);
  END IF;

  RETURN jsonb_build_object(
           'kind', v_inv.kind,
           'code', v_inv.code,
           'expired', v_expired,
           'coach', v_coach)
         || CASE WHEN v_inv.kind = 'live' THEN jsonb_build_object('live', v_live) ELSE '{}'::jsonb END;
END;
$function$;
-- invite_public was STABLE; it now calls a VOLATILE limiter.
ALTER FUNCTION public.invite_public(text) VOLATILE;

-- ── 5. Coach requests: ten a day ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_coach(p_trainer_id uuid, p_intake jsonb DEFAULT '{}'::jsonb, p_message text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Request → cancel → request in a loop wrote a conversation, a message and
  -- a notification to a coach every time. Ten a day is more than any honest
  -- athlete needs.
  IF NOT public.check_key_rate_limit(v_user_id::text, 'request_coach:day', 10, 86400) THEN
    RETURN json_build_object('success', false, 'reason', 'rate_limited');
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
           || jsonb_build_object(
                'intake',
                CASE WHEN jsonb_typeof(assessment_data->'intake') = 'object'
                     THEN assessment_data->'intake'
                     ELSE '{}'::jsonb END
                || COALESCE(p_intake, '{}'::jsonb)
                || '{"source":"marketplace"}'::jsonb)
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
$function$;

-- ── 6. Uploads: every bucket has a ceiling and a type list ──────────────────
UPDATE storage.buckets SET file_size_limit = 5242880,  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic'] WHERE id = 'avatars';
UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/gif'] WHERE id = 'chat-attachments';
UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic'] WHERE id = 'diet-images';
UPDATE storage.buckets SET file_size_limit = 15728640, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic'] WHERE id = 'progress-photos';
UPDATE storage.buckets SET file_size_limit = 209715200, allowed_mime_types = ARRAY['video/mp4','video/quicktime','video/x-m4v','video/webm'] WHERE id = 'exercise-videos';
UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/gif','image/webp','image/png','image/jpeg'] WHERE id = 'exercise-gifs';
UPDATE storage.buckets SET file_size_limit = 5242880,  allowed_mime_types = ARRAY['audio/mpeg'] WHERE id = 'exercise-audio';
