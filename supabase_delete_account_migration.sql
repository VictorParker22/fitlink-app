-- Migration to support user account deletion

-- 1. Function to delete a trainer account and all their data
CREATE OR REPLACE FUNCTION public.delete_trainer_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_trainer_id uuid;
BEGIN
  -- Get the current authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the trainer ID.
  -- NOTE: trainers.id IS the auth user id everywhere in the app (every query
  -- reads/writes trainers with .eq('id', user.id) and inserts trainer_id: user.id).
  -- This function previously matched on a non-existent trainers.auth_user_id
  -- column, so coach account deletion ALWAYS failed — a Guideline 5.1.1(v)
  -- violation. Match on the real key.
  SELECT id INTO v_trainer_id FROM public.trainers WHERE id = v_user_id;

  IF v_trainer_id IS NULL THEN
    RAISE EXCEPTION 'Trainer profile not found';
  END IF;

  -- Delete all associated data (Cascade should handle most if foreign keys are set up correctly, 
  -- but we explicitly delete to be safe)
  
  -- Delete trainer profile (this should cascade to clients, workouts, etc. based on schema)
  DELETE FROM public.trainers WHERE id = v_trainer_id;
  
  -- Finally, delete the auth user
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

-- 2. Function to delete a client account and all their data
CREATE OR REPLACE FUNCTION public.delete_client_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_client_id uuid;
BEGIN
  -- Get the current authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get the client ID
  SELECT id INTO v_client_id FROM public.clients WHERE auth_user_id = v_user_id;
  
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Client profile not found';
  END IF;

  -- Delete client profile (should cascade to workouts, diets, messages)
  DELETE FROM public.clients WHERE id = v_client_id;
  
  -- Finally, delete the auth user
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;
