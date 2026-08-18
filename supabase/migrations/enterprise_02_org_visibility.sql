-- ============================================================
-- Enterprise, step 2 — what an org owner/admin can actually see.
--
-- THE PRIVACY LINE, decided here and enforced by which policies get an org
-- branch and which deliberately do NOT:
--
--   A gym gets BUSINESS visibility, not surveillance.
--
-- Owners and admins CAN see, for coaches in their org:
--   · the coach roster                     (who works here)
--   · those coaches' clients               (roster, status, plan)
--   · sessions and plans                   (schedule and offering)
--   · payments                             (revenue)
--
-- Owners and admins CANNOT see, and this is intentional:
--   · messages / conversations             private coach<->athlete talk
--   · client_health_snapshots              medical data
--   · progress_photos                      body photos
--   · client_checkins                      personal reflections
--   · chat attachments                     (already participant-scoped)
--
-- The athlete consented to share health data with THEIR COACH. They never
-- agreed to let their coach's employer read it, and a gym does not need it to
-- run a business. Anything on that second list stays coach-only even for org
-- members — including the coach's own manager.
--
-- Every policy below is ADDITIVE. Policies are OR-combined, so an independent
-- coach (org_id IS NULL) matches none of them and behaves exactly as before.
--
-- Re-runnable.
-- ============================================================

-- Coaches in the org whose data an admin may reach. Kept as a function so the
-- rule exists once; is_org_member() is the only tenancy check anywhere.
CREATE OR REPLACE FUNCTION public.org_visible_trainer_ids()
RETURNS TABLE (trainer_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT t.id
  FROM public.trainers t
  WHERE t.org_id IS NOT NULL
    AND public.is_org_member(t.org_id, ARRAY['owner','admin']::public.org_role[]);
$function$;

REVOKE EXECUTE ON FUNCTION public.org_visible_trainer_ids() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_visible_trainer_ids() TO authenticated;


-- ── Coach roster ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins read their coaches" ON public.trainers;
CREATE POLICY "Org admins read their coaches"
  ON public.trainers FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL
    AND public.is_org_member(org_id, ARRAY['owner','admin']::public.org_role[])
  );


-- ── Client roster (business visibility) ─────────────────────────────
-- SELECT only. An org admin does not get to edit, reassign or delete another
-- coach's athlete: Phase G's binding guard still applies, and nothing here
-- grants a write.
DROP POLICY IF EXISTS "Org admins read org clients" ON public.clients;
CREATE POLICY "Org admins read org clients"
  ON public.clients FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT trainer_id FROM public.org_visible_trainer_ids()));


-- ── Schedule and offering ───────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins read org sessions" ON public.sessions;
CREATE POLICY "Org admins read org sessions"
  ON public.sessions FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT trainer_id FROM public.org_visible_trainer_ids()));

DROP POLICY IF EXISTS "Org admins read org plans" ON public.plans;
CREATE POLICY "Org admins read org plans"
  ON public.plans FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT trainer_id FROM public.org_visible_trainer_ids()));


-- ── Revenue ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admins read org payments" ON public.payments;
CREATE POLICY "Org admins read org payments"
  ON public.payments FOR SELECT TO authenticated
  USING (trainer_id IN (SELECT trainer_id FROM public.org_visible_trainer_ids()));


-- ── Deliberately NOT extended (see the header) ──────────────────────
-- messages, conversations, client_health_snapshots, progress_photos,
-- client_checkins, client_meal_logs, client_workout_logs, gym_visits.
--
-- If a future requirement asks for any of these at org level, it needs an
-- athlete-facing consent step first, not a policy edit. Recorded here so the
-- omission reads as a decision rather than an oversight.
