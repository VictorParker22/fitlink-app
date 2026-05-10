-- Client Email Lookup Function
-- This allows the client-login screen to check if an email exists
-- before the user is authenticated (bypasses RLS safely)

CREATE OR REPLACE FUNCTION public.lookup_client_by_email(lookup_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  -- runs with elevated privileges
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'found', true,
    'client_name', c.name,
    'trainer_name', t.name,
    'has_account', (c.auth_user_id IS NOT NULL)
  ) INTO result
  FROM clients c
  LEFT JOIN trainers t ON t.id = c.trainer_id
  WHERE LOWER(c.email) = LOWER(lookup_email)
  LIMIT 1;

  IF result IS NULL THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN result;
END;
$$;
