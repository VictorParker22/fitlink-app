-- ============================================================
-- Coach onboarding preferences (editorial onboarding, 2026-09-03).
--
-- The coach branch asks two things athletes filter by before they ever
-- see a rate: where the coach works and how they work. Athlete-side
-- answers live in clients.assessment_data.intake (JSONB, existing);
-- coach-side answers get real columns so trainers_public can expose
-- them to discovery.
-- ============================================================

ALTER TABLE public.trainers
  ADD COLUMN IF NOT EXISTS coaching_mode text
    CHECK (coaching_mode IS NULL OR coaching_mode IN ('in_person', 'remote', 'hybrid')),
  ADD COLUMN IF NOT EXISTS training_locations text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.trainers.coaching_mode IS 'How the coach works with athletes: in_person | remote | hybrid';
COMMENT ON COLUMN public.trainers.training_locations IS 'Where sessions happen: own_gym | member_gym | athlete_location | outdoors | anywhere';

-- Discovery reads them through the public view (columns appended at the
-- end, which CREATE OR REPLACE VIEW permits).
CREATE OR REPLACE VIEW public.trainers_public AS
  SELECT id, name, bio, specialization, specializations, certifications,
         working_hours, avatar_url, cover_url, onboarding_complete, created_at,
         coaching_mode, training_locations
  FROM public.trainers;
