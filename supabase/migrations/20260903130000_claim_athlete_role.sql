-- ============================================================
-- claim_athlete_role() — OAuth signups carry no role metadata, so the
-- handle_new_user trigger creates a trainers row for everyone. An athlete
-- who signed up with Apple or Google calls this once to remove that stray
-- row. Refuses when the row is a real coach (has clients, plans or a
-- Stripe account).
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_athlete_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM public.clients WHERE trainer_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.plans WHERE trainer_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.trainers WHERE id = v_uid AND stripe_account_id IS NOT NULL) THEN
    RAISE EXCEPTION 'trainer_in_use';
  END IF;

  DELETE FROM public.trainers WHERE id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_athlete_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_athlete_role() TO authenticated;
