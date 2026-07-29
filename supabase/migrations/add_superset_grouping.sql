-- Add grouping columns to workout_exercises table
-- This allows coaches to group exercises into Supersets or Circuits

ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS group_type TEXT;
