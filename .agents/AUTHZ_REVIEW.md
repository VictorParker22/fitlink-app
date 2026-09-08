# FitLink — authorization and tenant-isolation review

Reviewed 2026-09-08 against the live Supabase project: authentication, table
and function grants, every row-security policy, storage policies, views, the
realtime publication, the SECURITY DEFINER functions and the edge functions.
Every cross-user or cross-tenant path found is listed with the object that
creates it, what an attacker needs, what they get, and the test that proves
it — run with two users plus an anonymous session:

```
python supabase/security/run_audit.py supabase/security/authz_isolation.sql
```

Users in the tests: **coach A** (`eefec23f…`, "Mwster"), **athlete B**
(`751096de…`, coached by a different coach), **athlete C** (`61b74c97…`, on
A's roster), a **stranger** account with no rows (`f93f2129…`), and
**anonymous** (`SET LOCAL ROLE anon`). Every block rolls back.

## Baseline facts

- Every `public` table has row security enabled; none is forced (the service
  role bypasses by design). `anon` and `authenticated` hold table-wide grants
  on almost every table (Supabase default), so **policies are the only
  boundary** and a column-level REVOKE is a no-op.
- There are no views in `public` (`trainers_public` is a table synced by
  trigger). The realtime publication carries `clients`, `conversations`,
  `messages`, `notifications`, `sessions`, `invites`, `live_class_messages`,
  `client_*`; `postgres_changes` applies the SELECT policies, so realtime
  leaks exactly what SELECT leaks and nothing more.
- 31 definer functions are callable by signed-in users; each was read. Those
  that touch another person's row check `auth.uid()` against it
  (`respond_coach_request`, `accept_invite`, `revoke_invite`,
  `publish_plan_track`, `increment_conversation_unread`, `org_*`, `ops_*`).
  Anonymous may call `invite_public` and `lookup_client_by_contact` only.
- Edge functions identify the caller from the JWT (`_shared/auth.ts`) or a
  verified signature/secret; internal ones require the service role.

## Findings

| # | Path | Object | Preconditions | Impact | Test block | Status |
|---|------|--------|---------------|--------|------------|--------|
| I1 | A coach writes into a stranger athlete's space: opens a conversation, books a session, assigns a workout, plants a progress entry or a photo. | `conversations_insert`, `sessions_insert`, `client_workouts_insert`, `workout_logs_insert`, `client_progress_insert`, `pp_trainer_insert` — each only checked `trainer_id = auth.uid()`, never that `client_id` was on that coach's roster. | Any coach account (free to create) and a victim `clients.id` (leaks through pending requests, shared classes, and the exact-contact lookup). | Unsolicited chat and phishing from a stranger inside the athlete's app; fake sessions, workouts, weights and photos on their timeline (their own SELECT branch shows them). | "coach A opens a conversation / books a session / assigns a workout / writes a progress entry / attaches a progress photo … athlete B"; "coach A still does all of that for athlete C" | **Closed** 2026-09-08, migration `20260908070000` §1 |
| I2 | Anyone signed in posts into any live-class chat under any name. | `live_class_messages` policy "Insert own messages only" (`sender_id = auth.uid()` only); `sender_name` was free text from the phone. | A live-class id (any former roster member or invitee has them). | Impersonating the coach in the room ("Coach: pay at this link"), spam during a broadcast. | "a stranger posts in coach A's class chat under the coach's name"; "athlete C posts … the name is hers" | **Closed**: insert requires `can_view_live_class`, `stamp_live_chat_sender` sets the name from the database |
| I3 | An athlete reads their coach's private row. | `trainers_select` athlete branch returned the full row: `expo_push_token`, `stripe_account_id`, `stripe_charges_enabled`, `elite_until`, `email`, `phone`, `notification_prefs`, `referral_code`, `org_id`. Read by `context/ClientContext.tsx`. | Be on the roster. | Expo push tokens need no authentication to send to — the token alone lets anyone push arbitrary notifications with deep links to the coach's phone (phishing); Stripe account id and contact details exposed. | "athlete C reads her coach's private columns"; "athlete C still sees her coach's public card" | **Closed**: `trainers_select` is self + org admin only; athletes read `trainers_public` (gains `stripe_charges_enabled`); pushes name a recipient and `send-push-notification` resolves the token with the service role |
| I4 | Coaches' custom meals and exercises readable by everyone, anonymous included. | `meals_select`, `exercises_select` were `USING (true)` for `public`. | None (anon key). | Cross-tenant read of a coach's proprietary library (16 custom meals today). | "anonymous reads a coach's custom meals"; "athlete B reads another coach's custom meals"; "athlete B reads the library exercises in her own workout" | **Closed**: library rows public; custom rows visible to owner or through a visible plan/workout |
| I5 | Sign-up binds a coach-typed client row to whoever claims the contact first. | `auth.users` triggers `handle_new_client_user`, `link_client_auth_user`; RPC `link_client_to_auth_user`. | A coach typed the victim's email into Add athlete; Auth auto-confirm on (the project has 25 auto-confirmed users and 7 mail-confirmed ones). | Relationship takeover: the attacker receives the coach's programme, sessions and messages meant for the victim; the victim can never bind. | "sign-up with an unverified email must not inherit a coach-typed row"; "a phone-verified sign-up still binds" | **Closed**: binding requires a confirmed phone or a mail-confirmed email (`contact_verified`); the RPC answers `verify_contact`; invitation codes remain the verified path |
| I6 | Server-only functions executable by anonymous. | `can_view_live_class`, `clear_live_class_viewers`, `guard_*`, `set_went_live_at`, `update_*`, `check_message_rate_limit` kept the PUBLIC grant because `REVOKE … FROM anon, authenticated` does not touch it. | None. | An existence oracle for class ids; trigger functions cannot be invoked outside a trigger. | "anonymous calls a server-only helper" | **Closed**: revoked from PUBLIC; `authenticated` re-granted only where a policy evaluates the function |
| I7 | Coach reads a roster athlete's `expo_push_token`, `stripe_customer_id`, `premium_until`; a coach with a PENDING request reads the requester's full row (health intake, contact, token). | `clients_select` branches `trainer_id = uid` and `requested_trainer_id = uid`. | A relationship or a request the athlete initiated. | Same push-token exposure as I3 in the other direction, between consenting parties; the request branch shows a coach the intake before accepting, which is the product. | — | **Open, accepted for launch**: both parties chose each other. Removing the token exposure needs the coach side of the app to name recipients too (8 call sites). |
| I8 | Org owners and admins read their coaches' clients, sessions and payments. | `org_visible_trainer_ids()` in `clients_select`, `sessions_select`, `payments_select`. | Be an active org owner/admin; membership activates only by the invited person. | Intended gym visibility. No org exists today. | — | **By design** |
| I9 | Anonymous reads every pass, including the outline. | `plans_select` `USING (true)` for `public`. | None. | The sales pitch (name, price, outline labels). Workouts behind it are not reachable since `workout_exercises` became parent-scoped. | "anonymous reads a pass" | **By design** |
| I10 | Public storage buckets serve any object by URL and can be listed where a public SELECT policy exists (`avatars`, `class-*`, `coach-media`, `exercise-*`). | `storage.objects` SELECT policies. | None. | Enumeration of coach uids and media paths; the media is public content. | — | **By design** (personal buckets are private; `diet-images` listing removed 2026-09-08) |

## What the review did not find

- No path lets an athlete read another athlete's rows, or a coach read a
  stranger athlete's rows.
- No policy lets a user update or delete another user's rows (`clients_delete`
  by the coach is a relationship power, listed in the threat model as A13).
- No definer function writes another person's row without checking the
  caller's relationship to it.
- No view bypasses RLS; the realtime publication adds no exposure.
- Storage upload policies are uid-prefixed; personal buckets are private.

## Auth settings that decide the residual risk

- **Email confirmation.** With it off, an email in a JWT is unproven; I5 now
  refuses to bind on such an email, so an athlete a coach added by email must
  join by invitation code or phone. With it on, email binding works again.
- **Leaked-password protection** is off (Security Advisor). Operator toggle.
- Phone sign-in proves possession by OTP and binds as before.
