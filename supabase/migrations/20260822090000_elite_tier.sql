-- ============================================================
-- Elite becomes real on the server.
--
-- Until now "Elite" existed only as a client-side RevenueCat entitlement:
-- nothing in the database knew who was Elite, the promised 5% fee had no
-- trusted source, and every gate was an if-statement in the app. This
-- migration gives Elite a server-side spine:
--
--   1. trainers.elite_until — set ONLY by the revenuecat-webhook edge
--      function (service role), fed by RevenueCat's signed webhooks.
--      The client can claim anything; the fee math never asks it.
--   2. payment_split_for_trainer() learns the Elite fee: 5% (500 bps)
--      while elite_until is in the future, 10% otherwise. Org seats
--      keep their existing "seat is the fee" zero.
--   3. A roster cap for the free tier: 5 active athletes. Enforced at
--      the database so a patched client cannot skip the wall. Existing
--      rosters are grandfathered — the trigger only blocks NEW inserts
--      beyond the cap, it never touches rows already there.
--
-- The packaging doctrine (.agents/PRICING_TIERS.md): free is a complete
-- coaching business for a starting roster; Elite gates the things that
-- scale with success (roster size, the fee, live broadcasting, AI).
-- That shape is also the multi-account defense — splitting a roster
-- across free accounts fragments the coach's own payouts, Stripe KYC,
-- and athlete experience, which costs more than $29.99/mo.
-- ============================================================

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS elite_until timestamptz;

COMMENT ON COLUMN public.trainers.elite_until IS
  'Elite entitlement expiry, written only by the revenuecat-webhook function. Elite = elite_until > now().';

-- trainers is user-updatable via RLS; elite_until must not be. Column-level
-- privileges: strip UPDATE on this column from authenticated users.
REVOKE UPDATE (elite_until) ON public.trainers FROM authenticated;

-- ── Fee split learns Elite ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payment_split_for_trainer(p_trainer_id uuid)
RETURNS TABLE (
  platform_fee_bps integer,
  org_share_bps    integer,
  org_id           uuid,
  coach_keeps_bps  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    -- Precedence: org seat (0 — the seat is the fee) > Elite (500) >
    -- platform default. 500 is deliberately a constant, not config: the
    -- Elite discount is a product promise ("half the fee"), not a knob.
    CASE WHEN t.org_id IS NOT NULL THEN 0
         WHEN t.elite_until IS NOT NULL AND t.elite_until > now() THEN 500
         ELSE (SELECT pc.platform_fee_bps FROM public.platform_config pc WHERE pc.id)
    END AS platform_fee_bps,
    COALESCE(o.org_share_bps, 0) AS org_share_bps,
    t.org_id,
    10000
      - CASE WHEN t.org_id IS NOT NULL THEN 0
             WHEN t.elite_until IS NOT NULL AND t.elite_until > now() THEN 500
             ELSE (SELECT pc.platform_fee_bps FROM public.platform_config pc WHERE pc.id)
        END
      - COALESCE(o.org_share_bps, 0) AS coach_keeps_bps
  FROM public.trainers t
  LEFT JOIN public.organizations o ON o.id = t.org_id
  WHERE t.id = p_trainer_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.payment_split_for_trainer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.payment_split_for_trainer(uuid) TO authenticated, service_role;

-- ── Free-tier roster cap ────────────────────────────────────────────
-- 5 non-inactive athletes on free; unlimited on Elite and org seats.
-- Raised as an exception the app recognises by message prefix.
CREATE OR REPLACE FUNCTION public.enforce_roster_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_elite boolean;
  v_org uuid;
  v_count integer;
BEGIN
  SELECT (t.elite_until IS NOT NULL AND t.elite_until > now()), t.org_id
    INTO v_elite, v_org
    FROM public.trainers t WHERE t.id = NEW.trainer_id;

  IF v_elite OR v_org IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.clients c
   WHERE c.trainer_id = NEW.trainer_id
     AND COALESCE(c.status, 'active') <> 'inactive';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'roster_limit: free plan holds 5 active athletes; Elite is unlimited'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roster_cap ON public.clients;
CREATE TRIGGER trg_roster_cap
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_roster_cap();
