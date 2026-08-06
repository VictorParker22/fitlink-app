-- ─────────────────────────────────────────────────────────────────────────────
-- client_checkins: Weekly progress check-in submitted by clients to their coach
-- One row per (client_id, week_start). Upserted until submitted.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_checkins (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id           uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  trainer_id          uuid        NOT NULL,
  week_start          date        NOT NULL, -- Monday of that ISO week

  -- Ratings (1–5)
  energy_level        smallint    CHECK (energy_level BETWEEN 1 AND 5),
  sleep_quality       smallint    CHECK (sleep_quality BETWEEN 1 AND 5),
  stress_level        smallint    CHECK (stress_level BETWEEN 1 AND 5),
  workout_adherence   smallint    CHECK (workout_adherence BETWEEN 1 AND 5),
  diet_adherence      smallint    CHECK (diet_adherence BETWEEN 1 AND 5),

  -- Open text
  highlight           text,       -- Best thing this week
  struggle            text,       -- Biggest challenge
  goals_next_week     text,       -- What the client wants to focus on

  -- Optional biometric
  body_weight         numeric(5,1),

  -- Coach reply
  coach_note          text,
  coach_replied_at    timestamptz,

  -- Lifecycle
  submitted_at        timestamptz,                    -- null = draft, set = submitted
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  CONSTRAINT client_checkins_unique UNIQUE (client_id, week_start)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_client_checkins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_checkins_updated_at
  BEFORE UPDATE ON public.client_checkins
  FOR EACH ROW EXECUTE FUNCTION update_client_checkins_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.client_checkins ENABLE ROW LEVEL SECURITY;

-- Clients can read and upsert their own check-ins
CREATE POLICY "clients_manage_own_checkins"
  ON public.client_checkins FOR ALL
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
    )
  );

-- Trainers can read their clients' check-ins and write coach_note + coach_replied_at
CREATE POLICY "trainers_read_client_checkins"
  ON public.client_checkins FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE trainer_id = auth.uid()
    )
  );

CREATE POLICY "trainers_reply_to_checkins"
  ON public.client_checkins FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE trainer_id = auth.uid()
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS client_checkins_client_week_idx
  ON public.client_checkins (client_id, week_start DESC);

CREATE INDEX IF NOT EXISTS client_checkins_trainer_submitted_idx
  ON public.client_checkins (trainer_id, submitted_at DESC)
  WHERE submitted_at IS NOT NULL;
