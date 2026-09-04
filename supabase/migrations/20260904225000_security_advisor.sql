-- ============================================================
-- Security advisor pass (Supabase linter, 2026-09-04).
--
-- 1. Trigger functions must not be callable through the REST RPC surface:
--    anon and authenticated could invoke enforce_roster_cap(),
--    enforce_roster_cap_update() and prune_solo_messages() directly. They
--    are SECURITY DEFINER trigger bodies; calling them outside a trigger
--    context errors, but there is no reason to expose them at all.
-- 2. Functions with a role-mutable search_path get it pinned to `public`
--    (their bodies reference unqualified public tables, so '' would break
--    them; pinning removes the hijack surface the linter flags).
--
-- Left as is, on purpose:
-- - trainers_public is a SECURITY DEFINER view by design: it is the
--   marketplace card (name, bio, specialisation, avatar, hours) and hides
--   every private trainer column; athletes cannot read `trainers` directly.
-- - RLS-enabled tables with no policies (ai_usage, audit_events,
--   platform_admins, security_signals, stripe_events) are service-role-only
--   by design: no policy means no access from the API roles.
-- - cohort_member_count(uuid) is a public count for the marketplace.
-- - lookup_client_by_contact is used by the pre-sign-in "already set up by a
--   coach?" lookup, so anon must keep it.
-- - Leaked-password protection is an Auth dashboard setting, not SQL.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.enforce_roster_cap() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_roster_cap_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_solo_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_entitlement_columns() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_user', 'delete_trainer_account', 'delete_client_account',
        'get_coach_watch_minutes', 'update_updated_at_column',
        'update_client_checkins_updated_at', 'set_went_live_at',
        'check_message_rate_limit', 'increment_viewer_count',
        'decrement_viewer_count', 'link_client_auth_user'
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;
