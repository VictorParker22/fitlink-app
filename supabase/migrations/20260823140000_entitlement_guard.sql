-- ============================================================
-- SECURITY FIX — entitlement columns were self-writable.
--
-- The intent was "only the revenuecat-webhook (service role) writes
-- elite_until / premium_until." The mechanism — column-level
-- REVOKE UPDATE — does NOT work: `authenticated` holds TABLE-WIDE
-- UPDATE on both tables, and Postgres column privileges are additive,
-- so the table grant still confers column update. Combined with the
-- self-update RLS policies ("Clients can update own row" USING
-- auth_user_id = auth.uid(); "trainers_update_own" USING id =
-- auth.uid()), any authenticated user could PostgREST-patch their own
-- row and grant themselves free Elite / Solo (and, for coaches, the
-- 5% fee). Verified exploitable against production 2026-08-23.
--
-- Fix: BEFORE UPDATE triggers that reject any change to the protected
-- column unless the caller is a privileged role. PostgREST sets the
-- session role to `service_role` for service-key requests (the
-- webhook) and `authenticated` for user JWTs, so current_user is the
-- reliable discriminator; direct admin roles are allowed for
-- migrations/support. Triggers fire for service_role (unlike RLS,
-- which it bypasses), so the webhook path stays open and every user
-- path is blocked.
-- ============================================================

-- SECURITY INVOKER (the default) is REQUIRED here: a SECURITY DEFINER
-- trigger runs as its owner (postgres), so current_user would always be
-- 'postgres' and the guard would pass for everyone — the exact bug this
-- migration's own test caught. As invoker, current_user is the real
-- session role PostgREST set (authenticated / service_role), which is
-- what we must discriminate on. The function needs no elevated rights.
CREATE OR REPLACE FUNCTION public.guard_entitlement_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_role text := current_user;
  v_privileged boolean := v_role IN ('service_role', 'supabase_admin', 'postgres');
BEGIN
  IF TG_TABLE_NAME = 'trainers' THEN
    IF NEW.elite_until IS DISTINCT FROM OLD.elite_until AND NOT v_privileged THEN
      RAISE EXCEPTION 'elite_until is set by billing only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'clients' THEN
    IF NEW.premium_until IS DISTINCT FROM OLD.premium_until AND NOT v_privileged THEN
      RAISE EXCEPTION 'premium_until is set by billing only'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_elite ON public.trainers;
CREATE TRIGGER trg_guard_elite
  BEFORE UPDATE ON public.trainers
  FOR EACH ROW EXECUTE FUNCTION public.guard_entitlement_columns();

DROP TRIGGER IF EXISTS trg_guard_premium ON public.clients;
CREATE TRIGGER trg_guard_premium
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.guard_entitlement_columns();
