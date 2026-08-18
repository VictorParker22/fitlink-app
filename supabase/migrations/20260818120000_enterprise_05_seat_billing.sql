-- ============================================================
-- Enterprise, step 5 — seat billing, and the hole it exposed.
--
-- THE HOLE. enterprise_01 says, in a comment above the INSERT policy:
--   "Billing columns are deliberately NOT writable here — seat_limit and the
--    Stripe ids are set server-side once a subscription is actually paid for,
--    so a gym cannot grant itself seats."
-- That is true of INSERT and FALSE of UPDATE. "Owners update their
-- organization" has no column restriction, and it cannot have one: RLS never
-- sees OLD, so a policy cannot say "every column except these four"
-- (INVARIANTS §RLS-cannot-see-OLD). An owner could therefore
--   UPDATE organizations SET seat_limit = 9999 WHERE id = <their own org>
-- and hire unlimited coaches for nothing. Column immutability needs a TRIGGER,
-- which is what this migration adds.
--
-- THE SECOND HOLE, in guard_org_membership: `IF v_seats IS NOT NULL THEN`
-- means a NULL seat_limit is UNLIMITED. NULL is meant to read as "no seats
-- provisioned" — the value every org has the moment it is created — so the
-- free tier was, in effect, infinite. NULL now means ONE seat: the owner
-- themselves. A gym can exist and be set up for free; the second coach is what
-- costs money. That is also the honest sales story.
--
-- WHAT REDUCING SEATS DOES NOT DO. Lowering the seat count, or letting the
-- subscription lapse, does NOT evict anybody. Coaches keep working and keep
-- their athletes; the org simply cannot activate anyone new until seats are
-- available again. Retroactively cutting a working coach off mid-month because
-- a card expired would take the gym's billing problem and hand it to the
-- athletes who showed up for a session. Enforcement belongs at the point of
-- hiring, not mid-relationship.
--
-- Re-runnable.
-- ============================================================

-- Billing state as Stripe reports it. Deliberately a text mirror of Stripe's
-- own vocabulary ('active', 'past_due', 'canceled', ...) rather than our own
-- enum, so a status Stripe invents later lands here instead of erroring.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS seat_status       text,
  ADD COLUMN IF NOT EXISTS seat_price_cents  integer,
  ADD COLUMN IF NOT EXISTS seats_updated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS seats_renew_at    timestamptz;

COMMENT ON COLUMN public.organizations.seat_limit IS
  'Seats paid for, set ONLY by apply_org_seats() from a Stripe webhook. NULL means none provisioned, which grants exactly one seat (the owner).';


-- ── Column immutability: the app may never write billing state ──────
-- SECURITY DEFINER is not needed — this reads only OLD/NEW — but a BEFORE
-- trigger is, because that is the only place OLD exists.
CREATE OR REPLACE FUNCTION public.guard_org_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  -- auth.uid() IS NULL means the service role or another trigger. Those are
  -- the only writers allowed, and apply_org_seats() is the only one that does.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  IF NEW.seat_limit             IS DISTINCT FROM OLD.seat_limit
  OR NEW.seat_status            IS DISTINCT FROM OLD.seat_status
  OR NEW.seat_price_cents       IS DISTINCT FROM OLD.seat_price_cents
  OR NEW.seats_renew_at         IS DISTINCT FROM OLD.seats_renew_at
  OR NEW.seats_updated_at       IS DISTINCT FROM OLD.seats_updated_at
  OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
  OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
  THEN
    RAISE EXCEPTION 'Billing columns are set by Stripe, not by the app';
  END IF;

  -- The gym's cut of its coaches' revenue stays owner-writable — it is a
  -- commercial term, not a paid entitlement — but a silent change redirects
  -- money that coaches already earn, so every change is recorded.
  IF NEW.org_share_bps IS DISTINCT FROM OLD.org_share_bps THEN
    INSERT INTO public.audit_events (event_type, severity, actor_id, subject, detail)
    VALUES ('org.share_changed', 'warn', auth.uid(), 'organizations',
            jsonb_build_object('org_id', NEW.id,
                               'from_bps', OLD.org_share_bps,
                               'to_bps', NEW.org_share_bps));
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_org_billing_columns_trg ON public.organizations;
CREATE TRIGGER guard_org_billing_columns_trg
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_billing_columns();

REVOKE EXECUTE ON FUNCTION public.guard_org_billing_columns() FROM PUBLIC, anon, authenticated;


