# FitLink — architecture and threat model

Mapped 2026-09-08 from the code and the live Supabase project (policies, triggers,
function definitions, buckets), not from intent. Every boundary cites the file or
object that creates it. Status marks: **closed <date>** = a hole found and proved
shut with a role-simulated dry run (`supabase/security/`), **by design** = an
accepted exposure, **open** = not yet closed. Fixes are listed only at the end.

## 1. System overview

```
 Phone app (Expo / RN, anon key)          Website fitlink.coach (Vite, Vercel, anon key)
   │ PostgREST + RLS      │ functions.invoke            │ /i/:code  /live/:code  /privacy /terms
   ▼                      ▼                             ▼
 Supabase Postgres ◄──── Edge functions (Deno) ◄──── invite-info (anon, IP rate-limited)
   ▲ triggers/RPCs          │ service role
   │                        ├─► Stripe (Connect Express, subscriptions, payment sheet)
 Supabase Auth ─ auth.users ├─► RevenueCat ◄─ Apple StoreKit (RevenueCat SDK in the app)
   (email+password,         ├─► Mux (RTMP ingest from the phone, HLS playback)
    phone OTP)              ├─► Gemini, ElevenLabs (AI corner, coach assistant, TTS)
                            └─► Expo push / FCM, Sentry
 Webhooks IN: stripe-webhook (signature), revenuecat-webhook (shared secret),
              mux-webhook (signature), DB webhook → cleanup-chat-attachments (service role),
              cron/ops → calculate-class-revenue (service role)
 Code delivery: EAS Update channel `production` (OTA JS), EAS Build → App Store
```

Roles are **self-declared and unprivileged**: coach (a `trainers` row, created by the
`handle_new_user` trigger from `raw_user_meta_data.role`) and athlete (a `clients`
row). The only privileged principals are the Supabase service role, postgres-owned
`SECURITY DEFINER` functions, org owners/admins (`organization_members`), and
`platform_admins` (empty today, so `app/ops/index.tsx` is dead).

## 2. Trust boundaries

