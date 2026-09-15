-- Health integration diagnostics (2026-09-15).
--
-- A tester reported Apple Health "does nothing" and there was no way to see,
-- from outside the phone, what the platform answered. Each connect attempt and
-- each read now leaves ONE technical row here: which platform, what happened,
-- and counts. No health values are stored (that stays in client_health_snapshots,
-- behind the sharing consent). The athlete writes and reads only their own rows.

CREATE TABLE IF NOT EXISTS public.client_health_diagnostics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform    text NOT NULL CHECK (char_length(platform) <= 16),
  event       text NOT NULL CHECK (char_length(event) <= 40),
  module      boolean,
  available   boolean,
  detail      text CHECK (detail IS NULL OR char_length(detail) <= 1000),
  counts      jsonb,
  app_version text CHECK (app_version IS NULL OR char_length(app_version) <= 40),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_health_diagnostics_client_time
  ON public.client_health_diagnostics (client_id, created_at DESC);

ALTER TABLE public.client_health_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_health_diagnostics_insert ON public.client_health_diagnostics;
CREATE POLICY client_health_diagnostics_insert ON public.client_health_diagnostics
  FOR INSERT TO authenticated
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = (select auth.uid())));

DROP POLICY IF EXISTS client_health_diagnostics_select ON public.client_health_diagnostics;
CREATE POLICY client_health_diagnostics_select ON public.client_health_diagnostics
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE auth_user_id = (select auth.uid())));

-- No UPDATE / DELETE policies: rows are append-only from the app.

GRANT SELECT, INSERT ON public.client_health_diagnostics TO authenticated;
REVOKE ALL ON public.client_health_diagnostics FROM anon;

DROP TRIGGER IF EXISTS trg_rate_client_health_diagnostics ON public.client_health_diagnostics;
CREATE TRIGGER trg_rate_client_health_diagnostics
  BEFORE INSERT ON public.client_health_diagnostics
  FOR EACH ROW EXECUTE FUNCTION public.rate_limit_writes('hour', '120', '3600');
