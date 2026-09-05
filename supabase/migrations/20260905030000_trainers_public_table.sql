-- ============================================================
-- trainers_public: from a SECURITY DEFINER view to a protected table.
--
-- The view bypassed RLS on purpose (athletes may not read `trainers`, but the
-- marketplace, invite links and "your coach" cards need the safe columns).
-- Two problems with that design:
--   1. Supabase lint 0010: a definer view in `public` is API-reachable and
--      runs as its owner.
--   2. Worse: the view was auto-updatable and anon/authenticated held ALL
--      privileges on it, so any caller could UPDATE any coach's public
--      profile through the view, bypassing trainers' RLS.
--
-- Now: a real table holding only the safe columns, kept in sync from
-- `trainers` by a trigger (SECURITY DEFINER, not callable over RPC), RLS
-- enabled, SELECT-only for anon (invite links before sign-up) and
-- authenticated. Same name and columns, so no app change.
-- ============================================================

DROP VIEW IF EXISTS public.trainers_public;

CREATE TABLE IF NOT EXISTS public.trainers_public (
  id                  uuid PRIMARY KEY REFERENCES public.trainers(id) ON DELETE CASCADE,
  name                text,
  bio                 text,
  specialization      text,
  specializations     text[],
  certifications      text[],
  working_hours       jsonb,
  avatar_url          text,
  cover_url           text,
  onboarding_complete boolean,
  created_at          timestamptz,
  coaching_mode       text,
  training_locations  text[]
);

ALTER TABLE public.trainers_public ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trainers_public_select ON public.trainers_public;
CREATE POLICY trainers_public_select
  ON public.trainers_public FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.trainers_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.trainers_public TO anon, authenticated;
GRANT ALL ON public.trainers_public TO service_role;

-- Keep it in step with trainers. Only the safe columns ever cross over.
CREATE OR REPLACE FUNCTION public.sync_trainer_public()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.trainers_public (
    id, name, bio, specialization, specializations, certifications, working_hours,
    avatar_url, cover_url, onboarding_complete, created_at, coaching_mode, training_locations
  ) VALUES (
    NEW.id, NEW.name, NEW.bio, NEW.specialization, NEW.specializations, NEW.certifications, NEW.working_hours,
    NEW.avatar_url, NEW.cover_url, NEW.onboarding_complete, NEW.created_at, NEW.coaching_mode, NEW.training_locations
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    bio = EXCLUDED.bio,
    specialization = EXCLUDED.specialization,
    specializations = EXCLUDED.specializations,
    certifications = EXCLUDED.certifications,
    working_hours = EXCLUDED.working_hours,
    avatar_url = EXCLUDED.avatar_url,
    cover_url = EXCLUDED.cover_url,
    onboarding_complete = EXCLUDED.onboarding_complete,
    created_at = EXCLUDED.created_at,
    coaching_mode = EXCLUDED.coaching_mode,
    training_locations = EXCLUDED.training_locations;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_trainer_public() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_trainer_public ON public.trainers;
CREATE TRIGGER trg_sync_trainer_public
  AFTER INSERT OR UPDATE OF name, bio, specialization, specializations, certifications, working_hours,
    avatar_url, cover_url, onboarding_complete, coaching_mode, training_locations
  ON public.trainers
  FOR EACH ROW EXECUTE FUNCTION public.sync_trainer_public();

-- Backfill every coach that exists today.
INSERT INTO public.trainers_public (
  id, name, bio, specialization, specializations, certifications, working_hours,
  avatar_url, cover_url, onboarding_complete, created_at, coaching_mode, training_locations
)
SELECT id, name, bio, specialization, specializations, certifications, working_hours,
       avatar_url, cover_url, onboarding_complete, created_at, coaching_mode, training_locations
FROM public.trainers
ON CONFLICT (id) DO NOTHING;

-- PostgREST caches the schema; tell it the relation changed shape.
NOTIFY pgrst, 'reload schema';
