-- ============================================================
-- Solo quality (roast 2026-09-04, phases 1-4 in one go).
--
-- 1. solo_feedback: thumbs on a corner line. Athlete-insert only; read by
--    staff to grow the golden set.
-- 2. solo_messages pruning: keep the last 200 rows per athlete via an
--    AFTER INSERT trigger — unbounded growth with no job otherwise.
-- 3. clients.solo_summary: rolling 300-word memory the corner reads instead
--    of raw history beyond the last turns; refreshed server-side.
-- 4. clients.ai_consent_at: Apple 5.1.2(i) — explicit consent before any
--    personal data reaches Gemini. Written once by the app.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.solo_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  message_id  uuid REFERENCES public.solo_messages(id) ON DELETE SET NULL,
  content     text NOT NULL CHECK (char_length(content) <= 4000),
  verdict     text NOT NULL CHECK (verdict IN ('up', 'down')),
  character   text,
  prompt_version text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.solo_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Athletes rate their own corner" ON public.solo_feedback;
CREATE POLICY "Athletes rate their own corner"
  ON public.solo_feedback FOR INSERT TO authenticated
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_solo_feedback_verdict ON public.solo_feedback(verdict, created_at DESC);

CREATE OR REPLACE FUNCTION public.prune_solo_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  DELETE FROM public.solo_messages m
  WHERE m.client_id = NEW.client_id
    AND m.id IN (
      SELECT id FROM public.solo_messages
      WHERE client_id = NEW.client_id
      ORDER BY created_at DESC
      OFFSET 200
    );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_prune_solo_messages ON public.solo_messages;
CREATE TRIGGER trg_prune_solo_messages
  AFTER INSERT ON public.solo_messages
  FOR EACH ROW EXECUTE FUNCTION public.prune_solo_messages();

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS solo_summary text,
  ADD COLUMN IF NOT EXISTS solo_summary_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz;
-- The summary is server-written only.
REVOKE UPDATE (solo_summary, solo_summary_at) ON public.clients FROM authenticated;
