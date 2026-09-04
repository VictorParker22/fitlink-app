-- ============================================================
-- 20260905000000_rls_consolidation.sql
-- Source: Supabase performance advisor, 2026-09-04:
--   multiple_permissive_policies 309 (WARN), auth_rls_initplan 157 (WARN).
-- Generated from the live pg_policies dump (175 policies, 46 tables) and
-- reviewed by hand. Rules applied, in order:
--
-- 1. auth_rls_initplan: every `auth.uid()` / `auth.jwt()` in a USING or
--    WITH CHECK becomes `(select auth.uid())` / `(select auth.jwt())`, so the
--    planner evaluates it once per statement instead of once per row.
--
-- 2. multiple_permissive_policies: for each (table, command) with more than
--    one PERMISSIVE policy, the originals are dropped and replaced by ONE
--    policy whose USING is the OR of the originals' USING predicates and whose
--    WITH CHECK is the OR of their effective WITH CHECK predicates (a policy
--    without WITH CHECK uses its USING for the check, as PostgreSQL does).
--    Permissive policies are OR'd by PostgreSQL anyway, so this is a pure
--    rewrite: no row becomes visible or invisible, no write becomes allowed
--    or denied. Identical predicates are de-duplicated, and a `true`
--    predicate absorbs the others (true OR x = true).
--
-- 3. `FOR ALL` policies count for every command, so an ALL policy that
--    coexists with a per-command policy is split into SELECT / INSERT /
--    UPDATE / DELETE (same predicates) and the overlapping command is merged
--    as in rule 2. Single ALL policies with no overlap are split the same
--    way for uniformity (semantically identical).
--
-- 4. Roles. A merged policy whose originals were all `TO public` and/or
--    `TO authenticated` is created `TO authenticated`, UNLESS its predicate
--    can hold for a caller without a JWT (a `true` predicate, an `IS NULL`
--    branch, ...), in which case it stays `TO public` so anon keeps exactly
--    the access it has today (anon holds SELECT grants and the app's
--    marketplace reads rely on the `true` policies on plans, meals,
--    exercises, workout_exercises, diet_plan_meals). auth.uid() is NULL for
--    anon, so an auth.uid()-only predicate is already false for anon and the
--    role change is not a semantic change. Non-merged policies keep their
--    original roles.
--
-- 5. Naming: merged and split policies are named <table>_<command>; a policy
--    that is only rewritten keeps its original name.
--
-- Untouched (no auth.* call, no overlap): platform_config, waitlist_signups.
-- Result: 175 policies -> 158; one permissive policy per (table, command).
--
-- Observations recorded, NOT changed here (would be semantic changes):
--   - plans, meals, exercises, workout_exercises, diet_plan_meals all carry a
--     `USING (true)` SELECT policy, which makes their narrower "client can
--     read assigned ..." policies dead code and makes the tables readable by
--     anon. The merged policy is `USING (true)` for that reason.
--   - meals INSERT allows any caller (including anon, which holds INSERT) to
--     insert rows with trainer_id IS NULL AND is_custom = false.
--
-- Apply inside a transaction:
--   npx supabase db query --linked -f supabase/migrations/20260905000000_rls_consolidation.sql
-- Dry-run first (BEGIN ... ROLLBACK with role-simulated assertions): see the
-- session scratch file dryrun.sql that wraps this body.
-- ============================================================

-- ---------------------------------------------------------------- activities
DROP POLICY IF EXISTS "activities_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_select" ON public.activities;

CREATE POLICY "activities_select" ON public.activities
  FOR SELECT TO public
  USING ((trainer_id = (select auth.uid())));

CREATE POLICY "activities_insert" ON public.activities
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- class_completions
DROP POLICY IF EXISTS "Clients write own completions" ON public.class_completions;
DROP POLICY IF EXISTS "Clients read own completions" ON public.class_completions;
DROP POLICY IF EXISTS "Trainers read completions on their classes" ON public.class_completions;
DROP POLICY IF EXISTS "Clients update own completions" ON public.class_completions;

CREATE POLICY "class_completions_select" ON public.class_completions
  FOR SELECT TO authenticated
  USING ((((select auth.uid()) = client_id))
    OR (((select auth.uid()) = trainer_id)));

CREATE POLICY "Clients write own completions" ON public.class_completions
  FOR INSERT TO public
  WITH CHECK ((((select auth.uid()) = client_id) AND (EXISTS ( SELECT 1
   FROM classes cl
  WHERE ((cl.id = class_completions.class_id) AND (cl.trainer_id = class_completions.trainer_id) AND ((cl.trainer_id = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM clients c
          WHERE ((c.trainer_id = cl.trainer_id) AND (c.auth_user_id = (select auth.uid())))))))))));

CREATE POLICY "Clients update own completions" ON public.class_completions
  FOR UPDATE TO public
  USING (((select auth.uid()) = client_id))
  WITH CHECK ((((select auth.uid()) = client_id) AND (EXISTS ( SELECT 1
   FROM classes cl
  WHERE ((cl.id = class_completions.class_id) AND (cl.trainer_id = class_completions.trainer_id))))));

-- ---------------------------------------------------------------- class_favorites
DROP POLICY IF EXISTS "Clients manage own favorites" ON public.class_favorites;

CREATE POLICY "class_favorites_select" ON public.class_favorites
  FOR SELECT TO public
  USING (((select auth.uid()) = client_id));

CREATE POLICY "class_favorites_insert" ON public.class_favorites
  FOR INSERT TO public
  WITH CHECK (((select auth.uid()) = client_id));

