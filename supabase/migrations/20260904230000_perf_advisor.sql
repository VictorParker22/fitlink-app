-- 20260904230000_perf_advisor.sql
-- Source: Supabase performance advisor (get_advisors, type=performance), run 2026-09-04.
-- 523 lints: multiple_permissive_policies 309 (WARN), auth_rls_initplan 157 (WARN),
--            unindexed_foreign_keys 42 (INFO), unused_index 15 (INFO), duplicate_index 0.
--
-- This migration only adds covering indexes for the 42 unindexed foreign keys.
-- It does NOT touch RLS policies (auth_rls_initplan / multiple_permissive_policies are
-- handled separately) and does NOT drop the unused indexes (listed at the bottom for review).
-- No duplicate_index lints were reported, so there is nothing to drop.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS).

-- (a) Covering indexes for unindexed foreign keys (public schema only).
--     Column names verified against pg_constraint; every flagged FK is single-column.

-- class_favorites
CREATE INDEX IF NOT EXISTS idx_class_favorites_class_id ON public.class_favorites(class_id);

-- classes
CREATE INDEX IF NOT EXISTS idx_classes_plan_id ON public.classes(plan_id);
CREATE INDEX IF NOT EXISTS idx_classes_workout_id ON public.classes(workout_id);

-- client_diets
CREATE INDEX IF NOT EXISTS idx_client_diets_client_id ON public.client_diets(client_id);
CREATE INDEX IF NOT EXISTS idx_client_diets_diet_plan_id ON public.client_diets(diet_plan_id);

-- client_meal_logs
CREATE INDEX IF NOT EXISTS idx_client_meal_logs_diet_plan_id ON public.client_meal_logs(diet_plan_id);
CREATE INDEX IF NOT EXISTS idx_client_meal_logs_diet_plan_meal_id ON public.client_meal_logs(diet_plan_meal_id);
CREATE INDEX IF NOT EXISTS idx_client_meal_logs_swapped_meal_id ON public.client_meal_logs(swapped_meal_id);

-- client_progress
CREATE INDEX IF NOT EXISTS idx_client_progress_trainer_id ON public.client_progress(trainer_id);

-- client_subscriptions
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_plan_id ON public.client_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_trainer_id ON public.client_subscriptions(trainer_id);

-- client_workout_logs
CREATE INDEX IF NOT EXISTS idx_client_workout_logs_client_id ON public.client_workout_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_client_workout_logs_client_workout_id ON public.client_workout_logs(client_workout_id);
CREATE INDEX IF NOT EXISTS idx_client_workout_logs_workout_id ON public.client_workout_logs(workout_id);

-- client_workouts
CREATE INDEX IF NOT EXISTS idx_client_workouts_trainer_id ON public.client_workouts(trainer_id);
CREATE INDEX IF NOT EXISTS idx_client_workouts_workout_id ON public.client_workouts(workout_id);

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_coach_declined_by ON public.clients(coach_declined_by);
CREATE INDEX IF NOT EXISTS idx_clients_plan_id ON public.clients(plan_id);
CREATE INDEX IF NOT EXISTS idx_clients_referred_by ON public.clients(referred_by);

-- coach_reports
CREATE INDEX IF NOT EXISTS idx_coach_reports_client_id ON public.coach_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_coach_reports_reporter_user_id ON public.coach_reports(reporter_user_id);

-- conversations
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON public.conversations(client_id);

-- diet_plan_meals
CREATE INDEX IF NOT EXISTS idx_diet_plan_meals_diet_plan_id ON public.diet_plan_meals(diet_plan_id);
CREATE INDEX IF NOT EXISTS idx_diet_plan_meals_meal_id ON public.diet_plan_meals(meal_id);

-- diet_plans
CREATE INDEX IF NOT EXISTS idx_diet_plans_trainer_id ON public.diet_plans(trainer_id);

-- exercises
CREATE INDEX IF NOT EXISTS idx_exercises_trainer_id ON public.exercises(trainer_id);

-- gym_visits
CREATE INDEX IF NOT EXISTS idx_gym_visits_client_id ON public.gym_visits(client_id);

-- live_class_messages
CREATE INDEX IF NOT EXISTS idx_live_class_messages_live_class_id ON public.live_class_messages(live_class_id);
CREATE INDEX IF NOT EXISTS idx_live_class_messages_sender_id ON public.live_class_messages(sender_id);

-- live_classes
CREATE INDEX IF NOT EXISTS idx_live_classes_trainer_id ON public.live_classes(trainer_id);

-- meals
CREATE INDEX IF NOT EXISTS idx_meals_trainer_id ON public.meals(trainer_id);

-- organization_members
CREATE INDEX IF NOT EXISTS idx_organization_members_invited_by ON public.organization_members(invited_by);

-- organizations
CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_plan_id ON public.payments(plan_id);

-- plans
CREATE INDEX IF NOT EXISTS idx_plans_autoflow_workout_id ON public.plans(autoflow_workout_id);
CREATE INDEX IF NOT EXISTS idx_plans_trainer_id ON public.plans(trainer_id);

-- referrals
CREATE INDEX IF NOT EXISTS idx_referrals_referred_by ON public.referrals(referred_by);

-- sessions
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON public.sessions(client_id);

-- solo_feedback
CREATE INDEX IF NOT EXISTS idx_solo_feedback_client_id ON public.solo_feedback(client_id);
CREATE INDEX IF NOT EXISTS idx_solo_feedback_message_id ON public.solo_feedback(message_id);

-- workout_exercises
CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise_id ON public.workout_exercises(exercise_id);

-- workout_logs
CREATE INDEX IF NOT EXISTS idx_workout_logs_workout_exercise_id ON public.workout_logs(workout_exercise_id);

-- (b) Duplicate indexes: none reported by the advisor at this run. Nothing to drop.

-- (c) Unused indexes reported by the advisor (NOT dropped here; review before removing).
--     Usage stats reset on restart / stats reset, so 'unused' may just mean 'not used yet'.
--   public.ai_usage: idx_ai_usage_window
--   public.class_completions: idx_completions_trainer_month
--   public.class_subscriptions: idx_class_subs_status
--   public.client_subscriptions: idx_client_subs_stripe_sub
--   public.coach_reports: idx_coach_reports_status
--   public.coach_reports: idx_coach_reports_trainer
--   public.conversations: idx_conversations_trainer
--   public.exercises: idx_exercises_category
--   public.notifications: idx_notifications_trainer_id
--   public.organization_members: organization_members_invite_email_idx
--   public.payments: idx_payments_stripe_pi
--   public.security_signals: security_signals_open_idx
--   public.solo_feedback: idx_solo_feedback_verdict
--   public.stripe_events: idx_stripe_events_received
--   public.track_events: idx_track_events_type
