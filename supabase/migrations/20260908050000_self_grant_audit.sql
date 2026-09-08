-- 2026-09-08 — self-grant audit. Every column or path through which a user
-- could give themselves something of value (a fee waiver, an entitlement, a
-- pass, a roster slot, a seat) is now closed to the phone. Found by dumping
-- pg_policies + triggers for every money table and asking "what could the
-- row's own user write here":
--
--   1. trainers INSERT was unguarded. The guard was BEFORE UPDATE only, and
--      trainers_insert_own lets any signed-in user insert their own row —
--      an athlete account (or a fresh coach) could insert with
--      elite_until = 2099, org_id = <any>, stripe_charges_enabled = true.
--   2. clients INSERT was unguarded the same way: an athlete could insert
--      their own row already attached to any coach, on any plan, with
--      premium_until = 2099.
--   3. clients UPDATE by the athlete could set plan_id / status / trial_end_date
--      (a pass without paying) and edit the coach's private notes.
--   4. client_plan_enrollments UPDATE by the athlete could move the
--      enrollment to another plan (a free upgrade).
--   5. payment_split_for_trainer waived the platform fee for ANY org_id, and
--      enforce_roster_cap waived the 5-athlete cap the same way — but any
--      signed-in user may create an organization, so a coach could create an
--      unpaid gym and pay 0%. The waiver now needs paid seats.
--   6. lookup_client_by_contact (anon-callable, by design for sign-up) echoed
--      the client's full name and coach's full name for any email or phone.
--   7. plans.price had no bounds.
--
-- Apply with: npx supabase db query --linked -f supabase/migrations/20260908050000_self_grant_audit.sql

-- ── 1–3. One guard, both tables, INSERT and UPDATE ──────────────────────────
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
      IF NEW.premium_until IS NOT NULL OR NEW.solo_summary IS NOT NULL OR NEW.solo_summary_at IS NOT NULL THEN
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
       OR NEW.solo_summary_at IS DISTINCT FROM OLD.solo_summary_at THEN
      RAISE EXCEPTION 'solo_summary is written by the corner only'
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

REVOKE EXECUTE ON FUNCTION public.guard_entitlement_columns() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_elite ON public.trainers;
CREATE TRIGGER trg_guard_elite
  BEFORE INSERT OR UPDATE ON public.trainers
  FOR EACH ROW EXECUTE FUNCTION public.guard_entitlement_columns();

DROP TRIGGER IF EXISTS trg_guard_premium ON public.clients;
CREATE TRIGGER trg_guard_premium
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_entitlement_columns();

-- ── 4. Enrollments: the athlete advances the track, never moves passes ──────
CREATE OR REPLACE FUNCTION public.guard_enrollment_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_role text := current_user;
  v_privileged boolean := v_role IN ('service_role', 'supabase_admin', 'postgres', 'supabase_auth_admin');
  v_uid uuid := auth.uid();
  v_coach uuid;
BEGIN
  IF v_privileged THEN
    RETURN NEW;
  END IF;
  SELECT c.trainer_id INTO v_coach FROM public.clients c WHERE c.id = OLD.client_id;
  IF v_uid IS NOT NULL AND v_coach = v_uid THEN
    RETURN NEW;
  END IF;
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'an enrollment stays on the pass it was bought for'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('active', 'completed') THEN
    RAISE EXCEPTION 'only your coach can pause or cancel an enrollment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_enrollment_columns() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_enrollment ON public.client_plan_enrollments;
CREATE TRIGGER trg_guard_enrollment
  BEFORE UPDATE ON public.client_plan_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment_columns();

