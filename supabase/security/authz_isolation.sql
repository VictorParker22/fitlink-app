-- Authorization and tenant isolation. Two users plus an anonymous session.
--   Coach A   = eefec23f-5734-445f-9fea-ff6e095fd348 (Mwster)
--   Athlete B = 751096de-bdd2-4637-ac64-6c3dd2ff027b, clients.id 269decac-…, coached by aef8549e (NOT A)
--   Athlete C = 61b74c97-20c6-44aa-947c-72dec7719c89, clients.id 7f14c282-…, coached by A
--   Stranger  = f93f2129-1dd3-48ba-8c8d-07aa050641e3 (account with no rows)
--   Anonymous = SET LOCAL ROLE anon
-- Titles starting "blocked:" must be refused; "allowed:" must succeed; "(expect …)" says what
-- a permitted-but-empty read should return. Every block rolls back.

-- @@ blocked: coach A opens a conversation with athlete B (not on A's roster)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.conversations (trainer_id, client_id) VALUES ('eefec23f-5734-445f-9fea-ff6e095fd348', '269decac-7d96-4b8a-90ee-bcaefb8dd6fd');
ROLLBACK;

-- @@ blocked: coach A books a session on athlete B's calendar
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.sessions (trainer_id, client_id, date, duration, type, status) VALUES ('eefec23f-5734-445f-9fea-ff6e095fd348', '269decac-7d96-4b8a-90ee-bcaefb8dd6fd', now() + interval '1 day', 60, '1-on-1', 'upcoming');
ROLLBACK;

-- @@ blocked: coach A assigns a workout to athlete B
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.workouts (id, trainer_id, name) VALUES ('0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'Audit workout');
INSERT INTO public.client_workouts (client_id, workout_id, trainer_id, assigned_date, status) VALUES ('269decac-7d96-4b8a-90ee-bcaefb8dd6fd', '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c', 'eefec23f-5734-445f-9fea-ff6e095fd348', current_date, 'assigned');
ROLLBACK;

-- @@ blocked: coach A writes a progress entry for athlete B
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.client_progress (client_id, trainer_id, date, weight, notes) VALUES ('269decac-7d96-4b8a-90ee-bcaefb8dd6fd', 'eefec23f-5734-445f-9fea-ff6e095fd348', current_date, 999, 'planted');
ROLLBACK;

-- @@ blocked: coach A attaches a progress photo to athlete B
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.progress_photos (client_id, trainer_id, photo_url, storage_path) VALUES ('269decac-7d96-4b8a-90ee-bcaefb8dd6fd', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'https://example.invalid/x.jpg', 'eefec23f/x.jpg');
ROLLBACK;

-- @@ allowed: coach A still does all of that for athlete C, who is on A's roster
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.sessions (trainer_id, client_id, date, duration, type, status) VALUES ('eefec23f-5734-445f-9fea-ff6e095fd348', '7f14c282-d334-4cf3-8112-a264e681f7f5', now() + interval '1 day', 60, '1-on-1', 'upcoming');
INSERT INTO public.client_progress (client_id, trainer_id, date, weight) VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', 'eefec23f-5734-445f-9fea-ff6e095fd348', current_date, 70);
INSERT INTO public.workouts (id, trainer_id, name) VALUES ('0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'Audit workout');
INSERT INTO public.client_workouts (client_id, workout_id, trainer_id, assigned_date, status) VALUES ('7f14c282-d334-4cf3-8112-a264e681f7f5', '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d', 'eefec23f-5734-445f-9fea-ff6e095fd348', current_date, 'assigned');
SELECT 'roster writes ok' AS outcome;
ROLLBACK;

-- @@ blocked: a stranger posts in coach A's class chat under the coach's name
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
INSERT INTO public.live_class_messages (live_class_id, sender_id, sender_name, content) VALUES ('09c14c02-d947-471b-a524-c94851eadbf8', 'f93f2129-1dd3-48ba-8c8d-07aa050641e3', 'Coach Mwster', 'Pay at this link to keep watching');
ROLLBACK;

-- @@ allowed: athlete C posts in coach A's class chat, and the name is hers, not the text she sent (expect Laurel Fruehling)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
INSERT INTO public.live_class_messages (live_class_id, sender_id, sender_name, content) VALUES ('09c14c02-d947-471b-a524-c94851eadbf8', '61b74c97-20c6-44aa-947c-72dec7719c89', 'Coach Mwster', 'hi');
SELECT sender_name FROM public.live_class_messages WHERE live_class_id = '09c14c02-d947-471b-a524-c94851eadbf8' AND sender_id = '61b74c97-20c6-44aa-947c-72dec7719c89' ORDER BY created_at DESC LIMIT 1;
ROLLBACK;

-- @@ athlete C reads her coach's private columns (expect nulls: no push token, no stripe account, no elite date)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
SELECT expo_push_token, stripe_account_id, elite_until, email, phone FROM public.trainers WHERE id = 'eefec23f-5734-445f-9fea-ff6e095fd348';
ROLLBACK;

-- @@ allowed: athlete C still sees her coach's public card with the payments flag (expect 1 row)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
SELECT id, name, stripe_charges_enabled FROM public.trainers_public WHERE id = 'eefec23f-5734-445f-9fea-ff6e095fd348';
ROLLBACK;

-- @@ anonymous reads a coach's custom meals (expect 0)
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS custom_meals_visible_to_anon FROM public.meals WHERE is_custom = true;
ROLLBACK;

-- @@ athlete B reads another coach's custom meals (expect 0)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
SELECT count(*) AS custom_meals_visible_to_stranger_athlete FROM public.meals WHERE is_custom = true AND trainer_id <> 'aef8549e-218e-43d5-ab7b-93cd89878edf';
ROLLBACK;

-- @@ allowed: athlete B reads the library exercises in her own workout (expect 6)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
SELECT count(*) AS exercises_in_my_workout FROM public.exercises e WHERE e.id IN (SELECT exercise_id FROM public.workout_exercises WHERE workout_id = 'a37f9393-c15b-4813-9848-d0b95af792d0');
ROLLBACK;

-- @@ sign-up with an unverified email must not inherit a coach-typed row (expect auth_user_id null)
BEGIN;
INSERT INTO public.clients (id, name, email, trainer_id, status) VALUES ('0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e', 'Victim', 'victim-audit@example.com', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'new');
INSERT INTO auth.users (id, email, email_confirmed_at, confirmation_sent_at, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id)
VALUES ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f', 'victim-audit@example.com', now(), NULL, '{"role":"client"}', '{"provider":"email"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
SELECT auth_user_id FROM public.clients WHERE id = '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e';
ROLLBACK;

-- @@ allowed: a phone-verified sign-up still binds the row a coach typed the phone into (expect the new uid)
BEGIN;
INSERT INTO public.clients (id, name, phone, trainer_id, status) VALUES ('1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a', 'Phone athlete', '+15550001111', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'new');
INSERT INTO auth.users (id, phone, phone_confirmed_at, raw_user_meta_data, raw_app_meta_data, aud, role, instance_id)
VALUES ('1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b', '+15550001111', now(), '{"role":"client"}', '{"provider":"phone"}', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
SELECT auth_user_id FROM public.clients WHERE id = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
ROLLBACK;

-- @@ blocked: anonymous calls a server-only helper
BEGIN;
SET LOCAL ROLE anon;
SELECT public.can_view_live_class('09c14c02-d947-471b-a524-c94851eadbf8');
ROLLBACK;

-- @@ anonymous reads a pass (expect the public columns only, no track)
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS passes_visible FROM public.plans;
ROLLBACK;
