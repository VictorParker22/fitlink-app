-- Manual activity logging: keep the time of day, not just the day.
-- The Log activity sheet showed a start time it never saved (2026-09-15).
ALTER TABLE public.client_activities ADD COLUMN IF NOT EXISTS started_at timestamptz;
COMMENT ON COLUMN public.client_activities.started_at IS 'When the activity began (athlete-entered time of day); activity_date stays the local calendar day.';
