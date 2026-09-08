-- accept_invite: the trainer check applies to coach invites only. A coach
-- account can accept a LIVE invite and receive a live_class_access row.

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
  SELECT * INTO v_inv FROM public.invites WHERE code = v_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_not_found';
  END IF;
  -- Only joining a roster is athlete-only. A coach may hold a seat at
  -- another coach's live class: watching is harmless and it is exactly what
  -- a shared live link is for (2026-09-08: a coach opening a colleague's
  -- class saw "Class not found").
  IF v_inv.kind = 'coach' AND EXISTS (SELECT 1 FROM public.trainers t WHERE t.id = v_uid) THEN
    RAISE EXCEPTION 'trainer_cannot_accept';
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

select 'accept_invite replaced' as done;
