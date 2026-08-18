-- ============================================================
-- Security hardening, Phase A2 — function EXECUTE grants.
--
-- Phase A revoked EXECUTE from `anon` and it did nothing. Postgres
-- grants EXECUTE to **PUBLIC** by default on every function, and `anon`
-- inherits through PUBLIC — so `REVOKE ... FROM anon` is a no-op while
-- the PUBLIC grant stands. The revoke has to name PUBLIC.
--
-- Pattern below: REVOKE FROM PUBLIC, then GRANT to exactly the roles
-- that need it. Trigger functions need no grant at all (they run as the
-- table owner), so they are revoked outright.
--
-- Re-runnable.
-- ============================================================

-- ── Pre-signup, must stay anonymous ─────────────────────────────────
-- Answers "did a coach already add you?" before an account exists.
-- Phase A already stripped email/phone from its return.
REVOKE EXECUTE ON FUNCTION public.lookup_client_by_contact(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.lookup_client_by_contact(text) TO anon, authenticated;

-- ── Authenticated-only: each already checks auth.uid() internally,
--    this removes anon reachability as defence in depth ─────────────
REVOKE EXECUTE ON FUNCTION public.link_client_to_auth_user(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.link_client_to_auth_user(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_conversation_unread(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_conversation_unread(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_client_and_notify(text, text, uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_client_and_notify(text, text, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_client_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_client_account() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_trainer_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_trainer_account() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.publish_plan_track(uuid, jsonb, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.publish_plan_track(uuid, jsonb, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_viewer_count(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_viewer_count(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.decrement_viewer_count(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.decrement_viewer_count(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cohort_member_count(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cohort_member_count(uuid) TO anon, authenticated;

-- ── Service-role only ───────────────────────────────────────────────
-- Drives the class revenue share. It leaked every coach's monthly
-- engagement (and so their relative earnings) to any anon caller. Only
-- the calculate-class-revenue edge function needs it.
REVOKE EXECUTE ON FUNCTION public.get_coach_watch_minutes(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_coach_watch_minutes(text) TO service_role;

-- Recomputes aggregates from real class_completions rows. Cannot
-- falsify anything, but nothing client-side calls it either.
REVOKE EXECUTE ON FUNCTION public.recalc_class_stats(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.recalc_class_stats(uuid) TO service_role;

-- ── Trigger functions: never called directly by anyone ──────────────
REVOKE EXECUTE ON FUNCTION public.class_completions_sync_stats() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_client_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_client_auth_user() FROM PUBLIC;
