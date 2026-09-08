-- 2026-09-07: the server's Stripe key moved from sandbox to live. Every
-- trainers.stripe_account_id on file was created under the sandbox key and
-- does not exist in live mode; reusing one would make create-connect-account
-- fail with "No such account". Clear them so each coach connects a real
-- Express account on their next tap. Onboarding flags follow.
update public.trainers
   set stripe_account_id = null,
       stripe_onboarding_complete = false,
       stripe_charges_enabled = false
 where stripe_account_id is not null;

select count(*) as trainers_with_connect_after from public.trainers where stripe_account_id is not null;
