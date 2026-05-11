-- ============================================================
-- Create Client Row RPC (for new client signups)
-- ============================================================
-- When a NEW client signs up (not pre-registered by a trainer),
-- they need to create their own client row and pick a trainer.
-- This requires INSERT on 'clients' and 'notifications' — which
-- a freshly signed-up user can't do via direct table access.
--
-- Per Supabase best practices, a SECURITY DEFINER function is the
-- correct approach for "elevated operations" like self-registration.
-- The function validates auth.uid() to prevent abuse.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_client_and_notify(
  p_name TEXT,
  p_email TEXT,
  p_trainer_id UUID,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
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

  -- Notify the trainer (non-critical, wrapped in exception handler)
  BEGIN
    INSERT INTO public.notifications (trainer_id, type, title, description, is_read)
    VALUES (
      p_trainer_id,
      'message',
      'New Client!',
      p_name || ' just signed up and chose you as their trainer!',
      false
    );
  EXCEPTION WHEN OTHERS THEN
    -- Notification insert failed — not critical, continue
    NULL;
  END;

  RETURN json_build_object('success', true, 'client_id', v_client_id);
END;
$$;
