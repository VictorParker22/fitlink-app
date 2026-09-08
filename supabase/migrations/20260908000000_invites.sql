-- ============================================================
-- 20260908000000_invites.sql
-- Invitations (2026-09-08).
--
-- A coach hands an athlete a six-character code: either a personal
-- invite (name/contact on the row, private), the coach's STANDING link
-- (no invitee, reused for 30 days at a time), or a pass into one live
-- class (12 hours). The website resolves a code through the invite-info
-- edge function (invite_public + mark_invite_opened, service role); the
-- app accepts it with accept_invite().
--
-- Rules carried over from the rest of the schema:
--   * one permissive policy per table and command, auth.uid() as an
--     initplan `(select auth.uid())` (20260905000000_rls_consolidation);
--   * clients.trainer_id and the coach_* columns are guarded by the
--     guard_entitlement_columns BEFORE UPDATE trigger, which lets a
--     SECURITY DEFINER function through because it runs as the definer
--     (postgres), exactly like respond_coach_request;
--   * a coachless athlete's row is created by ensure_solo_client(), never
--     by a second INSERT shape;
--   * every SECURITY DEFINER function pins SET search_path TO '' and has
--     EXECUTE revoked from PUBLIC; internal ones from authenticated too.
--
-- Two policies cross-reference each other (live_classes -> live_class_access
-- -> live_classes), which Postgres rejects as infinite recursion, so the
-- trainer side of live_class_access goes through owns_live_class(), a
-- SECURITY DEFINER lookup that is not subject to RLS.
--
-- The IP rate limit for invite-info cannot use check_rate_limit():
-- ai_usage.user_id is a FOREIGN KEY to auth.users, so a hashed IP would
-- violate it on every call and _shared/rateLimit.ts would fail OPEN on a
-- non-paid bucket. key_rate_limits + check_key_rate_limit() mirror it for
-- opaque text keys.
-- ============================================================

