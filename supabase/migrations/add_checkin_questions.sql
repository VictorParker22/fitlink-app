-- Check-in personalization: coach-authored questions per athlete.
--
-- clients.checkin_questions JSONB — array of question objects the coach wrote
-- for THIS athlete. Shape (documented, app-enforced):
--   [
--     {
--       "id": "q_knees",                  -- stable string id, coach-side generated
--       "prompt": "How are the knees holding up under the front squat?",
--       "context": "You flagged them in week 2",   -- optional "why I'm asking" line
--       "type": "choice" | "scale" | "text",
--       "options": ["Fine", "Achy", "Bad"],         -- choice only
--       "min": 4, "max": 10, "step": 0.5,           -- scale only
--       "unit": "hours a night"                     -- scale only, optional
--     }
--   ]
-- NULL / empty array => athlete gets the standard rating set, phrased
-- conversationally (writes the fixed client_checkins columns as before).
--
-- client_checkins.custom_answers JSONB — answers to those questions:
--   { "<question id>": { "prompt": "<prompt as asked>", "answer": <string|number> } }
-- Prompt is denormalized into the answer so the coach inbox can render the
-- exchange even if the question list is later edited.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS checkin_questions JSONB;

ALTER TABLE client_checkins
  ADD COLUMN IF NOT EXISTS custom_answers JSONB;
