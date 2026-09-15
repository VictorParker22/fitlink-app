-- Proofs for migration 20260916010000 (client_progress_reads).
--   Athlete Cedh/potato: auth 1f1a8882, client 4e2aa2d8. Athlete Gerry: auth f93f2129, client cf1eb5d0.
-- Run with: python supabase/security/run_audit.py supabase/security/progress_reads.sql

-- @@ allowed: an athlete reads their own progress reads
BEGIN;
INSERT INTO public.client_progress_reads (client_id, kind, week_start, headline, body)
VALUES ('4e2aa2d8-f84a-45a1-8f05-561945b57cbf', 'week', current_date, 'proof', 'proof body');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"1f1a8882-7f1c-4b2e-a716-f9f132a703dc","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.client_progress_reads WHERE headline = 'proof';
  IF n < 1 THEN RAISE EXCEPTION 'own read not visible'; END IF;
END $$;
ROLLBACK;

-- @@ blocked: another athlete cannot read them
BEGIN;
INSERT INTO public.client_progress_reads (client_id, kind, week_start, headline, body)
VALUES ('4e2aa2d8-f84a-45a1-8f05-561945b57cbf', 'week', current_date, 'proof', 'proof body');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.client_progress_reads WHERE headline = 'proof';
  IF n > 0 THEN RAISE EXCEPTION 'cross-athlete read visible'; END IF;
  RAISE EXCEPTION 'blocked as expected';
END $$;
ROLLBACK;

-- @@ blocked: an athlete cannot write a read for themselves
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"1f1a8882-7f1c-4b2e-a716-f9f132a703dc","role":"authenticated"}';
INSERT INTO public.client_progress_reads (client_id, kind, week_start, headline, body)
VALUES ('4e2aa2d8-f84a-45a1-8f05-561945b57cbf', 'week', current_date, 'forged', 'forged');
ROLLBACK;

-- @@ blocked: anon sees nothing
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) FROM public.client_progress_reads;
ROLLBACK;
