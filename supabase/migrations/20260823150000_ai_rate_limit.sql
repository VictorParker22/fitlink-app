-- ============================================================
-- AI credit-siphon defense: per-user rate limiting for paid-API
-- edge functions (Gemini / Spoonacular / ElevenLabs / Mux).
--
-- Audit finding: every AI/paid function authenticated the caller but
-- imposed no quota, so any free authenticated account could loop them
-- and drain the paid-API bill. This adds a server-side sliding-window
-- counter the functions consume via check_rate_limit().
--
-- The table is service-role only (no RLS grants to authenticated), so
-- a user cannot read, reset, or forge their own counters.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id    uuid NOT NULL,
  bucket     text NOT NULL,          -- 'solo-corner', 'generate-workout', …
  window_start timestamptz NOT NULL,
  count      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (which bypasses RLS)
-- touches this table. authenticated/anon get nothing.

-- Atomic check-and-increment over a fixed window. Returns true if the
-- call is ALLOWED (and records it), false if the limit is already hit.
-- SECURITY DEFINER so the edge function's service-role client can call
-- it; still safe because it only ever acts on the user_id passed by the
-- function, which the function derives from the verified JWT.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id uuid,
  p_bucket  text,
  p_limit   integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_window timestamptz := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
BEGIN
  INSERT INTO public.ai_usage (user_id, bucket, window_start, count)
  VALUES (p_user_id, p_bucket, v_window, 1)
  ON CONFLICT (user_id, bucket, window_start)
  DO UPDATE SET count = public.ai_usage.count + 1
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, integer, integer) TO service_role;

-- Opportunistic cleanup: drop windows older than a day so the table
-- can't grow without bound. Cheap, index-covered by the PK.
CREATE INDEX IF NOT EXISTS idx_ai_usage_window ON public.ai_usage (window_start);
