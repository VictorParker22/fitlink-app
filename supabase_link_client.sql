-- ============================================================
-- Client Auto-Link Trigger (Supabase Official Pattern)
-- ============================================================
-- This trigger fires AFTER a new auth user is created.
-- If the user's email matches an unlinked client row,
-- it automatically sets auth_user_id — no client code needed.
--
-- Uses SECURITY DEFINER because:
--   1. It's the official Supabase-recommended pattern
--   2. Triggers on auth.users require elevated access
--   3. It's server-side only — cannot be called by clients
-- ============================================================

-- Drop old RPC if it exists (replaced by this trigger)
DROP FUNCTION IF EXISTS public.link_client_account(UUID, TEXT, TEXT);

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_client_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Auto-link: match the new user's email to an unlinked client row
  UPDATE public.clients
  SET auth_user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
    AND auth_user_id IS NULL;

  -- Also try phone match via signup metadata (for phone-based signups)
  IF NEW.raw_user_meta_data->>'phone' IS NOT NULL THEN
    UPDATE public.clients
    SET auth_user_id = NEW.id
    WHERE phone = NEW.raw_user_meta_data->>'phone'
      AND auth_user_id IS NULL
      AND auth_user_id IS DISTINCT FROM NEW.id; -- skip if already linked above
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created_link_client ON auth.users;

CREATE TRIGGER on_auth_user_created_link_client
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_client_user();
