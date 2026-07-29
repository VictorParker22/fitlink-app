-- Add notes column to workout_exercises table
-- This allows coaches to add workout-specific descriptions/notes for an exercise

ALTER TABLE workout_exercises ADD COLUMN IF NOT EXISTS notes TEXT;