CREATE POLICY "class_favorites_update" ON public.class_favorites
  FOR UPDATE TO public
  USING (((select auth.uid()) = client_id))
  WITH CHECK (((select auth.uid()) = client_id));

CREATE POLICY "class_favorites_delete" ON public.class_favorites
  FOR DELETE TO public
  USING (((select auth.uid()) = client_id));

-- ---------------------------------------------------------------- class_revenue_shares
DROP POLICY IF EXISTS "Trainers read own revenue shares" ON public.class_revenue_shares;

CREATE POLICY "Trainers read own revenue shares" ON public.class_revenue_shares
  FOR SELECT TO public
  USING (((select auth.uid()) = trainer_id));

-- ---------------------------------------------------------------- class_subscriptions
DROP POLICY IF EXISTS "Clients manage own class subscription" ON public.class_subscriptions;

CREATE POLICY "class_subscriptions_select" ON public.class_subscriptions
  FOR SELECT TO public
  USING (((select auth.uid()) = client_id));

CREATE POLICY "class_subscriptions_insert" ON public.class_subscriptions
  FOR INSERT TO public
  WITH CHECK (((select auth.uid()) = client_id));

CREATE POLICY "class_subscriptions_update" ON public.class_subscriptions
  FOR UPDATE TO public
  USING (((select auth.uid()) = client_id))
  WITH CHECK (((select auth.uid()) = client_id));

CREATE POLICY "class_subscriptions_delete" ON public.class_subscriptions
  FOR DELETE TO public
  USING (((select auth.uid()) = client_id));

-- ---------------------------------------------------------------- classes
DROP POLICY IF EXISTS "Trainers manage own classes" ON public.classes;
DROP POLICY IF EXISTS "Clients view accessible classes" ON public.classes;

CREATE POLICY "classes_select" ON public.classes
  FOR SELECT TO authenticated
  USING ((((select auth.uid()) = trainer_id))
    OR (((trainer_id = (select auth.uid())) OR ((status = 'published'::text) AND (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.auth_user_id = (select auth.uid())) AND (c.trainer_id = classes.trainer_id))))))));

CREATE POLICY "classes_insert" ON public.classes
  FOR INSERT TO public
  WITH CHECK (((select auth.uid()) = trainer_id));

CREATE POLICY "classes_update" ON public.classes
  FOR UPDATE TO public
  USING (((select auth.uid()) = trainer_id))
  WITH CHECK (((select auth.uid()) = trainer_id));

CREATE POLICY "classes_delete" ON public.classes
  FOR DELETE TO public
  USING (((select auth.uid()) = trainer_id));

-- ---------------------------------------------------------------- client_activities
DROP POLICY IF EXISTS "Clients can manage own activities" ON public.client_activities;
DROP POLICY IF EXISTS "Trainers can read client activities" ON public.client_activities;

CREATE POLICY "client_activities_select" ON public.client_activities
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_activities_insert" ON public.client_activities
  FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_activities_update" ON public.client_activities
  FOR UPDATE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_activities_delete" ON public.client_activities
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- client_checkins
DROP POLICY IF EXISTS "clients_manage_own_checkins" ON public.client_checkins;
DROP POLICY IF EXISTS "trainers_read_client_checkins" ON public.client_checkins;
DROP POLICY IF EXISTS "trainers_reply_to_checkins" ON public.client_checkins;

CREATE POLICY "client_checkins_select" ON public.client_checkins
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_checkins_insert" ON public.client_checkins
  FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_checkins_update" ON public.client_checkins
  FOR UPDATE TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))))
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_checkins_delete" ON public.client_checkins
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- client_diets
DROP POLICY IF EXISTS "Trainers can manage their clients diets" ON public.client_diets;
DROP POLICY IF EXISTS "Trainers can delete client diets" ON public.client_diets;
DROP POLICY IF EXISTS "Trainers can assign diets" ON public.client_diets;
DROP POLICY IF EXISTS "Clients can read own diets" ON public.client_diets;
DROP POLICY IF EXISTS "Trainers can read client diets" ON public.client_diets;
DROP POLICY IF EXISTS "Trainers can update client diets" ON public.client_diets;

CREATE POLICY "client_diets_select" ON public.client_diets
  FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = client_diets.client_id) AND (clients.trainer_id = (select auth.uid()))))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_diets_insert" ON public.client_diets
  FOR INSERT TO authenticated
  WITH CHECK (((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = client_diets.client_id) AND (clients.trainer_id = (select auth.uid()))))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_diets_update" ON public.client_diets
  FOR UPDATE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = client_diets.client_id) AND (clients.trainer_id = (select auth.uid()))))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = client_diets.client_id) AND (clients.trainer_id = (select auth.uid()))))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_diets_delete" ON public.client_diets
  FOR DELETE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = client_diets.client_id) AND (clients.trainer_id = (select auth.uid()))))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

-- ---------------------------------------------------------------- client_habits
DROP POLICY IF EXISTS "clients_insert_own_habits" ON public.client_habits;
DROP POLICY IF EXISTS "trainers_insert_client_habits" ON public.client_habits;
DROP POLICY IF EXISTS "clients_read_own_habits" ON public.client_habits;
DROP POLICY IF EXISTS "trainers_read_client_habits" ON public.client_habits;
DROP POLICY IF EXISTS "clients_update_own_habits" ON public.client_habits;
DROP POLICY IF EXISTS "trainers_update_client_habits" ON public.client_habits;

CREATE POLICY "client_habits_select" ON public.client_habits
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_habits_insert" ON public.client_habits
  FOR INSERT TO authenticated
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_habits_update" ON public.client_habits
  FOR UPDATE TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))))
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

