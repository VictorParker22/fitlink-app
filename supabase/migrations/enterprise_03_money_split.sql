-- ============================================================
-- Enterprise, step 3 — one server-side truth for where an athlete's dollar goes.
--
-- From the design intent (turn 29): "Money is stated as a split the owner sets,
-- not a fee buried in terms." That is not expressible today. The platform's cut
-- is the literal 0.10 hardcoded in SIX places — three edge functions and three
-- client mirrors (analytics.tsx, create-plan.tsx, checkout.tsx) — which means
-- the number a coach is shown and the number Stripe actually takes are two
-- different constants that happen to agree.
--
-- TWO DIFFERENT CUTS, deliberately separate:
--
--   platform_fee_bps  what FitLink takes. 1000 bps (10%) for an independent
--                     coach. ZERO for a coach on an org seat — the gym already
--                     pays FitLink per seat, and charging both would be the
--                     "fee buried in terms" the design rejects.
--
--   org_share_bps     what the GYM takes from its coaches' athlete revenue.
--                     Set by the owner, visible to coaches (29a shows it on the
--                     org overview). Zero for independents, who have no org.
--
-- Basis points, not floats: 1000 = 10.00%. Money maths on floats is how you
-- get a cent of drift per transaction and an unreconcilable ledger.
--
-- Re-runnable.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_share_bps integer NOT NULL DEFAULT 0;

-- A gym taking more than half of a coach's revenue is far more likely to be a
-- typo or a misplaced decimal than an intent, and it is the coach who pays for
-- that mistake. Bounded here rather than trusted to a form.
DO $do$ BEGIN
  ALTER TABLE public.organizations
    ADD CONSTRAINT organizations_org_share_bps_range
    CHECK (org_share_bps >= 0 AND org_share_bps <= 5000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

-- The platform default, held as data rather than as a literal in six files.
CREATE TABLE IF NOT EXISTS public.platform_config (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  platform_fee_bps   integer NOT NULL DEFAULT 1000,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_config (id, platform_fee_bps)
VALUES (true, 1000)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in: a coach is entitled to know the fee before
-- they price a pass, and create-plan shows it. Writable by nobody through the
-- API — changing the platform's own cut is a service-role act.
DROP POLICY IF EXISTS "Anyone signed in reads platform config" ON public.platform_config;
CREATE POLICY "Anyone signed in reads platform config"
  ON public.platform_config FOR SELECT TO authenticated
  USING (true);


-- ── The single source of truth ──────────────────────────────────────
-- Every payment path and every screen that quotes a number calls this. It
-- returns the whole split at once so a caller cannot take the platform fee
-- from here and the org share from somewhere else.
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
    -- A coach on an org seat pays no marketplace fee; the seat is the fee.
    CASE WHEN t.org_id IS NOT NULL THEN 0
         ELSE (SELECT pc.platform_fee_bps FROM public.platform_config pc WHERE pc.id)
    END AS platform_fee_bps,
    COALESCE(o.org_share_bps, 0) AS org_share_bps,
    t.org_id,
    10000
      - CASE WHEN t.org_id IS NOT NULL THEN 0
             ELSE (SELECT pc.platform_fee_bps FROM public.platform_config pc WHERE pc.id)
        END
      - COALESCE(o.org_share_bps, 0) AS coach_keeps_bps
  FROM public.trainers t
  LEFT JOIN public.organizations o ON o.id = t.org_id
  WHERE t.id = p_trainer_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.payment_split_for_trainer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.payment_split_for_trainer(uuid) TO authenticated, service_role;


-- ── Owners set the split; the constraint above bounds it ────────────
-- Deliberately NOT part of the general "Owners update their organization"
-- policy: that one already exists, and this comment records why no extra
-- policy is added here — org_share_bps is an ordinary column on organizations,
-- so the owner-only UPDATE policy already governs it, and the CHECK bounds it.
-- Coaches see the value through the org they belong to (they can read their
-- own organization row), which is what "coaches see it" in 29a requires.