| # | Boundary | What enforces it | Files / objects |
|---|----------|------------------|-----------------|
| B1 | Phone → database. The anon key ships in the binary; every client write is an attacker's write. | RLS (one permissive policy per table and command, `(select auth.uid())`), BEFORE triggers on value columns, CHECK constraints. | `lib/supabase.ts`; `pg_policies`; triggers `guard_entitlement_columns` (trainers, clients; INSERT+UPDATE), `guard_enrollment_columns`, `guard_notification_insert`, `guard_client_auth_binding`, `guard_org_membership`, `guard_org_billing_columns`, `enforce_roster_cap`, `enforce_roster_cap_update`, `guard_plan_delete`; migrations `20260908040000`, `050000`, `050100`, `060000` |
| B2 | Phone → edge functions. Identity comes from the JWT, never the body. | `requireCaller`, `requireTrainerSelf`, `requireClientAccess`; internal-only functions `requireServiceRole`. | `supabase/functions/_shared/auth.ts` (lines 44, 77, 95, 106); every `supabase/functions/*/index.ts` |
| B3 | Phone → RPC surface. 31 definer functions are the API for anything RLS cannot express. Each checks `auth.uid()` against the row it touches. | Function bodies; `REVOKE EXECUTE` on trigger-only and server-only functions (`guard_*`, `log_audit_event`, `can_view_live_class`, `clear_live_class_viewers`); anon may call only `invite_public`, `lookup_client_by_contact`. | `accept_invite`, `create_invite`, `revoke_invite`, `request_coach`, `respond_coach_request`, `cancel_coach_request`, `create_client_and_notify`, `ensure_solo_client`, `link_client_to_auth_user`, `claim_athlete_role`, `publish_plan_track`, `increment/decrement_viewer_count`, `increment_conversation_unread`, `delete_client_account`, `org_*`, `ops_*`, `payment_split_for_trainer`, `cohort_member_count`, `touch_trainer_activity`, `my_org_id`, `is_org_member`, `is_platform_admin`, `owns_live_class`, `org_visible_trainer_ids` |
| B4 | Money. Price, payee, fee and entitlement are computed from server rows; the app sends ids. | `create-subscription` (payee = `plans.trainer_id`, fee = `payment_split_for_trainer()`), `create-payment-intent`, `stripe-webhook attachClientToPlan`, `syncCoachApplicationFee`, `confirm-entitlement`, `revenuecat-webhook`. Columns `elite_until`, `premium_until`, `org_id`, `stripe_*`, `plan_id`, `status`, `trial_end_date` refused to the phone. | `supabase/functions/create-subscription/index.ts`, `_shared/money.ts`, `_shared/fees.ts`, `stripe-webhook/index.ts`, `revenuecat-webhook/index.ts`, `confirm-entitlement/`, `payment_split_for_trainer` |
| B5 | Third parties → us (webhooks). | Stripe signature (`constructEvent`, two secrets), RevenueCat shared secret (constant-time compare), Mux signature (fails closed), event-id dedupe in `stripe_events`. | `stripe-webhook/index.ts`, `revenuecat-webhook/index.ts`, `mux-webhook/index.ts` |
| B6 | Us → third parties. Server secrets never reach the phone; the phone holds only publishable keys. | Supabase secrets (`STRIPE_SECRET`, `RC_API_KEY`, `RC_WEBHOOK_SECRET`, `MuxSecret`, `MUX_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `SENTRY_DSN`, FCM); EAS env holds `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live), Sentry DSN, USDA key. | `npx supabase secrets`, `eas env:list production`, CLAUDE.md → Supabase |
| B7 | Purchase identity. The RevenueCat app user id must equal the Supabase uid; activation is server-confirmed. | `ensureIdentity()` before every purchase/restore; `confirm-entitlement` reads RC for the caller's own uid; the webhook is the only revoker. | `context/RevenueCatContext.tsx`, `lib/entitlement.ts`, `hooks/useCoachElite.ts`, `supabase/functions/confirm-entitlement/` |
| B8 | Relationships are consent. A coach gets an athlete only when the athlete acts or pays. | `respond_coach_request`, `accept_invite`, paid pass via `attachClientToPlan`; every "claim/link" path removed. Invite codes are 6 chars from a 31-symbol alphabet, 30-day / 12-hour expiry, 60 per coach per day. | `accept_invite`, `create_invite`, `lib/invites.ts normalizeCode`, `app/add-client.tsx handleInviteFound`, `search-unassigned-clients` (exact-contact yes/no only) |
| B9 | Account binding. Which auth user owns which `clients` row. | `guard_client_auth_binding` trigger; `link_client_to_auth_user` (JWT email/phone must match); the auth.users triggers `handle_new_client_user` and `link_client_auth_user` auto-bind by email/phone at sign-up. **Depends on Supabase Auth email confirmation** — see A9. | triggers on `auth.users`, RPC `link_client_to_auth_user` |
| B10 | Deep links and universal links. Only a code or a fixed route ever crosses from the OS into the app. | AuthGuard allows signed-out groups `invite`, `i`, `live`; codes normalised before use; `stripe-return`/`stripe-refresh` carry no parameters and land on `/payouts`; `stripe-redirect` bounces only to `fitlink://`. Stripe opens as an in-app auth session and returns as a promise. | `app/_layout.tsx` (AuthGuard), `app/invite/[code].tsx`, `app/i/[code].tsx`, `app/live/[code].tsx`, `app/stripe-return.tsx`, `app/stripe-refresh.tsx`, `supabase/functions/stripe-redirect/index.ts`, `lib/payouts.ts`, `app.json` (`scheme`, `associatedDomains`), website `public/.well-known/apple-app-site-association` |
| B11 | Rendering untrusted text. No WebView, no HTML rendering; user text goes through `<Text>`; external URLs are `https:` only. | `lib/safeUrl.ts isSafeExternalUrl`; every `Linking.openURL` uses our constants, `mailto:`/`tel:` or `safeUrl`. Website uses React escaping, no `dangerouslySetInnerHTML`. | `lib/safeUrl.ts`, grep of `openURL(` |
| B12 | Storage. Object keys are prefixed by the uploader's uid; personal buckets are private; public buckets are fetch-by-URL only (no listing policy). | `storage.objects` policies (`storage.foldername(name)[1] = auth.uid()`); private: `chat-attachments`, `progress-photos`, `solo-audio`; public: `avatars`, `class-*`, `coach-media`, `diet-images`, `exercise-*`. | `storage.buckets`, `storage.objects` policies, migrations `050100`, `060000` |
| B13 | AI and paid compute. Every model call is per-user rate-limited (fails closed) and consent-gated. | `guardRate` buckets (solo-corner 60/h 200/d, solo-program 4/d, coach-assistant 60/h 200/d, generate-* 30–40/h, food-image 60/h, text-to-speech 100/h, create-mux-stream 20/h); `AiConsentSheet`. | `supabase/functions/_shared/rateLimit.ts`, `_shared/ai.ts`, `components/solo/AiConsentSheet.tsx`, `lib/aiConsent.ts` |
| B14 | Org tenancy. Org owners/admins see their coaches' clients, sessions and payments. | `is_org_member`, `org_visible_trainer_ids()` used in `clients_select`, `sessions_select`, `payments_select`; membership becomes active only by the invited person; seats guarded by `guard_org_membership`; billing columns guarded. Fee/roster waivers need paid seats. | `organization_members` policies + triggers, `payment_split_for_trainer`, `enforce_roster_cap` |
| B15 | Code delivery and secrets on this machine. Whoever holds the Expo account can push JS to every phone; whoever reads `credentials/` holds live keys. | `EAS_NO_VCS=1 eas update --channel production --environment production`; `.easignore` (credentials excluded from uploads); `.gitignore` (`credentials/`, `.env*`); `scripts/verify.js` secret scan in the pre-commit hook. | `eas.json`, `app.json` (`runtimeVersion` = appVersion), `.easignore`, `.gitignore`, `credentials/` |

