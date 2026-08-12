-- Migration: add autoflow columns to plans
-- These columns are all nullable/defaulted — zero breaking changes.

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS autoflow_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS autoflow_workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS autoflow_welcome_message TEXT;
