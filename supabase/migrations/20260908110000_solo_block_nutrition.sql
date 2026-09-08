-- Solo training block + coachless meal plans (2026-09-08, "make the AI smarter").
--
-- 1. clients.solo_block: where the athlete is in their 4-week block (week,
--    split, goal, anchors, rationale) plus the nutrition targets the corner
--    wrote. Written only by solo-program / solo-nutrition (service role);
--    the athlete's own row may read it but not change it, same rule as
--    solo_summary. Coaches never see it (their RLS reads roster rows; a
--    solo athlete has trainer_id NULL).
-- 2. diet_plans.trainer_id may be NULL: a plan the corner wrote for a Solo
--    athlete has no coach. RLS already covers it: the athlete reads it
--    through client_diets (diet_plans_select), diet_plan_meals_select joins
--    the plan, meals_select reaches the foods through diet_plan_meals, and
--    every INSERT/UPDATE/DELETE policy on these tables still requires
--    auth.uid() = trainer_id, which NULL never satisfies — only the
--    service role writes them.

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS solo_block jsonb;
ALTER TABLE public.diet_plans ALTER COLUMN trainer_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_entitlement_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := current_user;
  -- service_role = edge functions; postgres = SECURITY DEFINER RPCs and
  -- triggers owned by postgres; supabase_auth_admin = the auth.users triggers.
  v_privileged boolean := v_role IN ('service_role', 'supabase_admin', 'postgres', 'supabase_auth_admin');
  v_uid uuid := auth.uid();
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'trainers' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.elite_until IS NOT NULL
         OR NEW.org_id IS NOT NULL
         OR NEW.stripe_account_id IS NOT NULL
         OR COALESCE(NEW.stripe_onboarding_complete, false)
         OR COALESCE(NEW.stripe_charges_enabled, false) THEN
        RAISE EXCEPTION 'billing columns cannot be set on insert'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      RETURN NEW;
    END IF;
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
    IF TG_OP = 'INSERT' THEN
      IF NEW.premium_until IS NOT NULL OR NEW.solo_summary IS NOT NULL OR NEW.solo_summary_at IS NOT NULL
         OR NEW.solo_block IS NOT NULL THEN
        RAISE EXCEPTION 'premium_until is set by billing only'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      -- An athlete creating their own row starts coachless and planless;
      -- ensure_solo_client / accept_invite / request_coach (all definer)
      -- are the only ways onto a roster. A coach inserting a roster row
      -- (trainer_id = self) may set a plan, but not bind another person's
      -- auth account (guard_client_auth_binding covers the rest).
      -- A coach's direct insert may not pre-bind somebody else's account:
      -- a row bound to a uid that has no clients row yet would put that
      -- person on this roster the moment they sign in. Binding is
      -- link_client_to_auth_user's job (definer, contact-verified).
      IF NEW.trainer_id IS NOT DISTINCT FROM v_uid
         AND NEW.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'an athlete account is linked by the athlete, not by the coach'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.auth_user_id IS NOT DISTINCT FROM v_uid AND NEW.trainer_id IS DISTINCT FROM v_uid THEN
        IF NEW.trainer_id IS NOT NULL OR NEW.requested_trainer_id IS NOT NULL
           OR NEW.plan_id IS NOT NULL OR NEW.trial_end_date IS NOT NULL
           OR NEW.coach_requested_at IS NOT NULL OR NEW.coach_accepted_at IS NOT NULL
           OR NEW.coach_declined_at IS NOT NULL OR NEW.coach_declined_by IS NOT NULL
           OR NEW.stripe_customer_id IS NOT NULL
           OR COALESCE(NEW.status, 'solo') NOT IN ('solo', 'new') THEN
          RAISE EXCEPTION 'the coach relationship changes only through request_coach / accept_invite'
            USING ERRCODE = 'insufficient_privilege';
        END IF;
      END IF;
      RETURN NEW;
    END IF;

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
       OR NEW.solo_summary_at IS DISTINCT FROM OLD.solo_summary_at
       OR NEW.solo_block IS DISTINCT FROM OLD.solo_block THEN
      RAISE EXCEPTION 'solo_summary and solo_block are written by the corner only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    -- The athlete's own row: membership and money columns belong to the
    -- coach (manual enrolment, trials) or to Stripe (attachClientToPlan).
    -- The coach's notes are the coach's. Everything else on the row —
    -- profile, assessment, units, health sharing, push token, AI consent,
    -- solo character — stays the athlete's to edit.
    IF v_uid IS NOT NULL AND OLD.auth_user_id = v_uid AND OLD.trainer_id IS DISTINCT FROM v_uid THEN
      IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
         OR NEW.status IS DISTINCT FROM OLD.status
         OR NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date
         OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
         OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
         OR NEW.notes IS DISTINCT FROM OLD.notes THEN
        RAISE EXCEPTION 'plan, status and trial are set by your coach or by a purchase'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_entitlement_columns() FROM PUBLIC, anon, authenticated;
