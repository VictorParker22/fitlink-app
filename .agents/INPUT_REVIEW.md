# FitLink — secrets, validation and output review

Reviewed 2026-09-08. Untrusted input was traced from every public route to
its sinks: PostgREST queries and RPCs, Stripe / Mux / RevenueCat / Gemini /
ElevenLabs / Expo calls, logs, HTTP responses, and rendering in the app and
on the website. Shell commands and server templates do not exist in this
stack (Deno functions, no exec; React Native and React render text, no HTML).

Proofs:

```
python supabase/security/run_audit.py supabase/security/input_validation.sql   # database bounds and RPC inputs
npx jest tests/contact.test.ts                                                 # the contact helpers used by the lookup
```

plus the anonymous HTTP probes recorded under each finding (curl, no session).

## Entry points and where their input goes

| Route | Input | Sinks | Guard at the sink |
|-------|-------|-------|-------------------|
| PostgREST (anon key) | Column values, filter strings | Tables under RLS | Parameterised by PostgREST; policies; BEFORE triggers; CHECK constraints (added: migration `20260908080000`) |
| RPC `invite_public`, `lookup_client_by_contact` (anon) | `code`, `contact` | SQL in plpgsql | Parameters, never concatenated; code stripped to `[A-Z0-9]{6}`; contact `LEFT(200)` |
| `invite-info` (anon key, POST `{code}`) | `code` | RPCs above, `key_rate_limits` by hashed IP | `normaliseCode` (64-char slice, uppercase, `[A-Z0-9]`, must be 6); non-JSON body → 404; neither code nor IP logged |
| `stripe-redirect?url=` (no auth) | `url` | `Location` header | Only `fitlink://`, control characters rejected; probes below |
| Signed-in edge functions | JSON bodies | Postgres (service role), Stripe, Mux, Gemini, ElevenLabs, Expo push | `requireCaller` first; ids resolved to the caller's own rows; text clamped where it reaches a model (`clampText`, `clampStr`); output clamped (`_shared/ai.ts`) |
| Webhooks | Signed payloads | Postgres | Signature / secret; dedupe; only ids logged |
| App deep links | `code` in `fitlink://invite/CODE`, `/i/CODE`, `/live/CODE` | Router, RPC | `normalizeCode` in `lib/invites.ts`; Stripe returns carry no parameters |
| Website `/i/:code`, `/live/:code` | URL param | `invite-info`, `href="fitlink://invite/…"`, Mux HLS URL | Normalised to `[A-Z2-9]` before use (`InvitePage.jsx:28`); React escapes text; playback id comes from the server |
| Push (`send-push-notification`) | `title`, `body`, `data.url`, recipient id | Expo push API | Recipient resolved server-side; `data.url` through `safeDataUrl`; relationship check |

## Findings

