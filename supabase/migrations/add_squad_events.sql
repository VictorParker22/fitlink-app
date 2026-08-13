-- ─────────────────────────────────────────────────────────────────────────────
-- squad_events: the squad feed — athletes on the same pass see each other's
-- PRs and season finishes. Written by the athlete at the moment of the event
-- (opt-out in the celebration UI), read by everyone enrolled in the same plan.
--
-- payload carries first_name at write time (honest denormalization: client
-- rows are not cross-readable between athletes under clients RLS).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.squad_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id     uuid        NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  client_id   uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type  text        NOT NULL CHECK (event_type IN ('pr', 'season_complete')),
  payload     jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.squad_events ENABLE ROW LEVEL SECURITY;

-- Athletes read events for any plan they are enrolled in (same pass = same feed).
-- Follows the client_checkins client-policy pattern: auth.uid() → clients.auth_user_id.
CREATE POLICY "squad_read_same_plan"
  ON public.squad_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.client_plan_enrollments e
      JOIN public.clients c ON c.id = e.client_id
      WHERE e.plan_id = squad_events.plan_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- Athletes insert only their own events, and only for plans they are enrolled in.
CREATE POLICY "squad_insert_own"
  ON public.squad_events FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.client_plan_enrollments e
      WHERE e.plan_id = squad_events.plan_id
        AND e.client_id = squad_events.client_id
    )
  );

-- Trainers read and manage events on their own plans.
CREATE POLICY "squad_trainer_manage"
  ON public.squad_events FOR ALL
  USING (
    plan_id IN (
      SELECT id FROM public.plans WHERE trainer_id = auth.uid()
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS squad_events_plan_created_idx
  ON public.squad_events (plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS squad_events_client_idx
  ON public.squad_events (client_id);
