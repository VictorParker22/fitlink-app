# Security fix campaign — 2026-08-18

Three read-only audits (database access control, edge functions, client app) found a
single root cause with many symptoms:

> **The anon key ships inside the app binary. Every policy is written for role
> `public` (which includes `anon`), and every `SECURITY DEFINER` function is
> `EXECUTE`-able by `anon`. So any `USING(true)` policy and any unguarded DEFINER
> function is reachable by anyone who unzips the APK — no account required.**

A correction to the first summary: "revoke the blanket table grants" would be
**wrong**. `anon`/`authenticated` holding table DML is the documented Supabase
setup — RLS is the intended gate. Blanket-revoking breaks the whole app. The fix
is surgical: delete the `USING(true)` policies, guard the DEFINER functions,
revoke `EXECUTE` from `anon` where the function was never meant to be public, and
bind edge-function body ids to the caller's JWT.

Severity reflects the **shape of the defect at production scale**, not today's row
counts (17 clients, 0 payments, 1 health row — this is pre-launch, which is why
this is hardening rather than incident response).

---

## Phase A — Database (one migration, no app changes)

| # | Fix | Was |
|---|---|---|
| A1 | `link_client_to_auth_user()` verifies `p_email`/`p_phone` against the caller's JWT | Any unlinked athlete's record could be bound to an attacker's login |
| A2 | `lookup_client_by_contact()` stops returning `client_email`/`client_phone` | Unauthenticated phone/name/coach oracle over every athlete |
| A3 | Drop the three `USING(true)` policies on `client_health_snapshots` | HR/BP/SpO2/weight world-readable **and writable** |
| A4 | Drop four fake "Service role" policies on `payments` / `client_subscriptions` | Anyone could grant themselves a subscription or forge succeeded payments |
| A5 | `increment_conversation_unread()` requires the caller be a participant | Anyone could write the inbox preview of any coach↔athlete thread |
| A6 | Scope `notifications` INSERT to the caller's own coach relationship | Anyone could forge a first-party notification to any coach |
| A7 | Scope `live_class_messages` UPDATE to the class owner | Any user could edit any live-class message |
| A8 | `exercise-videos` DELETE requires `owner = auth.uid()` | **Any athlete could wipe the shared exercise-video library** |
| A9 | `chat-attachments` SELECT requires `authenticated` | Anon could *enumerate* every private attachment (see C3 for the rest) |
| A10 | `REVOKE EXECUTE ... FROM anon` on functions never meant to be public | Watch-minute leaderboard leak; anon-callable internals |
| A11 | `create_client_and_notify()` writes `description`/`is_read` | Phantom columns → **no coach has ever received a new-client notification** |

## Phase B — Edge functions

- **B1** Shared `requireCaller()` helper: resolve the JWT to a real user, reject the
  bare anon key. `transfer-vod` already models this — it is the reference.
- **B2** Bind body ids to the caller on every money path (`create-payment-intent`,
  `create-subscription`, `create-class-subscription`, `create-setup-intent`,
  `cancel-subscription`, `create-connect-account`, `connect-account-link`).
- **B3** `send-push-notification` takes a **recipient user id**, not a token —
  verifies the caller may message them, looks the token up server-side. This is
  what later allows the `expo_push_token` column to be revoked from clients (C4).
- **B4** `calculate-class-revenue`: require service-role/cron caller **and** make
  payouts idempotent per (trainer, month) so re-invocation cannot pay twice.
- **B5** `search-unassigned-clients`: delete or fully rewrite — `claim`/`link` are
  account-takeover primitives and the search leaks `auth.users`. It also has
  PostgREST filter injection via unescaped `q`.
- **B6** `client-autoflow`, `cleanup-chat-attachments`, `text-to-speech`,
  `mux-webhook` (fails open when the secret is unset), `stripe-redirect` (open
  redirect).

## Phase C — Client app

- **C1** `signOut` clears `clearSnapshots()` + outbox + `layers.reset()`. All three
  exist and none is called — athlete PII outlives the session on shared devices.
- **C2** Allowlist push-payload deep links (`router.push(data.url)`), and replace
  `url.includes('youtube.com')` with real scheme+host parsing.
- **C3** `chat-attachments` / `progress-photos` → private buckets + signed URLs.
  Policy alone cannot fix a `public: true` bucket; the CDN serves objects without
  RLS. Requires app changes, hence Phase C.
- **C4** Stop reading peers' `expo_push_token` client-side (depends on B3), then
  revoke the column. Remove production `console.log` of tokens.
- **C5** Path-prefix uploads by uid so storage INSERT can be path-scoped (uploads
  currently use flat `Date.now()` filenames, so a path policy would break them).
- **C6** Defense in depth: `.eq('trainer_id', user.id)` on the `conversations`
  fetch in `messages.tsx`, which currently relies on RLS alone and then caches the
  result to disk.

## Required from the account owner (cannot be fixed in code)

1. **Turn ON email confirmation in Supabase Auth.** A1 binds the link to the
   caller's JWT email — if unverified signups are allowed, an attacker can still
   obtain a JWT carrying a victim's address and the check means nothing. A1 is
   necessary; this setting is what makes it sufficient.
2. **Rotate the iOS distribution certificate** — its password is in git history
   (commits `19bb80d`, `8adeef1`). The `.p12` itself was never committed, so this
   is not yet weaponizable, but history was never rewritten.
3. **Restrict the Firebase Android API key** in the GCP console (package name +
   SHA-1), and rotate the Spotify secret and GitHub PAT as previously flagged.
