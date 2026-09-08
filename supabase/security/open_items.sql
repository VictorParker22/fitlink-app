-- Threat model open items A8 and A13. Coach A = eefec23f… (Mwster), athlete C = 61b74c97…
-- (clients.id 7f14c282…, on A's roster, has an account), fresh account = f93f2129….

-- @@ a coach's direct DELETE of an athlete's row removes nothing (expect row survived)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
DELETE FROM public.clients WHERE id = '7f14c282-d334-4cf3-8112-a264e681f7f5';
-- RLS with no DELETE policy affects zero rows rather than erroring, so prove the row is still there.
RESET ROLE;
SELECT CASE WHEN EXISTS (SELECT 1 FROM public.clients WHERE id = '7f14c282-d334-4cf3-8112-a264e681f7f5') THEN 'row survived' ELSE 'ROW DELETED' END AS outcome;
ROLLBACK;

-- @@ allowed: the coach removes a real athlete and the athlete keeps their history (expect detached, trainer null, status solo, workouts intact)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
SELECT public.detach_client('7f14c282-d334-4cf3-8112-a264e681f7f5') ->> 'outcome' AS outcome;
RESET ROLE;
SELECT trainer_id, status, plan_id, (SELECT count(*) FROM public.client_workouts w WHERE w.client_id = c.id) AS workouts_kept FROM public.clients c WHERE id = '7f14c282-d334-4cf3-8112-a264e681f7f5';
ROLLBACK;

-- @@ blocked: a stranger coach cannot detach someone else's athlete
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
SELECT public.detach_client('7f14c282-d334-4cf3-8112-a264e681f7f5');
ROLLBACK;

-- @@ allowed: a coach-typed placeholder with no account is deleted outright (expect deleted)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.clients (id, name, email, trainer_id, status) VALUES ('3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c', 'Placeholder', 'placeholder-audit@example.com', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'new');
SELECT public.detach_client('3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c') ->> 'outcome' AS outcome;
ROLLBACK;

-- @@ blocked: a signed-in user reads the platform's signing key
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
SELECT public.get_platform_secret('mux_signing_key');
ROLLBACK;

-- @@ blocked: anonymous reads the platform's signing key
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
SELECT public.get_platform_secret('mux_signing_key');
ROLLBACK;

-- @@ the legacy stream-key column is gone (expect 0)
SELECT count(*) AS legacy_columns FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'live_classes' AND column_name = 'mux_stream_key';
