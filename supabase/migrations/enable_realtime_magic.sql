-- ─────────────────────────────────────────────────────────────────────────────
-- enable_realtime_magic.sql
--
-- Adds every table the app subscribes to (supabase.channel(...).on(
-- 'postgres_changes', ...)) to the supabase_realtime publication so those
-- channels actually receive events.
--
-- The app is fully functional BEFORE this migration runs — subscriptions
-- simply never fire and screens refresh on pull/refetch as before. Run it to
-- turn on live updates:
--
--   Coach side (context/AppContext.tsx):
--     notifications    — notification feed + bell badge
--     sessions         — dashboard agenda / roster recency
--     client_progress  — weight chart on client detail
--     client_habits    — habit heatmap + habit sheet
--   Athlete side (context/ClientContext.tsx):
--     clients, client_workouts, client_plan_enrollments — data refresh channel
--
-- Each ALTER is wrapped in a DO block that swallows duplicate_object so the
-- migration is safe to re-run (and safe if a table was already added by hand).
-- undefined_table is also ignored so this file works even if a later table's
-- migration has not run yet.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_progress;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_habits;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.clients;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_workouts;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.client_plan_enrollments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;