## 3. Public entry points (no session)

| Entry | Where | Guard |
|-------|-------|-------|
| PostgREST reads with the anon key | `trainers_public` (safe columns, trigger-synced), `plans` (all columns incl. the pass outline `track`), `exercises`, `meals`, `waitlist_signups` INSERT (email regex, length caps) | RLS; `trainers_public` is a TABLE, never a view |
| Anon RPC | `invite_public(code)` (coach card for a code), `lookup_client_by_contact(contact)` (found / has_account / coach first name) | Definer bodies; no enumeration data returned |
| Edge functions without JWT verification | `stripe-webhook`, `revenuecat-webhook`, `mux-webhook` (verified payloads); `invite-info` (anon key, `check_key_rate_limit` by IP, marks opened); `stripe-redirect` (302 to `fitlink://` only); `calculate-class-revenue`, `client-autoflow`, `cleanup-chat-attachments` (`requireServiceRole`) | Per function |
| Supabase Auth | sign-up (email+password, phone OTP), sign-in, password reset; email confirmation setting decides whether a JWT email is proven | `context/AuthContext.tsx`, `app/(auth)/*`, `lib/authErrors.ts` (transport retry only) |
| Website | `/`, `/coaches`, `/athletes`, `/gyms`, `/pricing`, `/i/:code`, `/live/:code`, `/privacy`, `/terms`, `/delete-account`, `.well-known/apple-app-site-association` | `C:\projects\fitlink\src\App.jsx`, `vercel.json` rewrites/headers |
| OS links into the app | `fitlink://invite/CODE`, `fitlink://stripe-return`, `fitlink://stripe-refresh`, `https://fitlink.coach/i/CODE`, `/live/CODE` | B10 |
| Public media | Public buckets by URL; Mux HLS playback ids (`playback_policy: ['public']` in `create-mux-stream`) | Unguessable ids only |

## 4. Privileged components

- **Service-role holders**: every edge function's `caller.admin` / `createClient(SERVICE_ROLE)`; the auth.users triggers; `apply_org_seats`. A bug in any of these is a bug with no RLS behind it.
- **Money movers**: `create-subscription`, `create-payment-intent`, `create-setup-intent`, `cancel-subscription`, `create-connect-account`, `connect-account-link` (mints Express dashboard login links), `calculate-class-revenue` (Stripe transfers to coaches, idempotent per coach-month), `create-org-subscription`, `delete-trainer-account` (cancels every athlete subscription, then deletes), `stripe-webhook`.
- **Entitlement writers**: `revenuecat-webhook`, `confirm-entitlement` (both call `syncCoachApplicationFee`), `stripe-webhook account.updated` (Stripe Connect flags).
- **Definer RPCs** (B3) and **guard triggers** (B1). `sync_trainer_public`, `sync_trainer_org` run as postgres.
- **Platform admin**: `platform_admins` (no policies; service-only) → `is_platform_admin()` → `ops_health`, `ops_signals`, `app/ops/index.tsx`. Empty today.
- **Org owner/admin**: B14.
- **Coach over athlete**: RLS lets a coach read and write their roster's workouts, diets, logs, check-ins, meal logs, health snapshots (only with `health_sharing_enabled`), progress photos, chat, and **delete the athlete's row** (`clients_delete`, cascades).

