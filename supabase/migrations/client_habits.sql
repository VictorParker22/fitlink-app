-- ─────────────────────────────────────────────────────────────────────────────
-- client_habits: Daily habit tracking per client
-- One row per (client_id, date). Upserted on every toggle.
-- Habits: water, steps, sleep, protein, mindfulness
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.client_habits (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id     uuid        NOT NULL,
  date          date        NOT NULL DEFAULT CURRENT_DATE,
  water         boolean     NOT NULL DEFAULT false,
  steps         boolean     NOT NULL DEFAULT false,
  sleep         boolean     NOT NULL DEFAULT false,
  protein       boolean     NOT NULL DEFAULT false,
  mindfulness   boolean     NOT NULL DEFAULT false,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT client_habits_unique UNIQUE (client_id, date)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_client_habits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER client_habits_updated_at
  BEFORE UPDATE ON public.client_habits
  FOR EACH ROW EXECUTE FUNCTION update_client_habits_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.client_habits ENABLE ROW LEVEL SECURITY;

-- Clients can read their own habits
CREATE POLICY "clients_read_own_habits"
  ON public.client_habits FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
    )
  );

-- Clients can insert their own habits
CREATE POLICY "clients_insert_own_habits"
  ON public.client_habits FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
    )
  );

-- Clients can update their own habits
CREATE POLICY "clients_update_own_habits"
  ON public.client_habits FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
    )
  );

-- Trainers can read their clients' habits (for the coach habit grid)
CREATE POLICY "trainers_read_client_habits"
  ON public.client_habits FOR SELECT
  USING (
    client_id IN (
      SELECT c.id FROM public.clients c
      INNER JOIN public.trainers t ON t.id = c.trainer_id
      WHERE t.auth_user_id = auth.uid()
    )
  );

-- ── Index for fast streak queries ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS client_habits_client_date_idx
  ON public.client_habits (client_id, date DESC);
