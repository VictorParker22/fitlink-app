-- ============================================================
-- Pre-production audit (2026-09-01) — money integrity + consent.
--
-- 1. client_subscriptions had NO unique key on (client_id, plan_id), but
--    create-subscription and stripe-webhook both upsert with
--    onConflict 'client_id,plan_id'. Postgres rejects that (42P10), the
--    error was unchecked, and the athlete paid without ever being
--    enrolled. Add the constraint (deduping first).
-- 2. Athletes could not read their own subscription or payments rows,
--    so the membership screen was fabricated client-side. Add athlete
--    SELECT policies.
-- 3. Financial records must survive account deletion. payments and
--    client_subscriptions cascaded on trainer_id / client_id — deleting a
--    coach erased the ledger. Move to ON DELETE SET NULL.
-- 4. Deleting a plan cascaded every holder's enrollment. Block it while
--    holders exist (except inside a cascade from a coach deletion).
-- 5. Health snapshots were coach-readable regardless of the athlete's
--    health_sharing_enabled switch. Gate the RLS policy on it.
-- 6. ai_usage rows had no FK and survived account deletion.
-- 7. stripe_events: webhook event-id dedupe ledger.
-- ============================================================

-- ── 1. Unique (client_id, plan_id) on client_subscriptions ──────────
DELETE FROM public.client_subscriptions a
USING public.client_subscriptions b
WHERE a.client_id = b.client_id
  AND a.plan_id   = b.plan_id
  AND a.created_at < b.created_at;

ALTER TABLE public.client_subscriptions
  DROP CONSTRAINT IF EXISTS uq_client_plan;
ALTER TABLE public.client_subscriptions
  ADD CONSTRAINT uq_client_plan UNIQUE (client_id, plan_id);

-- ── 2. Athletes read their own money rows ───────────────────────────
DROP POLICY IF EXISTS "Athletes can view their own subscriptions" ON public.client_subscriptions;
CREATE POLICY "Athletes can view their own subscriptions"
  ON public.client_subscriptions FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Athletes can view their own payments" ON public.payments;
CREATE POLICY "Athletes can view their own payments"
  ON public.payments FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid()));

-- ── 3. Ledger survives deletion ─────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname, con.conrelid::regclass AS tbl
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.conrelid IN ('public.payments'::regclass, 'public.client_subscriptions'::regclass)
      AND att.attname IN ('trainer_id', 'client_id')
      AND con.confdeltype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_trainer_id_fkey FOREIGN KEY (trainer_id)
    REFERENCES public.trainers(id) ON DELETE SET NULL,
  ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id)
    REFERENCES public.clients(id) ON DELETE SET NULL;

ALTER TABLE public.client_subscriptions
  ADD CONSTRAINT client_subscriptions_trainer_id_fkey FOREIGN KEY (trainer_id)
    REFERENCES public.trainers(id) ON DELETE SET NULL,
  ADD CONSTRAINT client_subscriptions_client_id_fkey FOREIGN KEY (client_id)
    REFERENCES public.clients(id) ON DELETE SET NULL;

-- ── 4. Plans with holders cannot be deleted ─────────────────────────
CREATE OR REPLACE FUNCTION public.guard_plan_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
  v_holders integer;
BEGIN
  -- A cascade from a coach deleting their account arrives with
  -- pg_trigger_depth() > 0; that path is allowed through.
  IF pg_trigger_depth() > 0 THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_holders
  FROM public.clients c
  WHERE c.plan_id = OLD.id
    AND c.status IN ('active', 'trial', 'canceling');

  IF v_holders = 0 THEN
    SELECT count(*) INTO v_holders
    FROM public.client_plan_enrollments e
    WHERE e.plan_id = OLD.id AND e.status = 'active';
  END IF;

  IF v_holders > 0 THEN
    RAISE EXCEPTION 'plan_has_holders'
      USING HINT = 'Move or cancel the athletes on this pass before deleting it.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_plan_delete ON public.plans;
CREATE TRIGGER trg_guard_plan_delete
  BEFORE DELETE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.guard_plan_delete();

-- ── 5. Health snapshots honor the consent switch ────────────────────
DROP POLICY IF EXISTS "Trainers can read client snapshots" ON public.client_health_snapshots;
CREATE POLICY "Trainers can read client snapshots"
  ON public.client_health_snapshots FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.clients
      WHERE trainer_id = auth.uid()
        AND COALESCE(health_sharing_enabled, false) = true
    )
  );

-- ── 6. ai_usage dies with the account ───────────────────────────────
DELETE FROM public.ai_usage u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.user_id);

ALTER TABLE public.ai_usage
  DROP CONSTRAINT IF EXISTS ai_usage_user_id_fkey;
ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 7. Stripe webhook dedupe ledger ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id          text PRIMARY KEY,           -- Stripe event id (evt_…)
  type        text NOT NULL,
  created     timestamptz NOT NULL,       -- Stripe's event.created
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No policies: service role only.

-- Opportunistic cleanup keeps the table small.
CREATE INDEX IF NOT EXISTS idx_stripe_events_received ON public.stripe_events(received_at);

-- ── Service-role variant of trainer deletion ────────────────────────
-- The delete-trainer-account edge function cancels the coach's Stripe
-- subscriptions FIRST, then calls this with the verified user id.
CREATE OR REPLACE FUNCTION public.delete_trainer_account_for(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF current_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.trainers WHERE id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_trainer_account_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_trainer_account_for(uuid) TO service_role;