## 5. Sensitive data

| Data | Where | Who can read | Boundary |
|------|-------|--------------|----------|
| Identity and contact (name, email, phone, DOB, avatar) | `clients`, `trainers`, `auth.users` | Self, own coach, org admins of that coach; `trainers_public` exposes only safe coach fields to everyone | B1, B14 |
| Intake and health (goals, injuries/limitations, weight, Apple Health snapshots) | `clients.assessment_data`, `client_health_snapshots`, `client_checkins`, `client_progress` | Self; coach only when the athlete enabled sharing (`health_sharing_enabled`) | B1 |
| Body photos | `progress-photos` (private bucket), `progress_photos` | Owner + coach | B12 |
| Meal photos, chat attachments | `diet-images` (public bucket, no listing), `chat-attachments` (private, participants) | URL holders / participants | B12 |
| Messages, AI conversations | `messages`, `conversations`, `solo_messages`, `live_class_messages` | Participants; solo messages are the athlete's only; live chat is roster + invitees | B1 |
| Financial | `payments`, `client_subscriptions`, `clients.stripe_customer_id`, `trainers.stripe_account_id`, `class_revenue_shares`, `organizations` billing columns; Stripe dashboard links | Own rows; coach/org for their revenue; dashboard link only for the account owner (`requireTrainerSelf`) | B1, B2, B4 |
| Entitlements | `trainers.elite_until`, `clients.premium_until` | Readable by self; written only by billing | B4, B7 |
| Streaming secrets | `live_class_secrets` (Mux stream key; owner-only RLS); `live_classes.mux_stream_key` legacy column (NULL on every row) | Class owner | B1 |
| Device contacts | read on the phone in `app/add-client.tsx` (`expo-contacts`), matched locally, never uploaded | Phone only | B11 |
| Auth session | Supabase session in SecureStore (`lib/secureStore.ts`) | Device | — |
| Server secrets | Supabase secrets, EAS env; on this machine `credentials/` (ASC key, and live Stripe / RC / Mux secret files that should have been deleted after use) | Operator | B6, B15 |

## 6. Third-party dependencies and what they could do to us

| Dependency | Role | If compromised or misconfigured |
|------------|------|----------------------------------|
| Supabase (Auth, Postgres, Storage, Edge, Realtime) | Everything | Total. Dashboard account = root; Auth settings (email confirmation, leaked-password check, OTP expiry) decide B9. Realtime `postgres_changes` honours RLS (channels `public:notifications`, `explore-live-classes`, `library-live-classes`). |
| Stripe (Connect Express, Subscriptions, Payment Sheet) | All money | Webhook secret leak = forged payments/attachments (dedupe by event id limits replay); `STRIPE_SECRET` leak = full money control. |
| RevenueCat + Apple StoreKit | Entitlements | Shared-secret leak = forged grants (webhook only grants forward, revokes with grace); RC public key cannot grant. |
| Mux | Live ingest + playback | Stream key leak = hijacked broadcast; playback is public-by-id. |
| Gemini, ElevenLabs | AI content | Cost abuse bounded by B13; model output is clamped in `_shared/ai.ts`. |
| Expo / EAS | OTA JS + builds | Expo account = arbitrary code on every phone (B15). |
| Vercel | Website + AASA | Vercel account = phishing pages under `fitlink.coach` and universal-link hijack. |
| GitHub | Source | The remote embeds a PAT (never echo it); CI runs typecheck/verify/tests. |
| Sentry, Expo push/FCM, USDA, Spotify | Telemetry, notifications, nutrition, music | Data exposure limited to what is sent; Sentry receives error context. |
| npm dependencies | Build | Standard supply-chain exposure; pins in `package.json`. |

## 7. Irreversible actions

