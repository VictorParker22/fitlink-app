-- ============================================================
-- Security hardening, Phase A3 — function EXECUTE grants, correctly.
--
-- Two failed attempts, both worth recording so nobody repeats them:
--   Phase A  did REVOKE ... FROM anon        → no-op: PUBLIC still granted.
--   Phase A2 did REVOKE ... FROM PUBLIC      → no-op: Supabase ALSO grants
--                                              EXECUTE explicitly to the
--                                              anon and authenticated roles.
-- Both grants exist independently, so a revoke must name all three:
--   REVOKE EXECUTE ON FUNCTION f FROM PUBLIC, anon, authenticated;
-- then GRANT back to exactly the roles that need it.
--
-- Verify with has_function_privilege('anon', oid, 'EXECUTE'), never by
-- reading the migration and assuming.
--
-- Re-runnable.
-- ============================================================

-- ── Pre-signup: must stay anonymous ─────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.lookup_client_by_contact(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.lookup_client_by_contact(text) TO anon, authenticated;

-- Marketplace seat count on publicly-browsable plans; returns a bare integer.
REVOKE EXECUTE ON FUNCTION public.cohort_member_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cohort_member_count(uuid) TO anon, authenticated;

-- ── Authenticated only (each also checks auth.uid() internally) ─────
REVOKE EXECUTE ON FUNCTION public.link_client_to_auth_user(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.link_client_to_auth_user(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_conversation_unread(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_conversation_unread(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_client_and_notify(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_client_and_notify(text, text, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_client_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_client_account() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_trainer_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.delete_trainer_account() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.publish_plan_track(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.publish_plan_track(uuid, jsonb, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.increment_viewer_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_viewer_count(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.decrement_viewer_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.decrement_viewer_count(uuid) TO authenticated;

-- ── Service role only ───────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_coach_watch_minutes(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_coach_watch_minutes(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recalc_class_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recalc_class_stats(uuid) TO service_role;

-- ── Trigger functions: nobody calls these directly ──────────────────
REVOKE EXECUTE ON FUNCTION public.class_completions_sync_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_client_user()       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_client_auth_user()        FROM PUBLIC, anon, authenticated;