-- ---------------------------------------------------------------- client_health_snapshots
DROP POLICY IF EXISTS "Clients can manage own snapshots" ON public.client_health_snapshots;
DROP POLICY IF EXISTS "Trainers can read client snapshots" ON public.client_health_snapshots;

CREATE POLICY "client_health_snapshots_select" ON public.client_health_snapshots
  FOR SELECT TO public
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE ((clients.trainer_id = (select auth.uid())) AND (COALESCE(clients.health_sharing_enabled, false) = true))))));

CREATE POLICY "client_health_snapshots_insert" ON public.client_health_snapshots
  FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_health_snapshots_update" ON public.client_health_snapshots
  FOR UPDATE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_health_snapshots_delete" ON public.client_health_snapshots
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- client_meal_logs
DROP POLICY IF EXISTS "Clients can manage own meal logs" ON public.client_meal_logs;
DROP POLICY IF EXISTS "Trainers can read client meal logs" ON public.client_meal_logs;

CREATE POLICY "client_meal_logs_select" ON public.client_meal_logs
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_meal_logs_insert" ON public.client_meal_logs
  FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_meal_logs_update" ON public.client_meal_logs
  FOR UPDATE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_meal_logs_delete" ON public.client_meal_logs
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- client_plan_enrollments
DROP POLICY IF EXISTS "Trainers manage enrollments" ON public.client_plan_enrollments;
DROP POLICY IF EXISTS "Clients read own enrollments" ON public.client_plan_enrollments;
DROP POLICY IF EXISTS "Clients update own enrollments" ON public.client_plan_enrollments;

CREATE POLICY "client_plan_enrollments_select" ON public.client_plan_enrollments
  FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.trainer_id = (select auth.uid()))))))
    OR ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.auth_user_id = (select auth.uid())))))));

CREATE POLICY "client_plan_enrollments_insert" ON public.client_plan_enrollments
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_plan_enrollments_update" ON public.client_plan_enrollments
  FOR UPDATE TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.trainer_id = (select auth.uid()))))))
    OR ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.auth_user_id = (select auth.uid())))))))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.trainer_id = (select auth.uid()))))))
    OR ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.auth_user_id = (select auth.uid())))))));

CREATE POLICY "client_plan_enrollments_delete" ON public.client_plan_enrollments
  FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = client_plan_enrollments.client_id) AND (c.trainer_id = (select auth.uid()))))));

-- ---------------------------------------------------------------- client_progress
DROP POLICY IF EXISTS "Trainers can delete progress for their clients" ON public.client_progress;
DROP POLICY IF EXISTS "Clients can insert their own progress" ON public.client_progress;
DROP POLICY IF EXISTS "Trainers can insert progress for their clients" ON public.client_progress;
DROP POLICY IF EXISTS "Clients can read own progress" ON public.client_progress;
DROP POLICY IF EXISTS "Clients can view their own progress" ON public.client_progress;
DROP POLICY IF EXISTS "Trainers can view progress of their clients" ON public.client_progress;
DROP POLICY IF EXISTS "Trainers can update progress for their clients" ON public.client_progress;

CREATE POLICY "client_progress_select" ON public.client_progress
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR (((select auth.uid()) = trainer_id)));

CREATE POLICY "client_progress_insert" ON public.client_progress
  FOR INSERT TO authenticated
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR (((select auth.uid()) = trainer_id)));

CREATE POLICY "Trainers can update progress for their clients" ON public.client_progress
  FOR UPDATE TO public
  USING (((select auth.uid()) = trainer_id))
  WITH CHECK (((select auth.uid()) = trainer_id));

CREATE POLICY "Trainers can delete progress for their clients" ON public.client_progress
  FOR DELETE TO public
  USING (((select auth.uid()) = trainer_id));

-- ---------------------------------------------------------------- client_subscriptions
DROP POLICY IF EXISTS "Athletes can view their own subscriptions" ON public.client_subscriptions;
DROP POLICY IF EXISTS "Trainers can view their client subscriptions" ON public.client_subscriptions;

CREATE POLICY "client_subscriptions_select" ON public.client_subscriptions
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

-- ---------------------------------------------------------------- client_workout_logs
DROP POLICY IF EXISTS "Clients can manage own logs" ON public.client_workout_logs;
DROP POLICY IF EXISTS "Trainers can read client logs" ON public.client_workout_logs;

CREATE POLICY "client_workout_logs_select" ON public.client_workout_logs
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "client_workout_logs_insert" ON public.client_workout_logs
  FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_workout_logs_update" ON public.client_workout_logs
  FOR UPDATE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "client_workout_logs_delete" ON public.client_workout_logs
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- client_workouts
DROP POLICY IF EXISTS "Trainers can delete client workouts" ON public.client_workouts;
DROP POLICY IF EXISTS "Trainers can assign workouts" ON public.client_workouts;
DROP POLICY IF EXISTS "cw_insert" ON public.client_workouts;
DROP POLICY IF EXISTS "Clients can read own workouts" ON public.client_workouts;
DROP POLICY IF EXISTS "Trainers can read client workouts" ON public.client_workouts;
DROP POLICY IF EXISTS "cw_client_read" ON public.client_workouts;
DROP POLICY IF EXISTS "cw_select" ON public.client_workouts;
DROP POLICY IF EXISTS "Clients can update own workouts" ON public.client_workouts;
DROP POLICY IF EXISTS "Trainers can update client workouts" ON public.client_workouts;
DROP POLICY IF EXISTS "cw_client_update" ON public.client_workouts;
DROP POLICY IF EXISTS "cw_update" ON public.client_workouts;

