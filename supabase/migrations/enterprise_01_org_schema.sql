-- ============================================================
-- Enterprise, step 1 — the organization model.
--
-- Today the app has exactly one tenancy boundary: trainers.id IS auth.uid().
-- A gym that employs five coaches has no representation at all. This adds one,
-- WITHOUT disturbing the boundary every hardened policy already uses.
--
-- THE INVARIANT THIS MIGRATION PROTECTS:
--   trainers.org_id IS NULL  ==  an independent coach  ==  today's behaviour,
--   byte for byte. That is the entire current user base. Nothing here changes
--   what an independent coach can see or do.
--
-- CONSENT IS STRUCTURAL, NOT POLICY. A gym owner cannot add a coach; they can
-- only invite one. Membership starts as 'invited' and only the invited user
-- can move it to 'active'. trainers.org_id is then set by trigger — it is
-- never writable by the org. Same principle as Phase G: you do not get to
-- claim somebody else's account, and a gym does not get to claim a coach's
-- athletes by administrative act.
--
-- Re-runnable.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  billing_email   text,
  -- Seats the gym is paying for. NULL = not yet provisioned.
  seat_limit      integer,
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- Who created it. Kept separate from ownership, which lives in members.
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DO $do$ BEGIN
  CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'coach');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

DO $do$ BEGIN
  CREATE TYPE public.org_member_status AS ENUM ('invited', 'active', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

CREATE TABLE IF NOT EXISTS public.organization_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NULL until the invited person actually has an account: invites are issued
  -- by email, because a gym typically invites a coach who has not signed up.
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_email text,
  role        public.org_role NOT NULL DEFAULT 'coach',
  status      public.org_member_status NOT NULL DEFAULT 'invited',
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One live membership per person per org.
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_org_user_uniq
  ON public.organization_members (org_id, user_id)
  WHERE user_id IS NOT NULL AND status <> 'removed';

CREATE INDEX IF NOT EXISTS organization_members_user_idx
  ON public.organization_members (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS organization_members_invite_email_idx
  ON public.organization_members (lower(invite_email)) WHERE status = 'invited';

-- Nullable by design: NULL is an independent coach.
ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS org_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS trainers_org_idx ON public.trainers (org_id)
  WHERE org_id IS NOT NULL;

ALTER TABLE public.organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;


-- ── The one place tenancy is decided ────────────────────────────────
-- Every org-aware policy calls this rather than inlining a join, so the rule
-- can be read, tested and changed in ONE place. SECURITY DEFINER because it
-- reads organization_members, which is itself RLS-protected — an ordinary
-- policy subquery would recurse.
CREATE OR REPLACE FUNCTION public.is_org_member(
  p_org_id uuid,
  p_roles public.org_role[] DEFAULT ARRAY['owner','admin','coach']::public.org_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role = ANY(p_roles)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, public.org_role[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_member(uuid, public.org_role[]) TO authenticated;

-- The caller's active org, or NULL. Convenience for policies and the app.
CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT m.org_id FROM public.organization_members m
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  ORDER BY m.accepted_at NULLS LAST
  LIMIT 1;
$function$;

REVOKE EXECUTE ON FUNCTION public.my_org_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.my_org_id() TO authenticated;


-- ── Consent: only the invited person may accept ─────────────────────
-- An org can create and revoke invitations. It cannot activate one, and it
-- cannot write trainers.org_id — that is set here, by trigger, only when a
-- membership actually becomes active.
CREATE OR REPLACE FUNCTION public.sync_trainer_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'active' AND NEW.user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    UPDATE public.trainers SET org_id = NEW.org_id WHERE id = NEW.user_id;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'removed' AND OLD.status = 'active'
     AND NEW.user_id IS NOT NULL THEN
    -- Leaving an org does NOT take the coach's athletes with it. They are the
    -- coach's clients, not the gym's — that is the marketplace promise.
    UPDATE public.trainers SET org_id = NULL WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_trainer_org_trg ON public.organization_members;
CREATE TRIGGER sync_trainer_org_trg
  AFTER INSERT OR UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_trainer_org();

REVOKE EXECUTE ON FUNCTION public.sync_trainer_org() FROM PUBLIC, anon, authenticated;


-- ── Guard: an org may not self-activate a membership ────────────────
CREATE OR REPLACE FUNCTION public.guard_org_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_seats integer;
BEGIN
  IF v_caller IS NULL THEN RETURN NEW; END IF;  -- service role / triggers

  -- Becoming active is the invited person's act, and nobody else's.
  IF NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NEW.user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'Only the invited person can accept an invitation';
    END IF;
  END IF;

  -- Seats are a paid limit, so it is enforced here rather than trusted to UI.
  IF NEW.status = 'active' THEN
    SELECT seat_limit INTO v_seats FROM public.organizations WHERE id = NEW.org_id;
    IF v_seats IS NOT NULL THEN
      IF (SELECT count(*) FROM public.organization_members m
          WHERE m.org_id = NEW.org_id AND m.status = 'active'
            AND m.id <> NEW.id) >= v_seats THEN
        RAISE EXCEPTION 'This organization has no seats left';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_org_membership_trg ON public.organization_members;
CREATE TRIGGER guard_org_membership_trg
  BEFORE INSERT OR UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_membership();

REVOKE EXECUTE ON FUNCTION public.guard_org_membership() FROM PUBLIC, anon, authenticated;


-- ── RLS on the new tables ───────────────────────────────────────────
DROP POLICY IF EXISTS "Members read their organization" ON public.organizations;
CREATE POLICY "Members read their organization"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Owners update their organization" ON public.organizations;
CREATE POLICY "Owners update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_org_member(id, ARRAY['owner']::public.org_role[]))
  WITH CHECK (public.is_org_member(id, ARRAY['owner']::public.org_role[]));

-- Anyone signed in may create an org; the creator becomes its owner via the
-- app's create flow. Billing columns are deliberately NOT writable here —
-- seat_limit and the Stripe ids are set server-side once a subscription is
-- actually paid for, so a gym cannot grant itself seats.
DROP POLICY IF EXISTS "Authenticated users create organizations" ON public.organizations;
CREATE POLICY "Authenticated users create organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND seat_limit IS NULL
              AND stripe_customer_id IS NULL AND stripe_subscription_id IS NULL);

DROP POLICY IF EXISTS "Members read org roster" ON public.organization_members;
CREATE POLICY "Members read org roster"
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_member(org_id, ARRAY['owner','admin']::public.org_role[])
  );

-- An invited person finds their invitation by their own verified email.
DROP POLICY IF EXISTS "Invitees read their invitation" ON public.organization_members;
CREATE POLICY "Invitees read their invitation"
  ON public.organization_members FOR SELECT TO authenticated
  USING (
    status = 'invited'
    AND invite_email IS NOT NULL
    AND lower(invite_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "Admins invite members" ON public.organization_members;
CREATE POLICY "Admins invite members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(org_id, ARRAY['owner','admin']::public.org_role[])
    AND status = 'invited'
  );

-- Two distinct write paths: an admin manages the membership (role, removal),
-- and the invited person accepts. The guard trigger enforces that only the
-- invitee can reach 'active', so the admin path cannot self-activate.
DROP POLICY IF EXISTS "Admins manage members" ON public.organization_members;
CREATE POLICY "Admins manage members"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id, ARRAY['owner','admin']::public.org_role[]))
  WITH CHECK (public.is_org_member(org_id, ARRAY['owner','admin']::public.org_role[]));

DROP POLICY IF EXISTS "Invitees accept or leave" ON public.organization_members;
CREATE POLICY "Invitees accept or leave"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (status = 'invited'
        AND lower(coalesce(invite_email,'')) = lower(coalesce(auth.jwt() ->> 'email', '')))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (status = 'invited'
        AND lower(coalesce(invite_email,'')) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );
