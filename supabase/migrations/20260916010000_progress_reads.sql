-- The corner's read of an athlete's progress (2026-09-16, canvas "Progress Tab").
--
-- One row per generated read: the weekly summary on the Progress tab and the
-- reply to a Sunday check-in. Written ONLY by the solo-progress edge function
-- (service role); the athlete reads their own rows. The facts the model was
-- given are stored beside the text so every number can be traced.

CREATE TABLE IF NOT EXISTS public.client_progress_reads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('week', 'checkin')),
  week_start  date NOT NULL,
  character   text CHECK (character IS NULL OR char_length(character) <= 16),
  headline    text NOT NULL CHECK (char_length(headline) <= 160),
  body        text NOT NULL CHECK (char_length(body) <= 900),
  next        jsonb NOT NULL DEFAULT '[]'::jsonb,
  facts       jsonb NOT NULL DEFAULT '{}'::jsonb,
  model       text CHECK (model IS NULL OR char_length(model) <= 24),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_progress_reads_client_time
  ON public.client_progress_reads (client_id, kind, created_at DESC);

ALTER TABLE public.client_progress_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_progress_reads_select ON public.client_progress_reads;
CREATE POLICY client_progress_reads_select ON public.client_progress_reads
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = (select auth.uid())));

-- No INSERT / UPDATE / DELETE policies: only the service role writes.
GRANT SELECT ON public.client_progress_reads TO authenticated;
REVOKE ALL ON public.client_progress_reads FROM anon;

-- The corner's reply to a Sunday check-in, beside the coach's note. Server-written
-- by solo-progress; an athlete writing their own row's reply gains nothing.
ALTER TABLE public.client_checkins
  ADD COLUMN IF NOT EXISTS corner_reply text CHECK (corner_reply IS NULL OR char_length(corner_reply) <= 900);