| Action | Actor | Path |
|--------|-------|------|
| Charge an athlete, start a recurring subscription | Athlete (with a coach's charges enabled) | `app/checkout.tsx` → `create-subscription` |
| Transfer class revenue to coaches | Ops (service role) | `calculate-class-revenue` (idempotent per coach-month) |
| Cancel every athlete's subscription and delete the coach | Coach | `delete-trainer-account` → `delete_trainer_account_for` |
| Delete an athlete account and its auth user | Athlete | `delete_client_account` |
| Delete an athlete's row and cascade their history | **Coach** | `clients_delete` policy (`app/client/[id].tsx` remove) |
| Purge account media | Owner | `delete-account-media` |
| Delete a pass | Coach (blocked while it has holders) | `guard_plan_delete` |
| Revoke an invite, end/cancel a live class (Mux stream deleted, seats cleared) | Coach | `revoke_invite`, `endLiveClass`, `clear_live_class_viewers` |
| Apply org seats, change a gym's revenue share (audited) | Stripe webhook / org owner | `apply_org_seats`, `guard_org_billing_columns` |
| Send a message, push, notification, OTP | Users / server | Unrecallable |
| Publish an OTA update, rotate a secret | Operator | `eas update`, `supabase secrets set` |

## 8. Attacker goals and abuse paths

**A1. Pay less to FitLink (coach).** Set `org_id` (0% fee) or `elite_until` on own row; create an unpaid org; insert a pre-Elite trainers row. Path: `trainers_update_own` / `trainers_insert_own` + `payment_split_for_trainer`. **Closed 2026-09-08** (`guard_entitlement_columns` INSERT+UPDATE; org waiver needs `seat_status` active/trialing; `syncCoachApplicationFee` re-prices live subscriptions when Elite starts or lapses). Residual: `invoice.created` must be among the Stripe destination's events for the renewal re-check (operator setting).

**A2. Get paid content free (athlete).** Set own `plan_id/status`, insert own row on a pass, move an enrollment to a pricier pass, read `workout_exercises`/`diet_plan_meals` by id from the public pass outline. **Closed 2026-09-08** (athlete-side column locks; `guard_enrollment_columns`; parent-scoped child SELECT). Residual by design: `plans.track` outline (labels, order) is public as the sales pitch; workout content behind it is not.

**A3. Free entitlement (either role).** Write `premium_until`/`elite_until`; call `confirm-entitlement` for someone else; forge a RevenueCat webhook. **Closed / by design**: columns billing-only; confirm-entitlement reads RC for the caller's own uid; webhook secret + forward-only grants; Apple receipts validated by RC.

**A4. Redirect someone else's money.** Send a different `trainerId` to checkout; set another coach's `stripe_account_id`; mint another coach's dashboard link. **Closed**: payee from `plans.trainer_id` server-side; Stripe columns billing-only; `requireTrainerSelf`.

**A5. Take an athlete without consent (coach).** Old search+link path (claim any Solo athlete with the service role, insert a row bound to their uid); `create_client_and_notify` direct attach. **Closed 2026-09-08** (exact-contact yes/no; Invite only; request on every path; coach insert may not pre-bind a uid).

**A6. Enumerate people / harvest PII.** Prefix search of coachless athletes with intake; `lookup_client_by_contact` echoing names; listing the meal-photo bucket; `trainers_public`. **Closed** for the first three; `trainers_public` is public by design (coach marketplace).

**A7. Forge signals.** Athlete inserts "bought a pass" into a coach inbox; anyone writes `audit_events`; anyone inflates viewer counts; fake PR events in a squad feed. **Closed** for the first three (type allow-list, revoke, presence table + `can_view_live_class`). Squad events remain vanity (`squad_events_insert` requires an enrollment on that plan).

**A8. Hijack a broadcast or watch free.** Read a coach's stream key; share a playback id. Stream keys are in `live_class_secrets` (owner-only) and the legacy `live_classes.mux_stream_key` column is NULL everywhere; playback ids are public-by-id (Mux `playback_policy: ['public']`) and reach roster athletes and invite holders, so a shared HLS URL plays for anyone — **open, low value** (a live class, not money).

**A9. Account pre-binding (identity).** A coach types `victim@x.com` into a client row (Add athlete → manual) before the victim signs up; the auth.users triggers `handle_new_client_user` / `link_client_auth_user` bound that row to whoever signed up with that email or phone first, verified or not. **Closed 2026-09-08** (migration `20260908070000` §5): binding needs a confirmed phone or a mail-confirmed email (`contact_verified`); `link_client_to_auth_user` answers `verify_contact` otherwise; invitation codes remain the verified path. While Auth auto-confirm is on, email-added athletes join by code or phone.

**A25–A30. Abuse and cost (2026-09-08, `.agents/ABUSE_REVIEW.md`).** Paid AI routes were callable by any free account with only per-account limits; pushes, contact lookups, direct messages, notifications, reports, the waitlist, anonymous lookups and coach requests had no server-side rate; four buckets had no size or type limit; the Mux webhook accepted replays of any age. **Closed**: coaches-only gates, platform-wide daily ceilings per paid bucket, `rate_limit_writes` triggers, per-address limits on anonymous RPCs (`request_ip()`), bucket ceilings, a 300 s replay window. **Operator**: CAPTCHA and Auth rate limits (C10) are what stop account farming from resetting every per-account limit.

**A21–A24. Input, secrets and output (2026-09-08, `.agents/INPUT_REVIEW.md`).** A LIKE wildcard in the coach's contact lookup could enumerate coachless athletes one name per probe; user text had no server-side length bound on 35 columns (a megabyte chat message would reach every realtime subscriber); fourteen functions echoed Postgres/Stripe/Mux error text to callers; one webhook logged whole chat rows. **All closed** (`_shared/contact.ts`, migration `20260908080000`, `_shared/http.ts`). Verified clean: no secrets in tracked files or history, only publishable keys in the bundle, no dynamic SQL, no HTML rendering, redirect and deep-link handling hold under CRLF/`javascript:`/markup probes.

**A15–A20. Tenant isolation (2026-09-08, `.agents/AUTHZ_REVIEW.md`).** A coach could write conversations, sessions, workouts, progress entries and photos into ANY athlete's space (INSERT policies checked only `trainer_id = uid`); anyone could post in any live chat under any name; an athlete's read of `trainers` returned the coach's push token (Expo pushes need no auth to send), Stripe account id and contact; custom meals and exercises were readable by anonymous; server-only functions kept a PUBLIC grant. **All closed** (migration `20260908070000`, `send-push-notification` resolves recipients server-side, athletes read `trainers_public`). Accepted: a coach still reads a roster athlete's token and a requester's intake (I7).

**A10. Deep-link and redirect abuse.** Craft `fitlink://invite/CODE` to move an athlete; smuggle a URL through `stripe-redirect`; spoof a return. **Closed / by design**: switching coaches requires explicit confirmation (`needs_switch_confirmation`); the redirect accepts only `fitlink://`; return routes carry nothing.

**A11. Cost abuse.** Burn AI quota, storage, push. **Bounded** by B13 rate buckets (fail closed), scoped storage INSERT policies, 60 invites/day, notification type allow-list; `waitlist_signups` and `coach_reports` accept inserts from anyone signed in / anon (spam only).

**A12. Supply chain and operator.** Expo, Vercel, Supabase, Stripe, GitHub accounts; live secret files left in `credentials/`; the PAT in the git remote. **Open, operator-owned**: enable MFA on all four accounts, delete the three `*.env.txt` files, rotate the PAT and the Spotify secret in git history (memory: pending ops).

**A13. Coach destroys an athlete's history.** `clients_delete` lets a coach delete a roster row and everything cascading from it, including data the athlete generated. **Open, by current design** (the coach "removes a client"); the athlete has no copy.

**A14. Org owner reads coach revenue and athletes.** B14 visibility is intentional for gyms; no org exists today, and membership requires the invited person's own acceptance.

## 9. What the map says to fix next (after this document, not before)

Ranked by value at risk × ease of reach:

1. ~~A9 — pre-binding by contact~~ closed 2026-09-08; the operator still decides the Auth email-confirmation setting and enables leaked-password protection.
2. **A12 — operator hygiene.** Delete `credentials/*.env.txt`, MFA everywhere, rotate the remote PAT.
3. **A8 — playback ids.** Move Mux to signed playback (`playback_policy: ['signed']` + short-lived tokens minted by an edge function that checks `can_view_live_class`), and drop the legacy `live_classes.mux_stream_key` column.
4. **A13 — coach deletion of athletes.** Make "remove client" detach (`trainer_id = NULL`, status inactive) instead of delete, so the athlete keeps their history.
5. **Residual monitoring.** Alert on `audit_events` denials, on `stripe_events` gaps, and on `confirm-entitlement` 502s (RevenueCat unreachable).

The proofs for every "closed" entry are in `supabase/security/` and re-run with
`python supabase/security/run_audit.py <file>`.
