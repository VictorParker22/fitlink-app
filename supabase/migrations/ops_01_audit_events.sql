-- ============================================================
-- Ops, step 1 — the telemetry the status centre needs to exist at all.
--
-- Design turn 27 asks for two screens: "is the product healthy" and "is
-- someone attacking it". Neither is buildable today because NOTHING is
-- recorded — no audit log, no auth-failure stream, no rate-limit counters. If
-- 27a/27b were built now, every number on them would be invented, which is the
-- exact thing this codebase spends its time deleting (INVARIANTS §4).
--
-- This is the emitting half. The dashboard comes after there is something true
-- to show.
--
-- THE DESIGN CONSTRAINT THAT SHAPES THE SCHEMA. Turn 27: "every automatic
-- action is stated together with who it may have hurt", and its follow-on:
-- "the recommended action pairs mitigation with repair — block the attacker
-- and free the three real people caught in it."
--
-- That is not a UI note, it is a data requirement. A signal that records only
-- "blocked AS-9009" CANNOT render that screen. So `collateral_count` is a
-- first-class column, and it is NULLABLE with a specific meaning: NULL is
-- "we have not measured who else this caught", which the UI must show as
-- unknown — never as zero. Zero is a claim that nobody was hurt.
--
-- Re-runnable.
-- ============================================================

DO $do$ BEGIN
  CREATE TYPE public.audit_severity AS ENUM ('info', 'warn', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $do$;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id          bigserial PRIMARY KEY,
  -- Dotted namespace: 'auth.denied', 'payment.failed', 'policy.blocked',
  -- 'account.binding_rejected'. Kept as text so a new emitter never needs a
  -- migration to start recording.
  event_type  text NOT NULL,
  severity    public.audit_severity NOT NULL DEFAULT 'info',
  -- Who acted. NULL for anonymous or unidentified callers — which is itself
  -- the interesting case for attack signals.
  actor_id    uuid,
  -- What was acted on: a function name, a table, an endpoint.
  subject     text,
  -- Free-form context. NEVER put credentials, tokens or message bodies here.
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The two access patterns the dashboard has: "what happened recently" and
-- "how much of this type is happening".
CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON public.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_type_created_idx
  ON public.audit_events (event_type, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- No policy at all, deliberately. RLS on with zero policies denies every
-- request from anon and authenticated; the service role bypasses RLS and is
-- the only reader. This is an internal log — "the room nobody outside the
-- company sees" — and an audit trail that its subjects can read is worth
-- much less.


-- ── Attack signals: the aggregated view the 27b screen renders ──────
CREATE TABLE IF NOT EXISTS public.security_signals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'card_testing', 'credential_stuffing', 'enumeration', ...
  kind          text NOT NULL,
  severity      public.audit_severity NOT NULL DEFAULT 'warn',
  title         text NOT NULL,
  summary       text,
  -- Signals rank by BLAST RADIUS, not recency (turn 27). This is the number
  -- they sort on: how many accounts/users the pattern could reach.
  blast_radius  integer,
  -- What was done automatically, in plain words, or NULL if nothing was.
  auto_action   text,
  -- Who the auto-action may have caught who was not the attacker.
  -- NULL = not measured; the UI shows "unknown", never "0". Zero here is a
  -- positive claim that nobody legitimate was affected.
  collateral_count integer,
  -- 'needs_decision' | 'auto_mitigated' | 'resolved'
  status        text NOT NULL DEFAULT 'needs_decision',
  -- The pager owner is named ON SCREEN (turn 27), so it is stored, not
  -- looked up from a rota the dashboard does not have.
  on_call       text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS security_signals_open_idx
  ON public.security_signals (status, blast_radius DESC NULLS LAST)
  WHERE resolved_at IS NULL;

ALTER TABLE public.security_signals ENABLE ROW LEVEL SECURITY;
-- Same as audit_events: no policies, service-role only.


-- ── The emitter ─────────────────────────────────────────────────────
-- SECURITY DEFINER so a denied caller can still have their denial recorded —
-- the table itself grants nobody access. Never raises: a failure to log must
-- not turn into a failure of the thing being logged.
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_type text,
  p_severity   public.audit_severity DEFAULT 'info',
  p_subject    text DEFAULT NULL,
  p_detail     jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public.audit_events (event_type, severity, actor_id, subject, detail)
  VALUES (p_event_type, p_severity, auth.uid(), p_subject, coalesce(p_detail, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- Losing a log line is bad; failing a payment or a login because the log
  -- was unavailable is worse.
  RAISE WARNING 'log_audit_event failed: %', SQLERRM;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(text, public.audit_severity, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, public.audit_severity, text, jsonb)
  TO authenticated, service_role;


-- ── Wire the existing guards to emit ────────────────────────────────
-- These two triggers already REJECT the attacks. Until now the rejection was
-- invisible: nobody could tell whether it fired once or ten thousand times.
CREATE OR REPLACE FUNCTION public.guard_client_auth_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_changed boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.auth_user_id IS NOT NULL;
  ELSE
    v_changed := NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
                 AND NEW.auth_user_id IS NOT NULL;
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.auth_user_id = v_caller THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.auth_user_id = NEW.auth_user_id
      AND (TG_OP = 'INSERT' OR c.id <> NEW.id)
  ) THEN
    PERFORM public.log_audit_event(
      'account.binding_rejected',
      'critical',
      'clients',
      jsonb_build_object('attempted_auth_user_id', NEW.auth_user_id, 'op', TG_OP)
    );
    RAISE EXCEPTION 'That account already belongs to a coach';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_client_auth_binding() FROM PUBLIC, anon, authenticated;