-- ── NULL seat_limit is one seat, not infinity ───────────────────────
-- Rewritten wholesale rather than patched, so the file that defines the rule
-- is the file you are reading.
CREATE OR REPLACE FUNCTION public.guard_org_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_seats  integer;
  v_active integer;
BEGIN
  IF v_caller IS NULL THEN RETURN NEW; END IF;  -- service role / triggers

  -- Becoming active is the invited person's act, and nobody else's.
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NEW.user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Only the invited person can accept an invitation';
    END IF;
  END IF;

  IF NEW.status = 'active' THEN
    SELECT seat_limit INTO v_seats FROM public.organizations WHERE id = NEW.org_id;
    -- NULL = nothing provisioned = one seat for the owner. Never unlimited.
    v_seats := COALESCE(v_seats, 1);

    SELECT count(*) INTO v_active FROM public.organization_members m
     WHERE m.org_id = NEW.org_id AND m.status = 'active' AND m.id <> NEW.id;

    IF v_active >= v_seats THEN
      RAISE EXCEPTION 'This organization has no seats left (% of % in use)',
        v_active, v_seats;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_org_membership() FROM PUBLIC, anon, authenticated;


-- ── The only writer of seat state ───────────────────────────────────
-- Called by the Stripe webhook under the service role. Not grantable to
-- anyone: seats follow money, and money is Stripe's word, not the app's.
CREATE OR REPLACE FUNCTION public.apply_org_seats(
  p_org_id        uuid,
  p_seats         integer,
  p_status        text,
  p_customer_id   text DEFAULT NULL,
  p_sub_id        text DEFAULT NULL,
  p_price_cents   integer DEFAULT NULL,
  p_renew_at      timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old integer;
BEGIN
  SELECT seat_limit INTO v_old FROM public.organizations WHERE id = p_org_id;

  UPDATE public.organizations SET
    seat_limit             = p_seats,
    seat_status            = p_status,
    seat_price_cents       = COALESCE(p_price_cents, seat_price_cents),
    seats_renew_at         = COALESCE(p_renew_at, seats_renew_at),
    stripe_customer_id     = COALESCE(p_customer_id, stripe_customer_id),
    stripe_subscription_id = COALESCE(p_sub_id, stripe_subscription_id),
    seats_updated_at       = now(),
    updated_at             = now()
  WHERE id = p_org_id;

  -- Seat changes move real money and can silently block hiring. Logged so the
  -- ops dashboard can answer "why can this gym not add a coach".
  INSERT INTO public.audit_events (event_type, severity, actor_id, subject, detail)
  VALUES ('org.seats_applied',
          CASE WHEN p_status IN ('active', 'trialing') THEN 'info' ELSE 'warn' END,
          NULL, 'organizations',
          jsonb_build_object('org_id', p_org_id, 'from', v_old,
                             'to', p_seats, 'status', p_status));
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_org_seats(uuid, integer, text, text, text, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;


-- ── What the billing screen (design 29b) reads ──────────────────────
-- One call, owner/admin only, enforced inside the function because
-- SECURITY DEFINER bypasses the RLS that would otherwise carry the rule.
--
-- seats_used counts ACTIVE members only. Pending invitations are returned
-- separately rather than folded in, because an invitation is not a seat until
-- someone accepts it — showing "5 of 5 used" when two of those are unaccepted
-- would tell a gym owner they are full when they are not.
CREATE OR REPLACE FUNCTION public.org_billing(p_org_id uuid)
RETURNS TABLE (
  org_name         text,
  seats_used       integer,
  seats_paid       integer,      -- NULL = none provisioned; the UI must say so
  seats_effective  integer,      -- what the guard actually enforces
  invites_pending  integer,
  seat_status      text,         -- NULL = never subscribed
  seat_price_cents integer,
  seats_renew_at   timestamptz,
  org_share_bps    integer,
  is_owner         boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    o.name,
    (SELECT count(*)::integer FROM public.organization_members m
      WHERE m.org_id = o.id AND m.status = 'active'),
    o.seat_limit,
    COALESCE(o.seat_limit, 1),
    (SELECT count(*)::integer FROM public.organization_members m
      WHERE m.org_id = o.id AND m.status = 'invited'),
    o.seat_status,
    o.seat_price_cents,
    o.seats_renew_at,
    o.org_share_bps,
    public.is_org_member(o.id, ARRAY['owner']::public.org_role[])
  FROM public.organizations o
  WHERE o.id = p_org_id
    AND public.is_org_member(o.id, ARRAY['owner','admin']::public.org_role[]);
$function$;

REVOKE EXECUTE ON FUNCTION public.org_billing(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_billing(uuid) TO authenticated;
