-- Abuse and cost controls, role-simulated. Coach A = eefec23f… (Mwster), athlete C =
-- 61b74c97… (clients.id 7f14c282…, on A's roster), fresh account = f93f2129….
-- The limiter keys on the JWT role, so each block sets one; rows written into
-- key_rate_limits roll back with the block, leaving no residue.

-- @@ blocked: the 301st chat message in an hour
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
DO $$
DECLARE v_conv uuid; i int;
BEGIN
  SELECT id INTO v_conv FROM public.conversations WHERE trainer_id = 'eefec23f-5734-445f-9fea-ff6e095fd348' AND client_id = '7f14c282-d334-4cf3-8112-a264e681f7f5' LIMIT 1;
  FOR i IN 1..301 LOOP
    INSERT INTO public.messages (conversation_id, sender_type, content) VALUES (v_conv, 'trainer', 'flood ' || i);
  END LOOP;
END $$;
ROLLBACK;

-- @@ allowed: five chat messages in a row
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
DO $$
DECLARE v_conv uuid; i int;
BEGIN
  SELECT id INTO v_conv FROM public.conversations WHERE trainer_id = 'eefec23f-5734-445f-9fea-ff6e095fd348' AND client_id = '7f14c282-d334-4cf3-8112-a264e681f7f5' LIMIT 1;
  FOR i IN 1..5 LOOP
    INSERT INTO public.messages (conversation_id, sender_type, content) VALUES (v_conv, 'trainer', 'hello ' || i);
  END LOOP;
END $$;
SELECT 'five sent' AS outcome;
ROLLBACK;

-- @@ blocked: a sixth coach report in a day
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
DO $$
DECLARE i int;
BEGIN
  FOR i IN 1..6 LOOP
    INSERT INTO public.coach_reports (reporter_user_id, trainer_id, reason, details) VALUES ('61b74c97-20c6-44aa-947c-72dec7719c89', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'spam', 'report ' || i);
  END LOOP;
END $$;
ROLLBACK;

-- @@ waitlist: the same address twice leaves one row (expect 1)
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
INSERT INTO public.waitlist_signups (email, source) VALUES ('Dupe-Audit@Example.com', 'audit');
INSERT INTO public.waitlist_signups (email, source) VALUES ('dupe-audit@example.com', 'audit');
RESET ROLE;  -- anon may not read the list; count as the owner
SELECT count(*) AS rows_for_address FROM public.waitlist_signups WHERE lower(email) = 'dupe-audit@example.com';
ROLLBACK;

-- @@ blocked: the 31st anonymous contact lookup in an hour from one address
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$
DECLARE i int; r json;
BEGIN
  FOR i IN 1..31 LOOP
    r := public.lookup_client_by_contact('probe' || i || '@example.com');
  END LOOP;
END $$;
ROLLBACK;

-- @@ blocked: the 31st anonymous invite lookup in an hour from one address
BEGIN;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $$
DECLARE i int; r jsonb;
BEGIN
  FOR i IN 1..31 LOOP
    r := public.invite_public('ZZZZZ' || (i % 10));
  END LOOP;
END $$;
ROLLBACK;

-- @@ coach-request churn: the eleventh request in a day is refused (expect rate_limited)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
DO $$
DECLARE i int; r json;
BEGIN
  FOR i IN 1..10 LOOP
    r := public.request_coach('eefec23f-5734-445f-9fea-ff6e095fd348', '{}'::jsonb, NULL, 'Churn', 'churn-audit@example.com');
    PERFORM public.cancel_coach_request();
  END LOOP;
END $$;
SELECT public.request_coach('eefec23f-5734-445f-9fea-ff6e095fd348', '{}'::jsonb, NULL, 'Churn', 'churn-audit@example.com') ->> 'reason' AS reason;
ROLLBACK;

-- @@ buckets: every bucket has a size ceiling and a type list (expect 0 unbounded)
SELECT count(*) AS unbounded_buckets FROM storage.buckets WHERE file_size_limit IS NULL OR allowed_mime_types IS NULL;
