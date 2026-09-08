-- Sweep part two, role-simulated. Ids: Laurel = 751096de (client 269decac, coach aef8549e,
-- assigned workout a37f9393 with 6 exercises); Laurel F = 61b74c97 (client 7f14c282, coach
-- eefec23f); fresh account with no rows = f93f2129.

-- @@ blocked-ish: a stranger reads the exercises of a workout they were never given (expect 0 rows)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
SELECT count(*) AS exercises_visible_to_stranger FROM public.workout_exercises WHERE workout_id = 'a37f9393-c15b-4813-9848-d0b95af792d0';
ROLLBACK;

-- @@ allowed: the athlete it was assigned to still sees them (expect 6)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
SELECT count(*) AS exercises_visible_to_athlete FROM public.workout_exercises WHERE workout_id = 'a37f9393-c15b-4813-9848-d0b95af792d0';
ROLLBACK;

-- @@ blocked: athlete forges a "bought a pass" notification into the coach's inbox
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
INSERT INTO public.notifications (trainer_id, type, title, description, is_read)
VALUES ('aef8549e-218e-43d5-ab7b-93cd89878edf', 'pass_purchased', 'Laurel bought a pass', 'forged', false);
ROLLBACK;

-- @@ allowed: athlete's real workout activity still reaches the coach
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
INSERT INTO public.notifications (trainer_id, type, title, description, is_read)
VALUES ('aef8549e-218e-43d5-ab7b-93cd89878edf', 'workout', 'Laurel finished a workout', 'ok', true);
-- (no RETURNING: the app inserts with return=minimal; RETURNING would need the coach-only SELECT policy)
SELECT 'inserted' AS outcome;
ROLLBACK;

-- @@ viewers: one seat per person, and only for people who can see the class (expect 1 then refusal)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.live_classes (id, trainer_id, title, status, scheduled_for) VALUES ('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'Audit class', 'live', now());
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
SELECT public.increment_viewer_count('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
SELECT public.increment_viewer_count('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
SELECT public.increment_viewer_count('0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a');
SELECT viewer_count FROM public.live_classes WHERE id = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
ROLLBACK;

-- @@ blocked: a stranger cannot take a seat in a class they cannot see
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.live_classes (id, trainer_id, title, status, scheduled_for) VALUES ('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b', 'eefec23f-5734-445f-9fea-ff6e095fd348', 'Audit class', 'live', now());
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
SELECT public.increment_viewer_count('0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b');
ROLLBACK;

-- @@ blocked: a signed-in user cannot write audit events
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"751096de-bdd2-4637-ac64-6c3dd2ff027b","role":"authenticated"}';
SELECT public.log_audit_event('auth.denied', 'critical', 'forged', '{}'::jsonb);
ROLLBACK;

-- @@ request: a new athlete choosing a coach files a request, not a roster row (expect trainer_id null, requested set)
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"f93f2129-1dd3-48ba-8c8d-07aa050641e3","role":"authenticated"}';
SELECT public.create_client_and_notify('Audit Athlete', 'audit-athlete@example.com', 'eefec23f-5734-445f-9fea-ff6e095fd348', NULL);
SELECT trainer_id, requested_trainer_id, status FROM public.clients WHERE auth_user_id = 'f93f2129-1dd3-48ba-8c8d-07aa050641e3';
ROLLBACK;

-- @@ blocked-ish: anon cannot list the diet-images bucket (expect 0)
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS diet_objects_listed_by_anon FROM storage.objects WHERE bucket_id = 'diet-images';
ROLLBACK;
