-- Client Lookup Function (email OR phone)
-- Allows the client-login screen to check if a contact exists
-- before the user is authenticated (bypasses RLS safely)

DROP FUNCTION IF EXISTS public.lookup_client_by_email(TEXT);

CREATE OR REPLACE FUNCTION public.lookup_client_by_contact(contact_value TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'found', true,
    'client_name', c.name,
    'trainer_name', t.name,
    'client_email', c.email,
    'client_phone', c.phone,
    'has_account', (c.auth_user_id IS NOT NULL)
  ) INTO result
  FROM clients c
  LEFT JOIN trainers t ON t.id = c.trainer_id
  WHERE LOWER(c.email) = LOWER(contact_value)
     OR c.phone = contact_value
  LIMIT 1;

  IF result IS NULL THEN
    RETURN json_build_object('found', false);
  END IF;

  RETURN result;
END;
$$;
