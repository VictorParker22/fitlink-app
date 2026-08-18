-- ============================================================
-- Ops, step 2 — the dashboard's door, and the two questions behind it.
--
-- ops_01 built the emitter and said: "The dashboard comes after there is
-- something true to show." This is that dashboard's data layer, and it ships
-- ONLY the figures that are true today.
--
-- WHAT DESIGN 27a ASKS FOR, AND WHAT ACTUALLY EXISTS.
-- 27a shows: API p95, error rate, crash-free sessions, downloads today, push
-- delivery, release adoption, dependency health. Of those, exactly ZERO are
-- recorded anywhere in this system:
--   · p95 / error rate      — needs APM on the edge functions. Not installed.
--   · crash-free / adoption — needs App Store Connect + Play Console ingestion.
--   · downloads             — same two APIs.
--   · push delivery         — needs Expo/APNs receipt ingestion. We fire and
--                             forget today; the receipts are never read back.
--   · dependency health     — needs real probes, not a green dot we draw.
-- So the screen renders those as an explicit "not measured yet" list rather
-- than plausible numbers. A green dashboard that is green because nothing is
-- checking is worse than no dashboard: it answers "is it up" with a guess and
-- looks exactly like an answer.
--
-- WHAT IS REAL, and therefore what ops_health() returns: payment outcomes,
-- authentication denials, signups, and coach activity. All four are counted
-- from rows this database already holds.
--
-- 27b IS BUILDABLE, because ops_01 has been emitting auth denials since it
-- shipped. Its ranking rule — "by blast radius, not recency" — is honoured by
-- ordering on distinct actors affected. Its harder rule is honoured too: the
-- design insists every automatic action is stated "together with who it may
-- have hurt", and audit_events.collateral_count is NULLABLE precisely so that
-- unmeasured never renders as zero. Zero is a claim that nobody was hurt.
--
-- Re-runnable.
-- ============================================================

-- ── The door ────────────────────────────────────────────────────────
-- Internal staff only. Deliberately a table with no self-service path: rows
-- are inserted by hand, through the dashboard, by someone with database
-- access. There is no "request admin" flow and there should not be one.
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- RLS on with zero policies: anon and authenticated are denied outright, the
-- service role bypasses. Same posture as audit_events. An admin cannot even
-- read the list of admins from the app — nothing needs to.
DROP POLICY IF EXISTS "nobody reads platform admins" ON public.platform_admins;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins a WHERE a.user_id = auth.uid()
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;


-- ── The gate ────────────────────────────────────────────────────────
-- These functions are SECURITY DEFINER over tables that deny everyone, so the
-- admin check CANNOT live in RLS — RLS is exactly what DEFINER bypasses. It
-- lives at the top of each function instead. One door, not a wrapper around a
-- second callable function that would itself need guarding.
--
-- Both raise rather than returning an empty set. An empty result would be
-- indistinguishable from "a quiet day", and a dashboard that shows a calm
-- screen to someone who is not allowed to see it is the wrong failure.
CREATE OR REPLACE FUNCTION public.ops_health(p_hours integer DEFAULT 24)
RETURNS TABLE (
  window_hours          integer,
  payments_succeeded    bigint,
  payments_failed       bigint,
  payment_success_rate  numeric,
  revenue_cents         bigint,
  auth_denials          bigint,
  denial_actors         bigint,
  denial_anonymous      bigint,
  new_coaches           bigint,
  new_athletes          bigint,
  coaches_active        bigint,
  critical_events       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(hours => GREATEST(1, LEAST(p_hours, 720)));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  RETURN QUERY
  WITH pay AS (
    SELECT
      count(*) FILTER (WHERE status = 'succeeded') AS ok,
      count(*) FILTER (WHERE status IN ('failed', 'requires_payment_method', 'canceled')) AS bad,
      COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0) AS cents
    FROM public.payments WHERE created_at >= v_since
  ),
  denials AS (
    SELECT
      count(*) AS n,
      count(DISTINCT actor_id) FILTER (WHERE actor_id IS NOT NULL) AS actors,
      count(*) FILTER (WHERE actor_id IS NULL) AS anon_n,
      count(*) FILTER (WHERE severity = 'critical') AS crit
    FROM public.audit_events
    WHERE created_at >= v_since AND event_type LIKE 'auth.%'
  )
  SELECT
    GREATEST(1, LEAST(p_hours, 720)),
    pay.ok, pay.bad,
    CASE WHEN pay.ok + pay.bad = 0 THEN NULL
         ELSE round(100.0 * pay.ok / (pay.ok + pay.bad), 2) END,
    pay.cents,
    denials.n, denials.actors, denials.anon_n,
    (SELECT count(*) FROM public.trainers WHERE created_at >= v_since),
    (SELECT count(*) FROM public.clients  WHERE created_at >= v_since),
    (SELECT count(*) FROM public.trainers WHERE last_active_at >= v_since),
    denials.crit
  FROM pay, denials;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ops_signals(p_hours integer DEFAULT 24)
RETURNS TABLE (
  signal_key        text,
  event_type        text,
  subject           text,
  severity          public.audit_severity,
  occurrences       bigint,
  distinct_actors   bigint,
  anonymous_hits    bigint,
  first_seen        timestamptz,
  last_seen         timestamptz,
  collateral_count  integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(hours => GREATEST(1, LEAST(p_hours, 720)));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;

  RETURN QUERY
  SELECT
    e.event_type || ':' || COALESCE(e.subject, '-'),
    e.event_type,
    e.subject,
    max(e.severity),
    count(*),
    count(DISTINCT e.actor_id) FILTER (WHERE e.actor_id IS NOT NULL),
    count(*) FILTER (WHERE e.actor_id IS NULL),
    min(e.created_at),
    max(e.created_at),
    max((e.detail ->> 'collateral_count')::integer)
  FROM public.audit_events e
  WHERE e.created_at >= v_since
    AND e.severity <> 'info'
  GROUP BY 1, 2, 3
  ORDER BY 6 DESC, 5 DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ops_health(integer)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ops_signals(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ops_health(integer)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.ops_signals(integer) TO authenticated;