CREATE POLICY "client_workouts_select" ON public.client_workouts
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "client_workouts_insert" ON public.client_workouts
  FOR INSERT TO authenticated
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "client_workouts_update" ON public.client_workouts
  FOR UPDATE TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))))
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "Trainers can delete client workouts" ON public.client_workouts
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid())))));

-- ---------------------------------------------------------------- clients
DROP POLICY IF EXISTS "clients_delete" ON public.clients;
DROP POLICY IF EXISTS "Clients can insert own row" ON public.clients;
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
DROP POLICY IF EXISTS "Clients can read own row" ON public.clients;
DROP POLICY IF EXISTS "Org admins read org clients" ON public.clients;
DROP POLICY IF EXISTS "Requested coach reads the request" ON public.clients;
DROP POLICY IF EXISTS "clients_select" ON public.clients;
DROP POLICY IF EXISTS "clients_self_read" ON public.clients;
DROP POLICY IF EXISTS "Clients can update own row" ON public.clients;
DROP POLICY IF EXISTS "clients_update" ON public.clients;

CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated
  USING (((auth_user_id = (select auth.uid())))
    OR ((trainer_id IN ( SELECT org_visible_trainer_ids.trainer_id
   FROM org_visible_trainer_ids() org_visible_trainer_ids(trainer_id))))
    OR ((requested_trainer_id = (select auth.uid())))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (((auth_user_id = (select auth.uid())))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (((auth_user_id = (select auth.uid())))
    OR ((trainer_id = (select auth.uid()))))
  WITH CHECK (((auth_user_id = (select auth.uid())))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "clients_delete" ON public.clients
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- coach_reports
DROP POLICY IF EXISTS "Athletes can file a report" ON public.coach_reports;

CREATE POLICY "Athletes can file a report" ON public.coach_reports
  FOR INSERT TO authenticated
  WITH CHECK ((reporter_user_id = (select auth.uid())));

-- ---------------------------------------------------------------- conversations
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
DROP POLICY IF EXISTS "Clients can read own conversations" ON public.conversations;
DROP POLICY IF EXISTS "conversations_client_read" ON public.conversations;
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "conversations_client_update" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update" ON public.conversations;

CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))))
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

-- ---------------------------------------------------------------- diet_plan_meals
DROP POLICY IF EXISTS "Trainers can manage meals in their diet plans" ON public.diet_plan_meals;
DROP POLICY IF EXISTS "Clients can read diet plan meals" ON public.diet_plan_meals;

CREATE POLICY "diet_plan_meals_select" ON public.diet_plan_meals
  FOR SELECT TO public
  USING (true);

CREATE POLICY "diet_plan_meals_insert" ON public.diet_plan_meals
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM diet_plans
  WHERE ((diet_plans.id = diet_plan_meals.diet_plan_id) AND (diet_plans.trainer_id = (select auth.uid()))))));

CREATE POLICY "diet_plan_meals_update" ON public.diet_plan_meals
  FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM diet_plans
  WHERE ((diet_plans.id = diet_plan_meals.diet_plan_id) AND (diet_plans.trainer_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM diet_plans
  WHERE ((diet_plans.id = diet_plan_meals.diet_plan_id) AND (diet_plans.trainer_id = (select auth.uid()))))));

CREATE POLICY "diet_plan_meals_delete" ON public.diet_plan_meals
  FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM diet_plans
  WHERE ((diet_plans.id = diet_plan_meals.diet_plan_id) AND (diet_plans.trainer_id = (select auth.uid()))))));

-- ---------------------------------------------------------------- diet_plans
DROP POLICY IF EXISTS "Trainers can manage their own diet plans" ON public.diet_plans;
DROP POLICY IF EXISTS "Clients can read diet plans" ON public.diet_plans;

CREATE POLICY "diet_plans_select" ON public.diet_plans
  FOR SELECT TO authenticated
  USING ((((select auth.uid()) = trainer_id))
    OR ((id IN ( SELECT client_diets.diet_plan_id
   FROM client_diets
  WHERE (client_diets.client_id IN ( SELECT clients.id
           FROM clients
          WHERE (clients.auth_user_id = (select auth.uid()))))))));

CREATE POLICY "diet_plans_insert" ON public.diet_plans
  FOR INSERT TO public
  WITH CHECK (((select auth.uid()) = trainer_id));

CREATE POLICY "diet_plans_update" ON public.diet_plans
  FOR UPDATE TO public
  USING (((select auth.uid()) = trainer_id))
  WITH CHECK (((select auth.uid()) = trainer_id));

CREATE POLICY "diet_plans_delete" ON public.diet_plans
  FOR DELETE TO public
  USING (((select auth.uid()) = trainer_id));

-- ---------------------------------------------------------------- exercises
DROP POLICY IF EXISTS "exercises_delete" ON public.exercises;
DROP POLICY IF EXISTS "exercises_insert" ON public.exercises;
DROP POLICY IF EXISTS "Clients can read exercises" ON public.exercises;
DROP POLICY IF EXISTS "exercises_client_read" ON public.exercises;
DROP POLICY IF EXISTS "exercises_select" ON public.exercises;
DROP POLICY IF EXISTS "exercises_update" ON public.exercises;

CREATE POLICY "exercises_select" ON public.exercises
  FOR SELECT TO public
  USING (true);

CREATE POLICY "exercises_insert" ON public.exercises
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "exercises_update" ON public.exercises
  FOR UPDATE TO public
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "exercises_delete" ON public.exercises
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- gym_visits
DROP POLICY IF EXISTS "Clients can manage own gym visits" ON public.gym_visits;
DROP POLICY IF EXISTS "Trainers can read client gym visits" ON public.gym_visits;

