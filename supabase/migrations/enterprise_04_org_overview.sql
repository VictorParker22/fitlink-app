-- ============================================================
-- Enterprise, step 4 — what the org overview (design 29a) actually needs.
--
-- 29a shows a coach table with: role, athletes, revenue this month, and LAST
-- ACTIVE. Three of those are derivable from what exists. "Last active" is not
-- recorded anywhere, so the design would have had to invent it.
--
-- HONEST DEFINITION. "Last active" here means the last time the coach did
-- something that WRITES — published a plan, logged a session, sent a message.
-- It is not a session heartbeat and it is not presence: a coach reading their
-- roster for an hour does not update it. That is deliberate. A gym owner
-- looking at this column is asking "is this coach working", and a value that
-- ticks over on idle app-open would answer a different question while looking
-- like it answered that one.
--
-- NULL means never — the UI must render that as "never", never as "just now"
-- and never as a dash that reads like a formatting bug.
--
-- Re-runnable.
-- ============================================================

ALTER TABLE public.trainers ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS trainers_last_active_idx
  ON public.trainers (last_active_at DESC NULLS LAST)
  WHERE org_id IS NOT NULL;

-- Touch the coach's activity stamp. Cheap enough to call on any real write.
CREATE OR REPLACE FUNCTION public.touch_trainer_activity()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  UPDATE public.trainers SET last_active_at = now() WHERE id = auth.uid();
$function$;

REVOKE EXECUTE ON FUNCTION public.touch_trainer_activity() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.touch_trainer_activity() TO authenticated;

-- Stamp it from the writes a coach actually performs, via triggers, so the
-- app cannot forget to call it and the value cannot drift from reality.
CREATE OR REPLACE FUNCTION public.stamp_trainer_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.trainers SET last_active_at = now() WHERE id = auth.uid();
  END IF;
  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.stamp_trainer_activity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS stamp_activity_on_message ON public.messages;
CREATE TRIGGER stamp_activity_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.stamp_trainer_activity();

DROP TRIGGER IF EXISTS stamp_activity_on_client_workout ON public.client_workouts;
CREATE TRIGGER stamp_activity_on_client_workout
  AFTER INSERT ON public.client_workouts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_trainer_activity();

DROP TRIGGER IF EXISTS stamp_activity_on_plan ON public.plans;
CREATE TRIGGER stamp_activity_on_plan
  AFTER INSERT OR UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.stamp_trainer_activity();


-- ── The org overview, as one query the screen can trust ─────────────
-- Returns a row per coach on a seat. Every figure is computed from real rows;
-- nothing is estimated. A coach with no athletes returns zeros, which is TRUE
-- (they are on a seat and have nobody) — distinct from NULL, which the
-- revenue column uses to mean "no payment data readable".
CREATE OR REPLACE FUNCTION public.org_overview(p_org_id uuid)
RETURNS TABLE (
  trainer_id      uuid,
  name            text,
  email           text,
  avatar_url      text,
  role            public.org_role,
  athlete_count   bigint,
  revenue_cents   bigint,
  last_active_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT
    t.id,
    t.name,
    t.email,
    t.avatar_url,
    m.role,
    (SELECT count(*) FROM public.clients c WHERE c.trainer_id = t.id),
    -- Calendar month to date, matching what 29a's header claims.
    (SELECT COALESCE(SUM(p.amount), 0)
       FROM public.payments p
      WHERE p.trainer_id = t.id
        AND p.status = 'succeeded'
        AND p.created_at >= date_trunc('month', now())),
    t.last_active_at
  FROM public.organization_members m
  JOIN public.trainers t ON t.id = m.user_id
  WHERE m.org_id = p_org_id
    AND m.status = 'active'
    -- The caller must be an owner or admin OF THIS ORG. Enforced inside the
    -- function because it is SECURITY DEFINER and therefore bypasses the RLS
    -- that would otherwise carry this rule.
    AND public.is_org_member(p_org_id, ARRAY['owner','admin']::public.org_role[])
  ORDER BY 7 DESC NULLS LAST;
$function$;

REVOKE EXECUTE ON FUNCTION public.org_overview(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_overview(uuid) TO authenticated;