-- ── 5. The org waiver needs paid seats ──────────────────────────────────────
-- seat_status is written only by apply_org_seats (from stripe-webhook) and
-- guarded by guard_org_billing_columns; 'active' / 'trialing' are the values
-- a live Stripe seat subscription produces.
CREATE OR REPLACE FUNCTION public.payment_split_for_trainer(p_trainer_id uuid)
 RETURNS TABLE(platform_fee_bps integer, org_share_bps integer, org_id uuid, coach_keeps_bps integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH t AS (
    SELECT
      t.id,
      t.elite_until,
      -- An org counts only while its seats are paid for. Anyone signed in
      -- may create an organization row; without this, that row was a 0% fee.
      CASE WHEN t.org_id IS NOT NULL AND o.seat_status IN ('active', 'trialing') THEN t.org_id END AS org_id,
      CASE WHEN t.org_id IS NOT NULL AND o.seat_status IN ('active', 'trialing') THEN COALESCE(o.org_share_bps, 0) ELSE 0 END AS org_share_bps
    FROM public.trainers t
    LEFT JOIN public.organizations o ON o.id = t.org_id
    WHERE t.id = p_trainer_id
  ),
  fee AS (
    SELECT
      t.org_id,
      t.org_share_bps,
      -- Precedence: paid org seat (0 — the seat is the fee) > Elite (500) >
      -- platform default. 500 is deliberately a constant, not config: the
      -- Elite discount is a product promise ("half the fee"), not a knob.
      CASE WHEN t.org_id IS NOT NULL THEN 0
           WHEN t.elite_until IS NOT NULL AND t.elite_until > now() THEN 500
           ELSE (SELECT pc.platform_fee_bps FROM public.platform_config pc WHERE pc.id)
      END AS platform_fee_bps
    FROM t
  )
  SELECT
    fee.platform_fee_bps,
    fee.org_share_bps,
    fee.org_id,
    10000 - fee.platform_fee_bps - fee.org_share_bps AS coach_keeps_bps
  FROM fee;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_roster_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_elite boolean;
  v_paid_org boolean;
  v_count integer;
BEGIN
  IF NEW.trainer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (t.elite_until IS NOT NULL AND t.elite_until > now()),
         (t.org_id IS NOT NULL AND o.seat_status IN ('active', 'trialing'))
    INTO v_elite, v_paid_org
    FROM public.trainers t
    LEFT JOIN public.organizations o ON o.id = t.org_id
   WHERE t.id = NEW.trainer_id;

  IF v_elite OR COALESCE(v_paid_org, false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.clients c
   WHERE c.trainer_id = NEW.trainer_id
     AND COALESCE(c.status, 'active') <> 'inactive'
     AND c.id <> NEW.id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'roster_limit: free plan holds 5 active athletes; Elite is unlimited'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_roster_cap_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_was_active boolean := COALESCE(OLD.status, 'active') <> 'inactive' AND OLD.trainer_id IS NOT NULL;
  v_now_active boolean := COALESCE(NEW.status, 'active') <> 'inactive' AND NEW.trainer_id IS NOT NULL;
  v_elite boolean;
  v_paid_org boolean;
  v_count integer;
BEGIN
  IF NEW.trainer_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Only transitions INTO an active roster slot are checked.
  IF v_was_active AND v_now_active AND OLD.trainer_id = NEW.trainer_id THEN
    RETURN NEW;
  END IF;
  IF NOT v_now_active THEN
    RETURN NEW;
  END IF;

  SELECT (t.elite_until IS NOT NULL AND t.elite_until > now()),
         (t.org_id IS NOT NULL AND o.seat_status IN ('active', 'trialing'))
    INTO v_elite, v_paid_org
    FROM public.trainers t
    LEFT JOIN public.organizations o ON o.id = t.org_id
   WHERE t.id = NEW.trainer_id;
  IF v_elite OR COALESCE(v_paid_org, false) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.clients c
   WHERE c.trainer_id = NEW.trainer_id
     AND COALESCE(c.status, 'active') <> 'inactive'
     AND c.id <> NEW.id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'roster_limit: free plan holds 5 active athletes; Elite is unlimited'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 6. The sign-up lookup confirms an invite, not a person ──────────────────
-- Still anon-callable: the athlete has no session yet when they type the
-- contact their coach invited. It now answers only what the screen shows —
-- whether an invite exists, whether it already has an account, and the
-- coach's first name — never the client's own name.
CREATE OR REPLACE FUNCTION public.lookup_client_by_contact(contact_value text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  result json;
  v_contact text := LEFT(btrim(COALESCE(contact_value, '')), 200);
BEGIN
  IF v_contact = '' THEN
    RETURN json_build_object('found', false);
  END IF;

  SELECT json_build_object(
           'found', true,
           'trainer_name', split_part(COALESCE(t.name, ''), ' ', 1),
           'has_account', (c.auth_user_id IS NOT NULL)
         )
    INTO result
    FROM public.clients c
    LEFT JOIN public.trainers t ON t.id = c.trainer_id
   WHERE lower(c.email) = lower(v_contact)
      OR c.phone = v_contact
   LIMIT 1;

  RETURN coalesce(result, json_build_object('found', false));
END;
$function$;

-- ── 7. Pass prices are bounded ──────────────────────────────────────────────
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS plans_price_range;
ALTER TABLE public.plans ADD CONSTRAINT plans_price_range CHECK (price IS NULL OR (price >= 0 AND price <= 100000));