CREATE POLICY "gym_visits_select" ON public.gym_visits
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.trainer_id = (select auth.uid()))))));

CREATE POLICY "gym_visits_insert" ON public.gym_visits
  FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "gym_visits_update" ON public.gym_visits
  FOR UPDATE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "gym_visits_delete" ON public.gym_visits
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- live_class_messages
DROP POLICY IF EXISTS "Insert own messages only" ON public.live_class_messages;
DROP POLICY IF EXISTS "Read messages for accessible classes" ON public.live_class_messages;
DROP POLICY IF EXISTS "Trainer moderation" ON public.live_class_messages;

CREATE POLICY "Read messages for accessible classes" ON public.live_class_messages
  FOR SELECT TO public
  USING (((is_deleted = false) AND (EXISTS ( SELECT 1
   FROM live_classes lc
  WHERE ((lc.id = live_class_messages.live_class_id) AND ((lc.trainer_id = (select auth.uid())) OR (EXISTS ( SELECT 1
           FROM clients c
          WHERE ((c.auth_user_id = (select auth.uid())) AND (c.trainer_id = lc.trainer_id))))))))));

CREATE POLICY "Insert own messages only" ON public.live_class_messages
  FOR INSERT TO public
  WITH CHECK ((sender_id = (select auth.uid())));

CREATE POLICY "Trainer moderation" ON public.live_class_messages
  FOR UPDATE TO authenticated
  USING ((live_class_id IN ( SELECT lc.id
   FROM live_classes lc
  WHERE (lc.trainer_id = (select auth.uid())))))
  WITH CHECK ((live_class_id IN ( SELECT lc.id
   FROM live_classes lc
  WHERE (lc.trainer_id = (select auth.uid())))));

-- ---------------------------------------------------------------- live_class_secrets
DROP POLICY IF EXISTS "Trainer owns secrets" ON public.live_class_secrets;

CREATE POLICY "live_class_secrets_select" ON public.live_class_secrets
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM live_classes lc
  WHERE ((lc.id = live_class_secrets.live_class_id) AND (lc.trainer_id = (select auth.uid()))))));

CREATE POLICY "live_class_secrets_insert" ON public.live_class_secrets
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM live_classes lc
  WHERE ((lc.id = live_class_secrets.live_class_id) AND (lc.trainer_id = (select auth.uid()))))));

CREATE POLICY "live_class_secrets_update" ON public.live_class_secrets
  FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM live_classes lc
  WHERE ((lc.id = live_class_secrets.live_class_id) AND (lc.trainer_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM live_classes lc
  WHERE ((lc.id = live_class_secrets.live_class_id) AND (lc.trainer_id = (select auth.uid()))))));

CREATE POLICY "live_class_secrets_delete" ON public.live_class_secrets
  FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM live_classes lc
  WHERE ((lc.id = live_class_secrets.live_class_id) AND (lc.trainer_id = (select auth.uid()))))));

-- ---------------------------------------------------------------- live_classes
DROP POLICY IF EXISTS "Trainers can manage own live classes" ON public.live_classes;
DROP POLICY IF EXISTS "Clients view accessible live classes" ON public.live_classes;

CREATE POLICY "live_classes_select" ON public.live_classes
  FOR SELECT TO authenticated
  USING (((trainer_id = (select auth.uid())))
    OR (((trainer_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.auth_user_id = (select auth.uid())) AND (c.trainer_id = live_classes.trainer_id)))))));

CREATE POLICY "live_classes_insert" ON public.live_classes
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "live_classes_update" ON public.live_classes
  FOR UPDATE TO public
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "live_classes_delete" ON public.live_classes
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- meals
DROP POLICY IF EXISTS "Trainers can delete custom meals" ON public.meals;
DROP POLICY IF EXISTS "Trainers can insert custom meals" ON public.meals;
DROP POLICY IF EXISTS "Trainers can insert global AI meals" ON public.meals;
DROP POLICY IF EXISTS "Clients can read meals" ON public.meals;
DROP POLICY IF EXISTS "Meals are viewable by everyone." ON public.meals;
DROP POLICY IF EXISTS "Trainers can update custom meals" ON public.meals;

CREATE POLICY "meals_select" ON public.meals
  FOR SELECT TO public
  USING (true);

CREATE POLICY "meals_insert" ON public.meals
  FOR INSERT TO public
  WITH CHECK (((trainer_id = (select auth.uid())))
    OR (((trainer_id IS NULL) AND (is_custom = false))));

CREATE POLICY "Trainers can update custom meals" ON public.meals
  FOR UPDATE TO public
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "Trainers can delete custom meals" ON public.meals
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- messages
DROP POLICY IF EXISTS "Clients can send messages" ON public.messages;
DROP POLICY IF EXISTS "messages_client_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "Clients can read own messages" ON public.messages;
DROP POLICY IF EXISTS "messages_client_read" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;

CREATE POLICY "messages_select" ON public.messages
  FOR SELECT TO authenticated
  USING (((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.client_id IN ( SELECT clients.id
           FROM clients
          WHERE (clients.auth_user_id = (select auth.uid())))))))
    OR ((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.trainer_id = (select auth.uid()))))));

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.client_id IN ( SELECT clients.id
           FROM clients
          WHERE (clients.auth_user_id = (select auth.uid())))))))
    OR ((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.trainer_id = (select auth.uid()))))));

CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO public
  USING ((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.trainer_id = (select auth.uid())))))
  WITH CHECK ((conversation_id IN ( SELECT conversations.id
   FROM conversations
  WHERE (conversations.trainer_id = (select auth.uid())))));

-- ---------------------------------------------------------------- notifications
DROP POLICY IF EXISTS "Trainers can manage own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Participants can send notifications" ON public.notifications;
DROP POLICY IF EXISTS "Trainers can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Trainers can update own notifications" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING ((trainer_id = (select auth.uid())));

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (((trainer_id = (select auth.uid())))
    OR (((trainer_id = (select auth.uid())) OR (trainer_id IN ( SELECT c.trainer_id
   FROM clients c
  WHERE (c.auth_user_id = (select auth.uid())))))));

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- organization_members
DROP POLICY IF EXISTS "Admins invite members" ON public.organization_members;
DROP POLICY IF EXISTS "Invitees read their invitation" ON public.organization_members;
DROP POLICY IF EXISTS "Members read org roster" ON public.organization_members;
DROP POLICY IF EXISTS "Admins manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Invitees accept or leave" ON public.organization_members;

CREATE POLICY "organization_members_select" ON public.organization_members
  FOR SELECT TO authenticated
  USING ((((status = 'invited'::org_member_status) AND (invite_email IS NOT NULL) AND (lower(invite_email) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text)))))
    OR (((user_id = (select auth.uid())) OR is_org_member(org_id, ARRAY['owner'::org_role, 'admin'::org_role]))));

CREATE POLICY "Admins invite members" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK ((is_org_member(org_id, ARRAY['owner'::org_role, 'admin'::org_role]) AND (status = 'invited'::org_member_status)));

CREATE POLICY "organization_members_update" ON public.organization_members
  FOR UPDATE TO authenticated
  USING ((is_org_member(org_id, ARRAY['owner'::org_role, 'admin'::org_role]))
    OR (((user_id = (select auth.uid())) OR ((status = 'invited'::org_member_status) AND (lower(COALESCE(invite_email, ''::text)) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text)))))))
  WITH CHECK ((is_org_member(org_id, ARRAY['owner'::org_role, 'admin'::org_role]))
    OR (((user_id = (select auth.uid())) OR ((status = 'invited'::org_member_status) AND (lower(COALESCE(invite_email, ''::text)) = lower(COALESCE(((select auth.jwt()) ->> 'email'::text), ''::text)))))));

-- ---------------------------------------------------------------- organizations
DROP POLICY IF EXISTS "Authenticated users create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Members read their organization" ON public.organizations;
DROP POLICY IF EXISTS "Owners update their organization" ON public.organizations;

CREATE POLICY "Members read their organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (is_org_member(id));

CREATE POLICY "Authenticated users create organizations" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (((created_by = (select auth.uid())) AND (seat_limit IS NULL) AND (stripe_customer_id IS NULL) AND (stripe_subscription_id IS NULL)));

CREATE POLICY "Owners update their organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (is_org_member(id, ARRAY['owner'::org_role]))
  WITH CHECK (is_org_member(id, ARRAY['owner'::org_role]));

-- ---------------------------------------------------------------- payments
DROP POLICY IF EXISTS "Athletes can view their own payments" ON public.payments;
DROP POLICY IF EXISTS "Org admins read org payments" ON public.payments;
DROP POLICY IF EXISTS "Trainers can view their own payments" ON public.payments;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id IN ( SELECT org_visible_trainer_ids.trainer_id
   FROM org_visible_trainer_ids() org_visible_trainer_ids(trainer_id))))
    OR ((trainer_id = (select auth.uid()))));

-- ---------------------------------------------------------------- plan_versions
DROP POLICY IF EXISTS "Trainers manage own plan versions" ON public.plan_versions;

CREATE POLICY "plan_versions_select" ON public.plan_versions
  FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_versions.plan_id) AND (p.trainer_id = (select auth.uid()))))));

CREATE POLICY "plan_versions_insert" ON public.plan_versions
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_versions.plan_id) AND (p.trainer_id = (select auth.uid()))))));

CREATE POLICY "plan_versions_update" ON public.plan_versions
  FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_versions.plan_id) AND (p.trainer_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_versions.plan_id) AND (p.trainer_id = (select auth.uid()))))));

CREATE POLICY "plan_versions_delete" ON public.plan_versions
  FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM plans p
  WHERE ((p.id = plan_versions.plan_id) AND (p.trainer_id = (select auth.uid()))))));

-- ---------------------------------------------------------------- plans
DROP POLICY IF EXISTS "plans_delete" ON public.plans;
DROP POLICY IF EXISTS "plans_insert" ON public.plans;
DROP POLICY IF EXISTS "Anyone can browse plans" ON public.plans;
DROP POLICY IF EXISTS "Org admins read org plans" ON public.plans;
DROP POLICY IF EXISTS "plans_select" ON public.plans;
DROP POLICY IF EXISTS "plans_update" ON public.plans;

CREATE POLICY "plans_select" ON public.plans
  FOR SELECT TO public
  USING (true);

CREATE POLICY "plans_insert" ON public.plans
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "plans_update" ON public.plans
  FOR UPDATE TO public
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "plans_delete" ON public.plans
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- progress_photos
DROP POLICY IF EXISTS "pp_trainer_delete" ON public.progress_photos;
DROP POLICY IF EXISTS "pp_trainer_insert" ON public.progress_photos;
DROP POLICY IF EXISTS "pp_client_select" ON public.progress_photos;
DROP POLICY IF EXISTS "pp_trainer_select" ON public.progress_photos;

