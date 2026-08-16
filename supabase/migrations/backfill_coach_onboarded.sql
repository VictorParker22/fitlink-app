-- ============================================================
-- Backfill onboarding metadata for coaches who finished the wizard
-- but whose metadata write was silently lost.
--
-- The wizard called supabase.auth.updateUser({ data: {...} }) inside a
-- try/catch. That call RESOLVES with { error } rather than throwing, so
-- the catch never fired and failures were invisible — those coaches ended
-- up with no `onboarded` metadata at all. Combined with sign-out clearing
-- the device flag, they were sent back through the wizard on every login.
--
-- Only backfills coaches with real evidence of having got past the wizard:
-- they have working_hours set (written at the wizard's availability step),
-- or they have created clients, plans, workouts or classes. A coach who is
-- genuinely mid-signup has none of these and correctly still sees the wizard.
--
-- Merges into existing metadata rather than replacing it. Re-runnable.
-- ============================================================

UPDATE auth.users u
SET raw_user_meta_data =
      COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('onboarded', true, 'wizard_complete', true)
FROM trainers t
WHERE t.id = u.id
  AND u.raw_user_meta_data->>'onboarded' IS DISTINCT FROM 'true'
  AND (
    t.working_hours IS NOT NULL
    OR EXISTS (SELECT 1 FROM clients  c WHERE c.trainer_id  = t.id)
    OR EXISTS (SELECT 1 FROM plans    p WHERE p.trainer_id  = t.id)
    OR EXISTS (SELECT 1 FROM workouts w WHERE w.trainer_id  = t.id)
    OR EXISTS (SELECT 1 FROM classes  cl WHERE cl.trainer_id = t.id)
  );
