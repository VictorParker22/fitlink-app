-- Season builder fields for passes (app/create-plan.tsx turn 19 redesign).
-- description    — the "promise" line shown to athletes on the pass card.
-- duration_weeks — season length chosen in the builder (4–16).
-- season_settings — small JSON blob for builder flags, e.g.
--   { "start_at_week_one": true, "progressive_note": false }

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS duration_weeks INTEGER,
  ADD COLUMN IF NOT EXISTS season_settings JSONB;