CREATE POLICY "progress_photos_select" ON public.progress_photos
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "pp_trainer_insert" ON public.progress_photos
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "pp_trainer_delete" ON public.progress_photos
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- referrals
DROP POLICY IF EXISTS "referrals_insert" ON public.referrals;
DROP POLICY IF EXISTS "referrals_select" ON public.referrals;
DROP POLICY IF EXISTS "referrals_update" ON public.referrals;

CREATE POLICY "referrals_select" ON public.referrals
  FOR SELECT TO public
  USING ((trainer_id = (select auth.uid())));

CREATE POLICY "referrals_insert" ON public.referrals
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "referrals_update" ON public.referrals
  FOR UPDATE TO public
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- sessions
DROP POLICY IF EXISTS "sessions_delete" ON public.sessions;
DROP POLICY IF EXISTS "sessions_insert" ON public.sessions;
DROP POLICY IF EXISTS "Clients can read own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Org admins read org sessions" ON public.sessions;
DROP POLICY IF EXISTS "sessions_client_read" ON public.sessions;
DROP POLICY IF EXISTS "sessions_select" ON public.sessions;
DROP POLICY IF EXISTS "sessions_update" ON public.sessions;

CREATE POLICY "sessions_select" ON public.sessions
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id IN ( SELECT org_visible_trainer_ids.trainer_id
   FROM org_visible_trainer_ids() org_visible_trainer_ids(trainer_id))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "sessions_insert" ON public.sessions
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "sessions_update" ON public.sessions
  FOR UPDATE TO public
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "sessions_delete" ON public.sessions
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));

-- ---------------------------------------------------------------- solo_feedback
DROP POLICY IF EXISTS "Athletes rate their own corner" ON public.solo_feedback;

CREATE POLICY "Athletes rate their own corner" ON public.solo_feedback
  FOR INSERT TO authenticated
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- solo_messages
DROP POLICY IF EXISTS "Athletes manage own solo messages" ON public.solo_messages;

CREATE POLICY "solo_messages_select" ON public.solo_messages
  FOR SELECT TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "solo_messages_insert" ON public.solo_messages
  FOR INSERT TO public
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "solo_messages_update" ON public.solo_messages
  FOR UPDATE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

CREATE POLICY "solo_messages_delete" ON public.solo_messages
  FOR DELETE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- squad_events
DROP POLICY IF EXISTS "squad_trainer_manage" ON public.squad_events;
DROP POLICY IF EXISTS "squad_insert_own" ON public.squad_events;
DROP POLICY IF EXISTS "squad_read_same_plan" ON public.squad_events;

CREATE POLICY "squad_events_select" ON public.squad_events
  FOR SELECT TO authenticated
  USING (((plan_id IN ( SELECT plans.id
   FROM plans
  WHERE (plans.trainer_id = (select auth.uid())))))
    OR ((EXISTS ( SELECT 1
   FROM (client_plan_enrollments e
     JOIN clients c ON ((c.id = e.client_id)))
  WHERE ((e.plan_id = squad_events.plan_id) AND (c.auth_user_id = (select auth.uid())))))));

CREATE POLICY "squad_events_insert" ON public.squad_events
  FOR INSERT TO authenticated
  WITH CHECK (((plan_id IN ( SELECT plans.id
   FROM plans
  WHERE (plans.trainer_id = (select auth.uid())))))
    OR (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))) AND (EXISTS ( SELECT 1
   FROM client_plan_enrollments e
  WHERE ((e.plan_id = squad_events.plan_id) AND (e.client_id = squad_events.client_id)))))));

CREATE POLICY "squad_events_update" ON public.squad_events
  FOR UPDATE TO public
  USING ((plan_id IN ( SELECT plans.id
   FROM plans
  WHERE (plans.trainer_id = (select auth.uid())))))
  WITH CHECK ((plan_id IN ( SELECT plans.id
   FROM plans
  WHERE (plans.trainer_id = (select auth.uid())))));

CREATE POLICY "squad_events_delete" ON public.squad_events
  FOR DELETE TO public
  USING ((plan_id IN ( SELECT plans.id
   FROM plans
  WHERE (plans.trainer_id = (select auth.uid())))));

-- ---------------------------------------------------------------- track_events
DROP POLICY IF EXISTS "Trainers manage track events" ON public.track_events;
DROP POLICY IF EXISTS "Clients read own track events" ON public.track_events;

CREATE POLICY "track_events_select" ON public.track_events
  FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM (client_plan_enrollments e
     JOIN clients c ON ((c.id = e.client_id)))
  WHERE ((e.id = track_events.enrollment_id) AND (c.trainer_id = (select auth.uid()))))))
    OR ((EXISTS ( SELECT 1
   FROM clients c
  WHERE ((c.id = track_events.client_id) AND (c.auth_user_id = (select auth.uid())))))));

CREATE POLICY "track_events_insert" ON public.track_events
  FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (client_plan_enrollments e
     JOIN clients c ON ((c.id = e.client_id)))
  WHERE ((e.id = track_events.enrollment_id) AND (c.trainer_id = (select auth.uid()))))));

CREATE POLICY "track_events_update" ON public.track_events
  FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM (client_plan_enrollments e
     JOIN clients c ON ((c.id = e.client_id)))
  WHERE ((e.id = track_events.enrollment_id) AND (c.trainer_id = (select auth.uid()))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (client_plan_enrollments e
     JOIN clients c ON ((c.id = e.client_id)))
  WHERE ((e.id = track_events.enrollment_id) AND (c.trainer_id = (select auth.uid()))))));

