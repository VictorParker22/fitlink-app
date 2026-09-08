-- Input bounds and injection, role-simulated. Coach A = eefec23f… (Mwster);
-- athlete C = 61b74c97… (clients.id 7f14c282…, on A's roster); anonymous = anon.

-- @@ blocked: a 5,000-character chat message
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.messages (conversation_id, sender_type, content)
SELECT id, 'trainer', repeat('x', 5000) FROM public.conversations WHERE trainer_id = 'eefec23f-5734-445f-9fea-ff6e095fd348' AND client_id = '7f14c282-d334-4cf3-8112-a264e681f7f5' LIMIT 1;
ROLLBACK;

-- @@ allowed: a normal chat message
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
INSERT INTO public.messages (conversation_id, sender_type, content)
SELECT id, 'trainer', 'See you at six.' FROM public.conversations WHERE trainer_id = 'eefec23f-5734-445f-9fea-ff6e095fd348' AND client_id = '7f14c282-d334-4cf3-8112-a264e681f7f5' LIMIT 1;
SELECT 'inserted' AS outcome;
ROLLBACK;

-- @@ blocked: a coach sets a 500-character display name
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
UPDATE public.trainers SET name = repeat('n', 500) WHERE id = 'eefec23f-5734-445f-9fea-ff6e095fd348';
ROLLBACK;

-- @@ blocked: a coach writes 20,000 characters of notes on an athlete
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"eefec23f-5734-445f-9fea-ff6e095fd348","role":"authenticated"}';
UPDATE public.clients SET notes = repeat('n', 20000) WHERE id = '7f14c282-d334-4cf3-8112-a264e681f7f5';
ROLLBACK;

-- @@ blocked: anonymous joins the waitlist with a non-address
BEGIN;
SET LOCAL ROLE anon;
INSERT INTO public.waitlist_signups (email, source) VALUES ('<script>alert(1)</script>', 'audit');
ROLLBACK;

-- @@ allowed: anonymous joins the waitlist with a real address
BEGIN;
SET LOCAL ROLE anon;
INSERT INTO public.waitlist_signups (email, source) VALUES ('audit-waitlist@example.com', 'audit');
SELECT 'inserted' AS outcome;
ROLLBACK;

-- @@ lookup with a LIKE wildcard matches nothing (expect found false)
BEGIN;
SET LOCAL ROLE anon;
SELECT public.lookup_client_by_contact('%');
ROLLBACK;

-- @@ invite lookup with markup returns nothing (expect null)
BEGIN;
SET LOCAL ROLE anon;
SELECT public.invite_public('<script>alert(1)</script>') IS NULL AS is_null;
ROLLBACK;

-- @@ blocked: a 1,000-character live-chat line
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"61b74c97-20c6-44aa-947c-72dec7719c89","role":"authenticated"}';
INSERT INTO public.live_class_messages (live_class_id, sender_id, sender_name, content) VALUES ('09c14c02-d947-471b-a524-c94851eadbf8', '61b74c97-20c6-44aa-947c-72dec7719c89', 'x', repeat('y', 1000));
ROLLBACK;
