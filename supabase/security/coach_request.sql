-- Proofs for migration 20260909010000 (coach request arrival).
--   Stranger f93f2129 (Gerry, coachless) asks coach A eefec23f.
-- Run with: python supabase/security/run_audit.py supabase/security/coach_request.sql

-- @@ allowed: a coachless athlete's request writes a tappable notification for the coach and queues a push
BEGIN;
UPDATE public.clients SET trainer_id = NULL, requested_trainer_id = NULL, coach_requested_at = NULL, status = 'solo' WHERE auth_user_id = 'f93f2129-1dd3-48ba-8c8d-07aa050641e3';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
DO $$
DECLARE r json; n int; m jsonb;
BEGIN
  r := public.request_coach('eefec23f-5734-445f-9fea-ff6e095fd348', '{"goal":"Get stronger","training_days":["tue","thu"],"setting":"gym"}'::jsonb, 'hello coach', 'Gerry', NULL);
  IF (r->>'success') <> 'true' THEN RAISE EXCEPTION 'request failed: %', r; END IF;
  SET LOCAL ROLE postgres;
  SELECT metadata INTO m FROM public.notifications WHERE trainer_id = 'eefec23f-5734-445f-9fea-ff6e095fd348' AND type = 'coach_request' ORDER BY created_at DESC LIMIT 1;
  IF m->>'client_id' IS NULL OR m->>'url' NOT LIKE '/request/%' THEN RAISE EXCEPTION 'notification not tappable: %', m; END IF;
  IF m->>'summary' <> 'Get stronger · Tue · Thu · Gym' THEN RAISE EXCEPTION 'summary wrong: %', m->>'summary'; END IF;
  SELECT count(*) INTO n FROM net.http_request_queue;
  IF n < 1 THEN RAISE EXCEPTION 'no push was queued'; END IF;
END $$;
ROLLBACK;

-- @@ blocked: an athlete calls the push trigger function directly
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
SELECT public.notify_push_on_notification();
ROLLBACK;

-- @@ blocked: an athlete inserts a coach_request notification themselves
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
INSERT INTO public.notifications (trainer_id, type, title, description, is_read, metadata)
VALUES ('eefec23f-5734-445f-9fea-ff6e095fd348', 'coach_request', 'x', 'y', false, '{"url":"/checkout"}'::jsonb);
ROLLBACK;
