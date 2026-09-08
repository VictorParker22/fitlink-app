-- 2026-09-08 — the threat model's open items A8 and A13.
--
--   A13  A coach could DELETE an athlete's row (clients_delete) and every
--        cascade behind it: workouts, logs, check-ins, health snapshots,
--        photos, chat. Removing an athlete is now detach_client(): a row
--        bound to a real account is detached (coachless, planless, Solo)
--        and keeps its history; a coach-typed placeholder with no account
--        is deleted. The Stripe side (cancelling the athlete's subscription
--        to that coach) happens in the remove-client edge function BEFORE
--        this runs.
--   A8   Live playback moves to Mux signed URLs. The signing key lives in
--        Supabase Vault behind two service-only wrappers; the legacy
--        live_classes.mux_stream_key column (NULL on every row; the key
--        lives in live_class_secrets) is dropped.
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908100000_open_items.sql

-- ── A13 ─────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS clients_delete ON public.clients;

CREATE OR REPLACE FUNCTION public.detach_client(p_client_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.clients;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO v_row FROM public.clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND OR v_row.trainer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_your_client' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_row.auth_user_id IS NULL THEN
    -- A placeholder the coach typed; nobody else's history lives under it.
    DELETE FROM public.clients WHERE id = p_client_id;
    RETURN json_build_object('outcome', 'deleted', 'client_id', p_client_id);
  END IF;

  -- A real athlete: they keep everything, they just have no coach now.
  UPDATE public.clients
     SET trainer_id = NULL,
         plan_id = NULL,
         status = 'solo',
         trial_end_date = NULL,
         requested_trainer_id = NULL,
         coach_requested_at = NULL,
         coach_accepted_at = NULL,
         coach_declined_at = NULL,
         coach_declined_by = NULL
   WHERE id = p_client_id;

  UPDATE public.client_plan_enrollments
     SET status = 'paused', paused_at = now(), updated_at = now()
   WHERE client_id = p_client_id AND status = 'active';

  BEGIN
    INSERT INTO public.notifications (trainer_id, type, title, description, metadata, is_read)
    VALUES (v_uid, 'client_left', COALESCE(NULLIF(v_row.name, ''), 'An athlete') || ' was removed from your roster',
            'Their history stays with them. They can find a new coach or train solo.',
            jsonb_build_object('client_id', p_client_id), true);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'detach_client: notification failed: %', SQLERRM;
  END;

  RETURN json_build_object('outcome', 'detached', 'client_id', p_client_id);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.detach_client(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_client(uuid) TO authenticated;

-- ── A8 ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.store_platform_secret(p_name text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name);
  ELSE
    PERFORM vault.update_secret(v_id, p_value);
  END IF;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.store_platform_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_platform_secret(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_platform_secret(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_value text;
BEGIN
  IF COALESCE(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT decrypted_secret INTO v_value FROM vault.decrypted_secrets WHERE name = p_name LIMIT 1;
  RETURN v_value;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_platform_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_secret(text) TO service_role;

ALTER TABLE public.live_classes DROP COLUMN IF EXISTS mux_stream_key;