-- ---------------------------------------------------------------- invites
CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  trainer_id uuid NOT NULL REFERENCES public.trainers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('coach', 'live')),
  live_class_id uuid REFERENCES public.live_classes(id) ON DELETE CASCADE,
  invitee_name text,
  invitee_contact text,
  message text,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'opened', 'accepted', 'expired', 'revoked')),
  sent_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  opened_count integer NOT NULL DEFAULT 0,
  accepted_at timestamptz,
  accepted_by uuid,
  accepted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT invites_code_shape CHECK (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  CONSTRAINT invites_live_needs_class CHECK (kind <> 'live' OR live_class_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_invites_trainer ON public.invites (trainer_id);
CREATE INDEX IF NOT EXISTS idx_invites_code ON public.invites (code);
CREATE INDEX IF NOT EXISTS idx_invites_live_class ON public.invites (live_class_id)
  WHERE live_class_id IS NOT NULL;

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invites FROM anon;

DROP POLICY IF EXISTS "invites_select" ON public.invites;
CREATE POLICY "invites_select" ON public.invites
  FOR SELECT TO authenticated
  USING (trainer_id = (select auth.uid()) OR accepted_by = (select auth.uid()));

DROP POLICY IF EXISTS "invites_insert" ON public.invites;
CREATE POLICY "invites_insert" ON public.invites
  FOR INSERT TO authenticated
  WITH CHECK (trainer_id = (select auth.uid()));

DROP POLICY IF EXISTS "invites_update" ON public.invites;
CREATE POLICY "invites_update" ON public.invites
  FOR UPDATE TO authenticated
  USING (trainer_id = (select auth.uid()))
  WITH CHECK (trainer_id = (select auth.uid()));

DROP POLICY IF EXISTS "invites_delete" ON public.invites;
CREATE POLICY "invites_delete" ON public.invites
  FOR DELETE TO authenticated
  USING (trainer_id = (select auth.uid()));

-- The coach's invite list updates live (sent -> opened -> accepted).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'invites'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.invites;
  END IF;
END $$;

-- ---------------------------------------------------------------- live_class_access
CREATE TABLE IF NOT EXISTS public.live_class_access (
  live_class_id uuid NOT NULL REFERENCES public.live_classes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  granted_via uuid REFERENCES public.invites(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (live_class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_live_class_access_user ON public.live_class_access (user_id);

ALTER TABLE public.live_class_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_class_access FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.live_class_access FROM authenticated;

-- Is the caller the coach who owns this class? Runs as the definer so the
-- live_class_access policy can ask without re-entering live_classes' RLS.
CREATE OR REPLACE FUNCTION public.owns_live_class(p_live_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_classes lc
     WHERE lc.id = p_live_class_id AND lc.trainer_id = auth.uid()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.owns_live_class(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.owns_live_class(uuid) TO authenticated;

DROP POLICY IF EXISTS "live_class_access_select" ON public.live_class_access;
CREATE POLICY "live_class_access_select" ON public.live_class_access
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()) OR public.owns_live_class(live_class_id));

-- live_classes: keep the consolidated clauses (own classes, my coach's
-- classes) and add "I hold a pass".
DROP POLICY IF EXISTS "live_classes_select" ON public.live_classes;
CREATE POLICY "live_classes_select" ON public.live_classes
  FOR SELECT TO authenticated
  USING (
    (trainer_id = (select auth.uid()))
    OR (EXISTS (
      SELECT 1 FROM public.clients c
       WHERE c.auth_user_id = (select auth.uid()) AND c.trainer_id = live_classes.trainer_id))
    OR (EXISTS (
      SELECT 1 FROM public.live_class_access a
       WHERE a.live_class_id = live_classes.id AND a.user_id = (select auth.uid())))
  );

-- ---------------------------------------------------------------- notifications
-- The live check only allowed message/score/water/workout/nutrition/file.
-- The two invite notices are added; nothing else changes.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('message', 'score', 'water', 'workout', 'nutrition', 'file',
                  'invite_accepted', 'client_left'));

-- ---------------------------------------------------------------- key rate limit
CREATE TABLE IF NOT EXISTS public.key_rate_limits (
  key text NOT NULL,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, bucket, window_start)
);
CREATE INDEX IF NOT EXISTS idx_key_rate_limits_window ON public.key_rate_limits (window_start);
ALTER TABLE public.key_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.key_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_key_rate_limit(
  p_key text, p_bucket text, p_limit integer, p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_window timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
BEGIN
  IF p_key IS NULL OR p_key = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.key_rate_limits (key, bucket, window_start, count)
  VALUES (p_key, p_bucket, v_window, 1)
  ON CONFLICT (key, bucket, window_start)
  DO UPDATE SET count = public.key_rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Closed windows are useless; sweep them now and then.
  IF random() < 0.02 THEN
    DELETE FROM public.key_rate_limits WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN v_count <= p_limit;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.check_key_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_key_rate_limit(text, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------- generate_invite_code
-- Six characters from an alphabet without 0/O/1/I/L. gen_random_uuid() is
-- the strong random source in core; bytes >= 248 are rejected so the
-- modulo does not favour the first eight letters.
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  v_i integer;
  v_b integer;
  v_attempt integer := 0;
BEGIN
  LOOP
    v_code := '';
    v_bytes := uuid_send(gen_random_uuid());
    v_i := 0;
    WHILE length(v_code) < 6 AND v_i < 16 LOOP
      v_b := get_byte(v_bytes, v_i);
      v_i := v_i + 1;
      IF v_b < 248 THEN
        v_code := v_code || substr(v_alphabet, 1 + (v_b % 31), 1);
      END IF;
    END LOOP;

    IF length(v_code) = 6 AND NOT EXISTS (SELECT 1 FROM public.invites WHERE code = v_code) THEN
      RETURN v_code;
    END IF;

    v_attempt := v_attempt + 1;
    IF v_attempt > 20 THEN
      RAISE EXCEPTION 'invite_code_exhausted';
    END IF;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.generate_invite_code() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- create_invite
CREATE OR REPLACE FUNCTION public.create_invite(
  p_kind text,
  p_live_class_id uuid DEFAULT NULL,
  p_invitee_name text DEFAULT NULL,
  p_invitee_contact text DEFAULT NULL,
  p_message text DEFAULT NULL
)
RETURNS public.invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.invites;
  v_name text := LEFT(NULLIF(btrim(p_invitee_name), ''), 120);
  v_contact text := LEFT(NULLIF(btrim(p_invitee_contact), ''), 200);
  v_message text := LEFT(NULLIF(btrim(p_message), ''), 1000);
  v_class uuid := NULL;
  v_class_status text;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = v_uid) THEN
    RAISE EXCEPTION 'not_a_trainer';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('coach', 'live') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF p_kind = 'live' THEN
    IF p_live_class_id IS NULL THEN
      RAISE EXCEPTION 'live_class_required';
    END IF;
    SELECT status INTO v_class_status
      FROM public.live_classes
     WHERE id = p_live_class_id AND trainer_id = v_uid;
    IF v_class_status IS NULL THEN
      RAISE EXCEPTION 'not_your_class';
    END IF;
    IF v_class_status IN ('ended', 'cancelled') THEN
      RAISE EXCEPTION 'live_class_over';
    END IF;
    v_class := p_live_class_id;
  END IF;

  -- The standing link: one live coach invite with no invitee, renewed for
  -- another 30 days each time it is asked for.
  IF p_kind = 'coach' AND v_name IS NULL AND v_contact IS NULL THEN
    UPDATE public.invites
       SET expires_at = now() + interval '30 days',
           message = COALESCE(v_message, message)
     WHERE id = (
       SELECT id FROM public.invites
        WHERE trainer_id = v_uid AND kind = 'coach'
          AND invitee_contact IS NULL AND invitee_name IS NULL
          AND status <> 'revoked' AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1)
    RETURNING * INTO v_row;
    IF v_row.id IS NOT NULL THEN
      RETURN v_row;
    END IF;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.invites
   WHERE trainer_id = v_uid AND created_at > now() - interval '1 day';
  IF v_count >= 60 THEN
    RAISE EXCEPTION 'invite_rate_limited';
  END IF;

  INSERT INTO public.invites
    (code, trainer_id, kind, live_class_id, invitee_name, invitee_contact, message, expires_at)
  VALUES
    (public.generate_invite_code(), v_uid, p_kind, v_class, v_name, v_contact, v_message,
     CASE WHEN p_kind = 'live' THEN now() + interval '12 hours' ELSE now() + interval '30 days' END)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_invite(text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_invite(text, uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------- invite_public
-- What a code shows BEFORE anyone signs in. Coach fields come from
-- trainers_public only; the invitee, the message and the row itself stay
-- private. NULL for an unknown code.
CREATE OR REPLACE FUNCTION public.invite_public(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
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
$$;
REVOKE EXECUTE ON FUNCTION public.invite_public(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.invite_public(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------- mark_invite_opened
-- Service role only (the invite-info edge function).
CREATE OR REPLACE FUNCTION public.mark_invite_opened(p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
BEGIN
  UPDATE public.invites
     SET opened_at = COALESCE(opened_at, now()),
         opened_count = opened_count + 1,
         status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END
   WHERE code = v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mark_invite_opened(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_invite_opened(text) TO service_role;

-- ---------------------------------------------------------------- accept_invite
-- Errors, verbatim: invite_not_found, invite_expired, invite_already_accepted,
-- 'needs_switch_confirmation: <current coach name>', trainer_cannot_accept.
-- The roster-cap trigger may also raise 'roster_limit: ...' on a full free
-- roster, as it does for respond_coach_request.
CREATE OR REPLACE FUNCTION public.accept_invite(p_code text, p_confirm_switch boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_inv public.invites;
  v_client public.clients;
  v_client_id uuid;
  v_personal boolean;
  v_class_status text;
  v_old_trainer uuid;
  v_old_name text;
  v_athlete text;
  v_switched boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = v_uid) THEN
    RAISE EXCEPTION 'trainer_cannot_accept';
  END IF;

  SELECT * INTO v_inv FROM public.invites WHERE code = v_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  IF now() > v_inv.expires_at OR v_inv.status IN ('revoked', 'expired') THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;
  IF v_inv.kind = 'live' THEN
    SELECT status INTO v_class_status FROM public.live_classes WHERE id = v_inv.live_class_id;
    IF v_class_status IS NULL OR v_class_status IN ('ended', 'cancelled') THEN
      RAISE EXCEPTION 'invite_expired';
    END IF;
  END IF;

  -- A personal invite is one seat; the standing link and a shared live
  -- pass are taken by anyone who holds the code.
  v_personal := v_inv.invitee_name IS NOT NULL OR v_inv.invitee_contact IS NOT NULL;
  IF v_inv.status = 'accepted' AND v_personal AND v_inv.accepted_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'invite_already_accepted';
  END IF;

  SELECT * INTO v_client FROM public.clients WHERE auth_user_id = v_uid ORDER BY created_at LIMIT 1;

  IF v_inv.kind = 'coach' THEN
    IF v_client.id IS NULL THEN
      -- Brand-new athlete: the same coachless row Solo creates.
      PERFORM public.ensure_solo_client();
      SELECT * INTO v_client FROM public.clients WHERE auth_user_id = v_uid ORDER BY created_at LIMIT 1;
    END IF;
    v_client_id := v_client.id;
    v_athlete := COALESCE(NULLIF(v_client.name, ''), 'An athlete');
    v_old_trainer := v_client.trainer_id;

    IF v_old_trainer IS NOT NULL AND v_old_trainer <> v_inv.trainer_id THEN
      IF NOT COALESCE(p_confirm_switch, false) THEN
        SELECT name INTO v_old_name FROM public.trainers WHERE id = v_old_trainer;
        RAISE EXCEPTION 'needs_switch_confirmation: %', COALESCE(NULLIF(v_old_name, ''), 'your coach');
      END IF;
      v_switched := true;
    END IF;

    IF v_old_trainer IS DISTINCT FROM v_inv.trainer_id THEN
      -- Runs as the definer, so guard_entitlement_columns lets the coach
      -- columns change; the roster-cap trigger still applies.
      UPDATE public.clients
         SET trainer_id = v_inv.trainer_id,
             status = 'active',
             requested_trainer_id = NULL,
             coach_requested_at = NULL,
             coach_declined_at = NULL,
             coach_declined_by = NULL,
             coach_accepted_at = now()
       WHERE id = v_client_id;

      IF v_switched THEN
        BEGIN
          INSERT INTO public.notifications (trainer_id, type, title, description, metadata, is_read)
          VALUES (v_old_trainer, 'client_left', v_athlete || ' moved to another coach',
                  v_athlete || ' accepted another coach''s invitation. Their history with you stays in your records.',
                  jsonb_build_object('client_id', v_client_id), false);
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'accept_invite: client_left notification failed: %', SQLERRM;
        END;
      END IF;

      BEGIN
        INSERT INTO public.notifications (trainer_id, type, title, description, metadata, is_read)
        VALUES (v_inv.trainer_id, 'invite_accepted', v_athlete || ' joined from your invite',
                v_athlete || ' accepted your invitation and is on your roster now.',
                jsonb_build_object('invite_id', v_inv.id, 'client_id', v_client_id), false);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'accept_invite: invite_accepted notification failed: %', SQLERRM;
      END;
    END IF;
    -- Already this coach's athlete: nothing to change, nobody to notify.
  ELSE
    v_client_id := v_client.id;
    INSERT INTO public.live_class_access (live_class_id, user_id, granted_via)
    VALUES (v_inv.live_class_id, v_uid, v_inv.id)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.invites
     SET status = 'accepted',
         accepted_at = now(),
         accepted_by = v_uid,
         accepted_client_id = CASE WHEN kind = 'coach' THEN v_client_id ELSE accepted_client_id END
   WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'kind', v_inv.kind,
    'trainer_id', v_inv.trainer_id,
    'client_id', v_client_id,
    'live_class_id', v_inv.live_class_id,
    'switched', v_switched);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.accept_invite(text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_invite(text, boolean) TO authenticated;

-- ---------------------------------------------------------------- revoke_invite
CREATE OR REPLACE FUNCTION public.revoke_invite(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.invites SET status = 'revoked' WHERE id = p_id AND trainer_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;
