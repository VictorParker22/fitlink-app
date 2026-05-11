-- Link Client Account RPC
-- Securely links a new auth user to their existing client row
-- Must bypass RLS since the client user doesn't have UPDATE permission

CREATE OR REPLACE FUNCTION public.link_client_account(
  p_user_id UUID,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  matched_id UUID;
BEGIN
  -- Try email match first
  IF p_email IS NOT NULL THEN
    SELECT id INTO matched_id
    FROM clients
    WHERE LOWER(email) = LOWER(p_email)
      AND auth_user_id IS NULL
    LIMIT 1;
  END IF;

  -- Try phone match if no email match
  IF matched_id IS NULL AND p_phone IS NOT NULL THEN
    SELECT id INTO matched_id
    FROM clients
    WHERE phone = p_phone
      AND auth_user_id IS NULL
    LIMIT 1;
  END IF;

  IF matched_id IS NULL THEN
    RETURN json_build_object('linked', false, 'reason', 'no_match');
  END IF;

  -- Link the account
  UPDATE clients
  SET auth_user_id = p_user_id
  WHERE id = matched_id;

  RETURN json_build_object('linked', true, 'client_id', matched_id);
END;
$$;
