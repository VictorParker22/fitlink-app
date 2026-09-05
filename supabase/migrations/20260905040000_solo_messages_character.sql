-- Which persona spoke a corner line. Nullable: rows before 2026-09-05 have no
-- value and are shown under the character that was current when they were
-- written, which the app cannot know, so it labels them with the current one.
ALTER TABLE public.solo_messages
  ADD COLUMN IF NOT EXISTS character text;

COMMENT ON COLUMN public.solo_messages.character IS
  'Which persona spoke the line (reyes/imani/dane/sol). NULL on rows written before the column existed and on athlete rows.';
