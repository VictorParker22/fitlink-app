-- ============================================================
-- Solo mode — the AI corner for athletes without a coach.
--
-- Same doctrine as coach Elite (20260822090000): the entitlement lives
-- server-side, written ONLY by the revenuecat-webhook function from
-- RevenueCat's signed events. The app's local entitlement is UX; the
-- solo-corner edge function 402s on this column, not on client claims.
--
--   1. clients.premium_until  — client_premium entitlement expiry.
--   2. clients.solo_character — the picked corner persona (reyes/imani/
--      dane/sol), athlete-writable: it's a preference, not a grant.
--   3. solo_messages — the corner conversation. PRIVATE TO THE ATHLETE:
--      no trainer read policy on purpose. Solo is the athlete's own
--      space; a coach they later hire gets the graduation dossier
--      (derived stats), never this transcript.
-- ============================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS premium_until timestamptz;

COMMENT ON COLUMN public.clients.premium_until IS
  'client_premium entitlement expiry, written only by the revenuecat-webhook function. Premium = premium_until > now().';

REVOKE UPDATE (premium_until) ON public.clients FROM authenticated;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS solo_character text;

CREATE TABLE IF NOT EXISTS public.solo_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('athlete', 'corner')),
  content text NOT NULL CHECK (char_length(content) <= 8000),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.solo_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'solo_messages' AND policyname = 'Athletes manage own solo messages') THEN
    CREATE POLICY "Athletes manage own solo messages" ON public.solo_messages
      FOR ALL USING (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_solo_messages_client_created
  ON public.solo_messages (client_id, created_at);
