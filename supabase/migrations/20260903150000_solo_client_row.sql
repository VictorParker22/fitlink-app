-- ============================================================
-- Solo mode for athletes WITHOUT a coach (2026-09-03 audit).
--
-- Every piece of Solo (premium_until, solo_character, solo_messages RLS,
-- the solo-corner function, the RevenueCat webhook) hangs off a clients
-- row, and a clients row required a trainer. So the one athlete Solo
-- exists for — the one with no coach — could never use it: setup wrote
-- to no row, the corner always answered 402, and a paid entitlement had
-- nowhere to land.
--
-- Fix: a coachless clients row. trainer_id becomes nullable; status
-- 'solo' names the state; ensure_solo_client() creates the row on first
-- entry; create_client_and_notify() ADOPTS that row when the athlete
-- later picks a coach instead of refusing with already_exists; the
-- roster-cap triggers ignore rows with no trainer.
-- ============================================================

ALTER TABLE public.clients ALTER COLUMN trainer_id DROP NOT NULL;

-- Roster cap: no trainer, no roster.
CREATE OR REPLACE FUNCTION public.enforce_roster_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_elite boolean;
  v_org uuid;
  v_count integer;
BEGIN
  IF NEW.trainer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (t.elite_until IS NOT NULL AND t.elite_until > now()), t.org_id
    INTO v_elite, v_org
    FROM public.trainers t WHERE t.id = NEW.trainer_id;

  IF v_elite OR v_org IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.clients c
   WHERE c.trainer_id = NEW.trainer_id
     AND COALESCE(c.status, 'active') <> 'inactive'
     AND c.id <> NEW.id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'roster_limit: free plan holds 5 active athletes; Elite is unlimited'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

-- The UPDATE variant also fires when a solo row gains a trainer (adoption
-- below) — that is a real roster addition and must count.
CREATE OR REPLACE FUNCTION public.enforce_roster_cap_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_was_active boolean := COALESCE(OLD.status, 'active') <> 'inactive' AND OLD.trainer_id IS NOT NULL;
  v_now_active boolean := COALESCE(NEW.status, 'active') <> 'inactive' AND NEW.trainer_id IS NOT NULL;
  v_elite boolean;
  v_org uuid;
  v_count integer;
BEGIN
  IF NEW.trainer_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only transitions INTO an active roster slot are checked.
  IF v_was_active AND v_now_active AND OLD.trainer_id = NEW.trainer_id THEN
    RETURN NEW;
  END IF;
  IF NOT v_now_active THEN
    RETURN NEW;
  END IF;

  SELECT (t.elite_until IS NOT NULL AND t.elite_until > now()), t.org_id
    INTO v_elite, v_org
    FROM public.trainers t WHERE t.id = NEW.trainer_id;
  IF v_elite OR v_org IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.clients c
   WHERE c.trainer_id = NEW.trainer_id
     AND COALESCE(c.status, 'active') <> 'inactive'
     AND c.id <> NEW.id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'roster_limit: free plan holds 5 active athletes; Elite is unlimited'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

-- First entry into Solo creates the athlete's own row.
CREATE OR REPLACE FUNCTION public.ensure_solo_client()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_name text;
  v_email text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_id FROM public.clients WHERE auth_user_id = v_uid LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN json_build_object('client_id', v_id, 'created', false);
  END IF;

  SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'name', ''), split_part(COALESCE(u.email, ''), '@', 1), 'Athlete'),
         COALESCE(u.email, '')
    INTO v_name, v_email
    FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.clients (name, email, trainer_id, auth_user_id, status)
  VALUES (v_name, LOWER(v_email), NULL, v_uid, 'solo')
  RETURNING id INTO v_id;

  RETURN json_build_object('client_id', v_id, 'created', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_solo_client() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ensure_solo_client() TO authenticated;

-- Picking a coach later adopts the solo row instead of refusing.
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
    -- Solo athlete choosing a coach: keep the row (messages, entitlement,
    -- character), attach the coach.
    UPDATE public.clients
       SET trainer_id = p_trainer_id,
           status = 'trial',
           name = COALESCE(NULLIF(p_name, ''), name),
           email = COALESCE(NULLIF(LOWER(p_email), ''), email),
           phone = COALESCE(p_phone, phone)
     WHERE id = v_client_id;
  ELSE
    INSERT INTO public.clients (name, email, phone, trainer_id, auth_user_id, status)
    VALUES (p_name, LOWER(p_email), p_phone, p_trainer_id, v_user_id, 'trial')
    RETURNING id INTO v_client_id;
  END IF;

  BEGIN
    INSERT INTO public.notifications (trainer_id, type, title, description, is_read)
    VALUES (p_trainer_id, 'new_client', 'New client', p_name || ' just signed up and chose you as their coach', false);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'create_client_and_notify: notification insert failed: %', SQLERRM;
  END;

  RETURN json_build_object('success', true, 'client_id', v_client_id);
END;
$$;

-- clients.status check: the live constraint allowed only active/trial/
-- inactive, yet the app writes 'new' (join requests), 'canceling' /
-- 'canceled' (cancel-subscription) and now 'solo'. Widen it.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.clients DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IS NULL OR status IN ('active', 'trial', 'inactive', 'new', 'canceling', 'canceled', 'solo'));
