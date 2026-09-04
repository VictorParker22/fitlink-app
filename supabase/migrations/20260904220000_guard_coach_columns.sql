-- ============================================================
-- Column-level REVOKE on public.clients is a no-op here: `authenticated`
-- holds table-wide UPDATE and column privileges are additive (see the
-- header of 20260823140000_entitlement_guard.sql, which is why
-- premium_until is guarded by a trigger). The coach-relationship columns
-- get the same trigger guard: only privileged roles (the SECURITY DEFINER
-- RPCs run as postgres) may change them. Coaches' status/notes updates and
-- athletes' own profile updates are untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_entitlement_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_role text := current_user;
  v_privileged boolean := v_role IN ('service_role', 'supabase_admin', 'postgres');
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'trainers' THEN
    IF NEW.elite_until IS DISTINCT FROM OLD.elite_until THEN
      RAISE EXCEPTION 'elite_until is set by billing only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'clients' THEN
    IF NEW.premium_until IS DISTINCT FROM OLD.premium_until THEN
      RAISE EXCEPTION 'premium_until is set by billing only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.trainer_id IS DISTINCT FROM OLD.trainer_id
       OR NEW.requested_trainer_id IS DISTINCT FROM OLD.requested_trainer_id
       OR NEW.coach_requested_at IS DISTINCT FROM OLD.coach_requested_at
       OR NEW.coach_accepted_at IS DISTINCT FROM OLD.coach_accepted_at
       OR NEW.coach_declined_at IS DISTINCT FROM OLD.coach_declined_at
       OR NEW.coach_declined_by IS DISTINCT FROM OLD.coach_declined_by THEN
      RAISE EXCEPTION 'the coach relationship changes only through request_coach / respond_coach_request'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.solo_summary IS DISTINCT FROM OLD.solo_summary
       OR NEW.solo_summary_at IS DISTINCT FROM OLD.solo_summary_at THEN
      RAISE EXCEPTION 'solo_summary is written by the corner only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers already exist (trg_guard_elite, trg_guard_premium); the function
-- body above replaces them in place.
