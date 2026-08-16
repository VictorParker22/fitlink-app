-- ============================================================
-- Backfill client_onboarded metadata for athletes who finished intake
-- but whose metadata write was silently lost.
--
-- Same root cause as backfill_coach_onboarded.sql: the wizard called
-- supabase.auth.updateUser({...}) inside a try/catch, but that call
-- RESOLVES with { error } rather than throwing, so failures were
-- invisible. Combined with sign-out clearing the device flag, those
-- athletes were sent back through intake on every login.
--
-- Evidence used: the athlete has a clients row that is past the initial
-- invite state — they have an assessment on file, or a coach has given
-- them a plan, or they have real training history (assigned workouts,
-- logged workouts, or an enrollment). A brand-new athlete who has never
-- completed intake has none of these and correctly still sees it.
--
-- NOTE: assessment_data->'intake' is deliberately NOT the test. The
-- intake writer was itself broken (wrong filter column + writes to
-- columns that do not exist), so no athlete has that key yet even if
-- they completed the wizard. That bug is fixed in
-- app/(auth)/client-onboarding.tsx; this backfill only restores the
-- completion flag.
--
-- Merges into existing metadata rather than replacing it. Re-runnable.
-- ============================================================

UPDATE auth.users u
SET raw_user_meta_data =
      COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('client_onboarded', true)
FROM clients c
WHERE c.auth_user_id = u.id
  AND u.raw_user_meta_data->>'client_onboarded' IS DISTINCT FROM 'true'
  AND (
    c.assessment_data IS NOT NULL
    OR c.plan_id IS NOT NULL
    OR EXISTS (SELECT 1 FROM client_workouts cw WHERE cw.client_id = c.id)
    OR EXISTS (SELECT 1 FROM client_plan_enrollments e WHERE e.client_id = c.id)
  );
