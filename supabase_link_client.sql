-- ============================================================
-- Link Client to Auth User RPC
-- ============================================================
-- Called AFTER signup + signin. Uses auth.uid() to link the
-- current authenticated user to their matching client row.
--
-- This is the PRIMARY linking mechanism. The DB trigger on
-- auth.users is a safety net.
--
-- Why SECURITY DEFINER: The client user doesn't have UPDATE
-- permission on the clients table (RLS), so this function
-- elevates to update the specific matching row.
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_client_to_auth_user(
  p_email TEXT DEFAULT NULL,
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
  -- Get the authenticated user's ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('linked', false, 'reason', 'not_authenticated');
  END IF;

  -- Check if already linked
  SELECT id INTO v_client_id
  FROM public.clients
  WHERE auth_user_id = v_user_id
  LIMIT 1;

  IF v_client_id IS NOT NULL THEN
    RETURN json_build_object('linked', true, 'client_id', v_client_id, 'already', true);
  END IF;

  -- Try to link by email
  IF p_email IS NOT NULL THEN
    UPDATE public.clients
    SET auth_user_id = v_user_id
    WHERE LOWER(email) = LOWER(p_email)
      AND auth_user_id IS NULL
    RETURNING id INTO v_client_id;
  END IF;

  -- Try phone if email didn't match
  IF v_client_id IS NULL AND p_phone IS NOT NULL THEN
    UPDATE public.clients
    SET auth_user_id = v_user_id
    WHERE phone = p_phone
      AND auth_user_id IS NULL
    RETURNING id INTO v_client_id;
  END IF;

  IF v_client_id IS NOT NULL THEN
    RETURN json_build_object('linked', true, 'client_id', v_client_id);
  ELSE
    RETURN json_build_object('linked', false, 'reason', 'no_matching_client');
  END IF;
END;
$$;
