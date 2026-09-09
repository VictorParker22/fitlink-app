-- Proofs for migration 20260909020000 (athlete notifications).
--   Coach A eefec23f; athlete C 61b74c97 (client 7f14c282, on A); athlete B 751096de (client 269decac, on aef8549e).
-- Run with: python supabase/security/run_audit.py supabase/security/client_notifications.sql

-- @@ allowed: coach A assigning a session writes the athlete's notification and queues a push
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.client_workouts (client_id, workout_id, trainer_id, assigned_date, status)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', '447d460a-8812-4ca4-b5f9-90f4dbee6f01', 'eefec23f-5734-445f-9fea-ff6e095fd348', current_date + 1, 'assigned');
SET LOCAL ROLE postgres;
DO $$
DECLARE n int; q int;
BEGIN
  SELECT count(*) INTO n FROM public.notifications WHERE client_id = '7f14c282-d334-4cf3-8112-a264e681f7f5' AND type = 'workout' AND created_at > now() - interval '1 minute';
  IF n < 1 THEN RAISE EXCEPTION 'no athlete notification written'; END IF;
  SELECT count(*) INTO q FROM net.http_request_queue;
  IF q < 1 THEN RAISE EXCEPTION 'no push queued'; END IF;
END $$;
ROLLBACK;

-- @@ allowed: athlete C reads their own notifications
BEGIN;
INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'coach_accepted', 'proof', 'proof', false, '{"url":"/(client-tabs)/"}'::jsonb);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.notifications WHERE title = 'proof' AND client_id = '7f14c282-d334-4cf3-8112-a264e681f7f5';
  IF n <> 1 THEN RAISE EXCEPTION 'athlete cannot read own notification (rows=%)', n; END IF;
  UPDATE public.notifications SET is_read = true WHERE title = 'proof' AND client_id = '7f14c282-d334-4cf3-8112-a264e681f7f5';
END $$;
ROLLBACK;

-- @@ blocked: athlete B reads athlete C's notification
BEGIN;
INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'coach_accepted', 'proof', 'proof', false, '{}'::jsonb);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.notifications WHERE title = 'proof';
  IF n <> 0 THEN RAISE EXCEPTION 'stranger read the notification'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;

-- @@ blocked: athlete C writes a coach_accepted row for themselves
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'coach_accepted', 'x', 'y', false, '{}'::jsonb);
ROLLBACK;

-- @@ blocked: coach aef8549e (not C's coach) writes into athlete C's inbox
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"aef8549e-218e-43d5-ab7b-93cd89878edf","role":"authenticated"}';
INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'workout', 'x', 'y', false, '{}'::jsonb);
ROLLBACK;

-- @@ blocked: coach A writes a coach_accepted row (server-only type) into their athlete's inbox
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.notifications (client_id, type, title, description, is_read, metadata)
VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'coach_accepted', 'x', 'y', false, '{"url":"/checkout"}'::jsonb);
ROLLBACK;

-- @@ blocked: athlete calls an assignment trigger function directly
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
SELECT public.notify_client_on_assignment();
ROLLBACK;