CREATE POLICY "track_events_delete" ON public.track_events
  FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM (client_plan_enrollments e
     JOIN clients c ON ((c.id = e.client_id)))
  WHERE ((e.id = track_events.enrollment_id) AND (c.trainer_id = (select auth.uid()))))));

-- ---------------------------------------------------------------- trainers
DROP POLICY IF EXISTS "trainers_insert_own" ON public.trainers;
DROP POLICY IF EXISTS "Athletes read their own coach" ON public.trainers;
DROP POLICY IF EXISTS "Org admins read their coaches" ON public.trainers;
DROP POLICY IF EXISTS "Trainers read own row" ON public.trainers;
DROP POLICY IF EXISTS "trainers_client_read" ON public.trainers;
DROP POLICY IF EXISTS "trainers_select_own" ON public.trainers;
DROP POLICY IF EXISTS "trainers_update_own" ON public.trainers;

CREATE POLICY "trainers_select" ON public.trainers
  FOR SELECT TO authenticated
  USING (((id IN ( SELECT c.trainer_id
   FROM clients c
  WHERE (c.auth_user_id = (select auth.uid())))))
    OR (((org_id IS NOT NULL) AND is_org_member(org_id, ARRAY['owner'::org_role, 'admin'::org_role])))
    OR ((id = (select auth.uid())))
    OR ((id IN ( SELECT clients.trainer_id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid()))))));

CREATE POLICY "trainers_insert_own" ON public.trainers
  FOR INSERT TO public
  WITH CHECK ((id = (select auth.uid())));

CREATE POLICY "trainers_update_own" ON public.trainers
  FOR UPDATE TO public
  USING ((id = (select auth.uid())))
  WITH CHECK ((id = (select auth.uid())));

-- ---------------------------------------------------------------- workout_exercises
DROP POLICY IF EXISTS "we_delete" ON public.workout_exercises;
DROP POLICY IF EXISTS "we_insert" ON public.workout_exercises;
DROP POLICY IF EXISTS "Clients can read assigned workout exercises" ON public.workout_exercises;
DROP POLICY IF EXISTS "Clients can read workout exercises" ON public.workout_exercises;
DROP POLICY IF EXISTS "we_client_read" ON public.workout_exercises;
DROP POLICY IF EXISTS "we_select" ON public.workout_exercises;
DROP POLICY IF EXISTS "we_update" ON public.workout_exercises;

CREATE POLICY "workout_exercises_select" ON public.workout_exercises
  FOR SELECT TO public
  USING (true);

CREATE POLICY "we_insert" ON public.workout_exercises
  FOR INSERT TO public
  WITH CHECK ((workout_id IN ( SELECT workouts.id
   FROM workouts
  WHERE (workouts.trainer_id = (select auth.uid())))));

CREATE POLICY "we_update" ON public.workout_exercises
  FOR UPDATE TO public
  USING ((workout_id IN ( SELECT workouts.id
   FROM workouts
  WHERE (workouts.trainer_id = (select auth.uid())))))
  WITH CHECK ((workout_id IN ( SELECT workouts.id
   FROM workouts
  WHERE (workouts.trainer_id = (select auth.uid())))));

CREATE POLICY "we_delete" ON public.workout_exercises
  FOR DELETE TO public
  USING ((workout_id IN ( SELECT workouts.id
   FROM workouts
  WHERE (workouts.trainer_id = (select auth.uid())))));

-- ---------------------------------------------------------------- workout_logs
DROP POLICY IF EXISTS "wl_client_insert" ON public.workout_logs;
DROP POLICY IF EXISTS "wl_trainer_insert" ON public.workout_logs;
DROP POLICY IF EXISTS "wl_client_select" ON public.workout_logs;
DROP POLICY IF EXISTS "wl_trainer_select" ON public.workout_logs;
DROP POLICY IF EXISTS "wl_client_update" ON public.workout_logs;

CREATE POLICY "workout_logs_select" ON public.workout_logs
  FOR SELECT TO authenticated
  USING (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "workout_logs_insert" ON public.workout_logs
  FOR INSERT TO authenticated
  WITH CHECK (((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "wl_client_update" ON public.workout_logs
  FOR UPDATE TO public
  USING ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))))
  WITH CHECK ((client_id IN ( SELECT clients.id
   FROM clients
  WHERE (clients.auth_user_id = (select auth.uid())))));

-- ---------------------------------------------------------------- workouts
DROP POLICY IF EXISTS "workouts_delete" ON public.workouts;
DROP POLICY IF EXISTS "workouts_insert" ON public.workouts;
DROP POLICY IF EXISTS "Clients can read assigned workouts" ON public.workouts;
DROP POLICY IF EXISTS "workouts_client_read" ON public.workouts;
DROP POLICY IF EXISTS "workouts_select" ON public.workouts;
DROP POLICY IF EXISTS "workouts_update" ON public.workouts;

CREATE POLICY "workouts_select" ON public.workouts
  FOR SELECT TO authenticated
  USING (((id IN ( SELECT client_workouts.workout_id
   FROM client_workouts
  WHERE (client_workouts.client_id IN ( SELECT clients.id
           FROM clients
          WHERE (clients.auth_user_id = (select auth.uid())))))))
    OR ((trainer_id = (select auth.uid()))));

CREATE POLICY "workouts_insert" ON public.workouts
  FOR INSERT TO public
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "workouts_update" ON public.workouts
  FOR UPDATE TO public
  USING ((trainer_id = (select auth.uid())))
  WITH CHECK ((trainer_id = (select auth.uid())));

CREATE POLICY "workouts_delete" ON public.workouts
  FOR DELETE TO public
  USING ((trainer_id = (select auth.uid())));
