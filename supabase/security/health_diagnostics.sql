-- Proofs for migration 20260915020000 (client_health_diagnostics).
--   Athlete Gerry: auth f93f2129, client cf1eb5d0. Athlete Laurel: auth 61b74c97, client 7f14c282.
-- Run with: python supabase/security/run_audit.py supabase/security/health_diagnostics.sql

-- @@ allowed: an athlete writes a diagnostic row for their own client row
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
INSERT INTO public.client_health_diagnostics (client_id, platform, event, module, available, detail, counts)
VALUES ('cf1eb5d0-788f-43f2-9810-acba47557924', 'ios', 'proof', true, true, 'proof row', '{"metrics":0}'::jsonb);
ROLLBACK;

-- @@ blocked: an athlete cannot write a diagnostic row for somebody else's client row
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
INSERT INTO public.client_health_diagnostics (client_id, platform, event)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'ios', 'proof');
ROLLBACK;

-- @@ blocked: an athlete cannot read another athlete's diagnostics
BEGIN;
INSERT INTO public.client_health_diagnostics (client_id, platform, event, detail)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'ios', 'proof', 'laurel only');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.client_health_diagnostics WHERE detail = 'laurel only';
  IF n > 0 THEN RAISE EXCEPTION 'cross-athlete diagnostics visible'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;

-- @@ blocked: anon cannot insert
BEGIN;
SET LOCAL ROLE anon;
INSERT INTO public.client_health_diagnostics (client_id, platform, event)
VALUES ('cf1eb5d0-788f-43f2-9810-acba47557924', 'ios', 'proof');
ROLLBACK;

-- @@ blocked: rows are append-only (no delete policy)
BEGIN;
INSERT INTO public.client_health_diagnostics (client_id, platform, event, detail)
VALUES ('cf1eb5d0-788f-43f2-9810-acba47557924', 'ios', 'proof', 'gerry delete test');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
DELETE FROM public.client_health_diagnostics WHERE detail = 'gerry delete test';
DO $$
DECLARE n int;
BEGIN
  SET LOCAL ROLE postgres;
  SELECT count(*) INTO n FROM public.client_health_diagnostics WHERE detail = 'gerry delete test';
  IF n = 0 THEN RAISE EXCEPTION 'athlete deleted a diagnostic row'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;
