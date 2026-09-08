-- 2026-09-08 — the columns that decide WHERE a coach's money goes and HOW
-- MUCH FitLink keeps are billing-owned, never phone-owned.
--
-- payment_split_for_trainer() gives an Elite coach 500 bps (5%) instead of
-- the 1000 bps default, and 0 bps for a coach on an org seat. elite_until was
-- already guarded (trg_guard_elite). org_id was NOT: trainers_update_own lets
-- a coach update any column of their own row over PostgREST, so a coach
-- could set org_id to any organization and pay no marketplace fee. The
-- Stripe Connect columns were open the same way. All of them are written
-- only by the service role (edge functions) or by SECURITY DEFINER
-- functions owned by postgres (sync_trainer_org), both of which the guard
-- lets through; an authenticated UPDATE that touches them is refused.
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908040000_guard_trainer_money_columns.sql

CREATE OR REPLACE FUNCTION public.guard_entitlement_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'org_id changes only through org membership'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id
       OR NEW.stripe_onboarding_complete IS DISTINCT FROM OLD.stripe_onboarding_complete
       OR NEW.stripe_charges_enabled IS DISTINCT FROM OLD.stripe_charges_enabled THEN
      RAISE EXCEPTION 'Stripe Connect status is written by the payout functions only'
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
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_entitlement_columns() FROM anon, authenticated;
