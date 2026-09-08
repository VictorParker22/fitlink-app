-- Role-simulated dry runs. Each block is its own transaction and is rolled
-- back; the expected outcome is in the comment. Run one block at a time
-- (a raised exception aborts the rest of a file), so this file is split by
-- the runner into blocks on the '-- @@' markers.

-- @@ blocked: athlete inserts own row with premium + a coach + a plan
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
INSERT INTO public.clients (name, email, auth_user_id, trainer_id, plan_id, status, premium_until)
VALUES ('Mallory', 'mallory@example.com', '11111111-1111-4111-8111-111111111111', 'eefec23f-5734-445f-9fea-ff6e095fd348', NULL, 'active', '2099-01-01');
ROLLBACK;

-- @@ blocked: athlete inserts own row attached to a coach (no premium)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
INSERT INTO public.clients (name, email, auth_user_id, trainer_id, status)
VALUES ('Mallory', 'mallory@example.com', '11111111-1111-4111-8111-111111111111', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'active');
ROLLBACK;

-- @@ blocked: coach inserts a roster row pre-bound to another person's account
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.clients (name, email, auth_user_id, trainer_id, status)
VALUES ('Victim', 'victim@example.com', 'f93f2129-1dd3-48ba-8c8d-07aa050641e3', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'active');
ROLLBACK;

-- @@ allowed: coach inserts an unbound roster row directly
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.clients (name, email, trainer_id, status)
VALUES ('New athlete', 'new-athlete@example.com', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'new') RETURNING id, trainer_id;
ROLLBACK;

-- @@ blocked: fresh user inserts a trainers row already Elite
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
INSERT INTO public.trainers (id, name, email, elite_until)
VALUES ('11111111-1111-4111-8111-111111111111', 'Mallory', 'mallory@example.com', '2099-01-01');
ROLLBACK;

-- @@ blocked: athlete puts themself on a pass
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
UPDATE public.clients SET plan_id = 'dbea1528-00c6-4621-b355-525497f2f6c0', status = 'active' WHERE auth_user_id = '751096de-bdd2-4637-ac64-6c3dd2ff027b';
ROLLBACK;

-- @@ allowed: athlete changes their own unit
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
UPDATE public.clients SET weight_unit = 'kg' WHERE auth_user_id = '751096de-bdd2-4637-ac64-6c3dd2ff027b' RETURNING id, weight_unit;
ROLLBACK;

-- @@ allowed: athlete row via ensure_solo_client (definer path) for a fresh user
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
SELECT public.ensure_solo_client();
ROLLBACK;

-- @@ split: an unpaid org no longer waives the fee (function-level check, no rows needed)
SELECT * FROM public.payment_split_for_trainer('eefec23f-5734-445f-9fea-ff6e095fd348');

-- @@ lookup: no client name comes back
SELECT public.lookup_client_by_contact('smoke@example.com');