| # | Finding | Evidence | Impact | Test | Status |
|---|---------|----------|--------|------|--------|
| V1 | **LIKE wildcards in the coach's contact lookup.** The email went into `.ilike('email', email)` unescaped; `%@gmail.com` passes the email regex and matches every Gmail athlete, returning a stranger's name and picture. | `supabase/functions/search-unassigned-clients/index.ts:64` (before: `q.ilike('email', email)`) | Enumeration of coachless athletes by pattern, one name per probe. | `tests/contact.test.ts` ("a wildcard email still passes asEmail…"); helper `_shared/contact.ts escapeLike` | **Closed** — pattern characters escaped |
| V2 | **No server-side length bounds on user text.** `messages.content`, `clients.name/email/phone/notes`, `trainers.bio`, `coach_reports.*`, pass/workout/diet names and descriptions, invite fields, class titles, session notes had no CHECK; only the phone's `maxLength` (`app/chat/[id].tsx:1041`) stood between a user and a megabyte row broadcast to every realtime subscriber. | `information_schema.columns` (no `character_maximum_length`), `pg_constraint` (only three `char_length` checks existed) | Storage and realtime abuse, oversized pushes and notifications. | `input_validation.sql`: 5,000-char message refused, normal message allowed; 500-char coach name refused; 20,000-char notes refused; 1,000-char live chat refused | **Closed** — migration `20260908080000` adds `NOT VALID` CHECKs on 35 columns |
| V3 | **Internal error text echoed to callers.** Twenty functions returned `{ error: err.message }` (or `error.message \|\| 'Internal Server Error'`) on 500: Postgres constraint names, Stripe messages with customer/account ids, Gemini and ElevenLabs responses, Mux and fetch internals. | `calculate-class-revenue:177`, `cancel-subscription:123`, `cleanup-chat-attachments:66`, `client-autoflow:212`, `connect-account-link:128`, `create-connect-account:103`, `create-mux-stream:94`, `create-payment-intent:174`, `create-setup-intent:100`, `create-subscription:291`, `delete-trainer-account:86`, `food-image:92`, `mux-webhook:223`, `transfer-vod:130`, `coach-assistant:135`, `generate-diet:172`, `generate-exercise:116`, `generate-workout:151`, `rewrite-exercise:96`, `text-to-speech:222` (pre-fix lines) | Schema and vendor-id disclosure to any signed-in caller. | Grep in `scratchpad/error_echo_clean.py` reports zero remaining echoes; each function logs the real error with its endpoint | **Closed** — `_shared/http.ts internalError()` |
| V4 | **A DB-webhook payload logged whole.** `cleanup-chat-attachments` logged the entire `messages` DELETE payload, i.e. the message row (content, sender) into function logs. | `cleanup-chat-attachments/index.ts:24` (before) | Chat content retained in logs. | Log line now carries type, table and row id only | **Closed** |
| V5 | **Credentials.** Tracked files carry no secret-shaped strings (`sk_live_`, `whsec_`, `rk_`, `AIza`, private keys, `ghp_`, `xox`). History hits for `client_secret` are Stripe's `payment_intent.client_secret` field name; the one `whsec_` is a `whsec_...` placeholder in a comment. The client bundle carries exactly `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (pk_live) and `EXPO_PUBLIC_USDA_API_KEY`; the website carries the Supabase URL and publishable key. Spotify uses PKCE, no secret. Sentry runs with `sendDefaultPii: false` (`app/_layout.tsx:52`). Analytics sends name and role, never email or phone. | `git grep`, `git log -S`, `grep EXPO_PUBLIC_`, `lib/spotify.ts:2-21` | The USDA key is a per-app public quota key by design. Three used secret files remain in `credentials/` on this machine (threat model A12). | `node scripts/verify.js` secret scan runs pre-commit | **Verified**; A12 remains operator work |
| V6 | **Over-broad responses.** `invite-info` returns the coach's public card (id, name, avatar, specialisation, bio) and, for live invites, the playback id only while the class is live; never the invitee's name or contact. `search-unassigned-clients` returns name and avatar for one exact contact. `lookup_client_by_contact` returns found / has_account / coach first name. `send-push-notification` returns Expo's receipt for the caller's own push. | `invite_public` definition; probes below | — | Probe: `POST invite-info {"code":"VP7K3Q"}` → 200 with the fields above and nothing else | **Verified** |
| V7 | **Injection paths.** No dynamic SQL in definer functions (`EXECUTE format` appears only in migrations building policies); PostgREST filters built in the app use the server-issued `user.id` only (`context/AppContext.tsx:690-774`); Gemini prompts carry clamped user text and every model field is clamped or dropped on the way back (`_shared/ai.ts`); Stripe metadata carries ids; storage keys are `uid/timestamp`. | greps recorded in the session | — | `input_validation.sql`: `lookup_client_by_contact('%')` → found false; `invite_public('<script>…')` → null | **Verified** |
| V8 | **Output encoding.** React Native `<Text>` everywhere, no WebView; website React with no `dangerouslySetInnerHTML`; `href` values are built from a normalised code; push `data.url` is allow-listed; `Linking.openURL` targets are constants, `mailto:`/`tel:`, or `lib/safeUrl.ts` (https only, host checked). | greps recorded in the session; `lib/safeUrl.ts:17-27` | — | Probe: `stripe-redirect?url=fitlink://x%0d%0aSet-Cookie:a=b` → `Location: fitlink://stripe-return`; `?url=javascript:alert(1)` → 403 at the edge | **Verified** |
| V9 | **Anonymous route robustness.** `invite-info` with markup, a 5,000-character code, a non-JSON body and an unknown code all answer 404 `not_found`; every signed-in function answers 401 without a token, including the three service-role-only ones. | curl probes, 2026-09-08 | — | Re-run the curls in this file's history; `supabase/security/` does not cover HTTP | **Verified** |

## Residual notes

- Length bounds are `NOT VALID`: rows written before 2026-09-08 that exceed
  them are untouched; every new write is checked.
- `create-mux-stream` and `transfer-vod` used to answer 400 for every failure;
  they now answer 500 with the generic message. The app treats both the same.
- The USDA nutrition key ships in the binary on purpose (per-app quota, no
  account access); rotate it if the quota is ever abused.
