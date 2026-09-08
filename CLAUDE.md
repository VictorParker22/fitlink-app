# FitLink — working notes for Claude

Read these first, in this order:

1. `.agents/INVARIANTS.md` — rules that each exist because breaking them shipped a bug.
2. `.agents/AGENTS.md` — what the project is: stack, directories, edge functions, payments.
3. `.agents/DESIGN.md` — the enforceable design system (dark/lime, type, motion, imagery).
4. `docs/store/SUBMISSION.md` — App Privacy / Play data-safety answers derived from the code.

This file holds what those do not: how work actually ships here, and the
decisions and traps from the 2026-09 release push.

## Commands

```bash
npm run check          # tsc --noEmit + node scripts/verify.js + jest --ci  (run before every commit)
npm test               # jest (tests/**/*.test.ts, jest-expo preset, reanimated mock)
npm run eval:personas  # Solo corner golden set against Gemini (skips cleanly without GEMINI_API_KEY)
node scripts/verify.js # pattern linter for known-bad code; also runs in the pre-commit hook
```

CI (`.github/workflows/ci.yml`) runs typecheck, verify and tests on every push and PR to
`master`. `.github/workflows/evals.yml` runs the persona golden set whenever the corner
prompts, `_shared/ai.ts`, `evals/**` or the eval runner change (needs the `GEMINI_API_KEY`
repository secret).

## Shipping

- **JS-only changes ship over the air.** `EAS_NO_VCS=1 npx eas update --channel production --environment production --message "..." --non-interactive`.
  **`--environment production` is mandatory.** `EXPO_PUBLIC_SENTRY_DSN`,
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (a `pk_live_` key) and `EXPO_PUBLIC_USDA_API_KEY` live
  only in EAS's production environment (`npx eas env:list production`); without the flag the
  bundle inlines EMPTY strings, Sentry never starts and the Stripe payment sheet has no key.
  Every update on 2026-09-07 before the last one shipped that way.
  Runtime version policy is `appVersion` (currently `1.0.0`); every build on that version
  receives the update. Use this freely for JS changes.
- **Native builds are ask-first** unless the user says ship. `EAS_NO_VCS=1` always.
  iOS: `npx eas build --platform ios --profile production --auto-submit --non-interactive --no-wait`
  with `EXPO_APPLE_ID=victor.parkerr@gmail.com` (auto-submits to TestFlight, `ascAppId` 6779058450).
  Android: `EAS_NO_VCS=1 npx eas build -p android -e production --no-wait` (no Play app yet, so no submit).
- **`.easignore` is the upload gate.** It excludes credentials, PDFs, root SQL/patch/txt/cjs
  files and `SOP.md`. `data/` and `google-services.json` MUST stay in the upload.
- A new native module (config plugin) means a new build; until then the JS must survive its
  absence. See `lib/soloDictation.ts` for the pattern: probe with
  `requireOptionalNativeModule` before requiring the package, never import it at module top.
- **Dependency pins that matter:** `expo-speech-recognition` is `3.1.3` exactly. The `56.x`/`57.x`
  line targets a newer `expo-modules-core` and breaks the Android Gradle build on SDK 54.
  `@shopify/flash-list` is v2 (no `estimatedItemSize`; needs the new architecture, which is on).
- Build logs from EAS are Brotli-compressed JSON lines: `curl -s --compressed <logFiles[0]>`,
  then read the `msg` field of each line.

## Supabase

- Project `qcmtaskhyhwzyoegtfpw`. The Supabase MCP server in `.mcp.json` is **read-only**
  (SELECT, logs, advisors). Writes go through the CLI: `npx supabase db query --linked -f <file.sql>`
  (commits immediately; no `BEGIN/COMMIT` in migration files). Deploy functions one at a time:
  `npx supabase functions deploy <name>` (`--no-verify-jwt` only for `stripe-webhook` and
  `revenuecat-webhook`). Loops of deploys and some destructive commands get blocked by the
  tool classifier; retry as a single plain command, never work around it.
- Migrations live in `supabase/migrations/` and are applied by hand with the command above;
  keep the file even after applying so the history is reproducible.
- **Column-level `REVOKE` on `public.clients` is a no-op** (authenticated holds table-wide
  UPDATE; column privileges are additive). Protect columns with the
  `guard_entitlement_columns` BEFORE UPDATE trigger instead. It currently guards
  `premium_until`, `trainer_id`, `requested_trainer_id`, `coach_*_at/by`, `solo_summary*`.
- Trigger functions are `REVOKE EXECUTE ... FROM anon, authenticated` so they cannot be called
  over RPC. Every `SECURITY DEFINER` function pins `SET search_path TO ''`.
- `trainers_public` is a TABLE (safe columns only) synced from `trainers` by the
  `sync_trainer_public` trigger, SELECT-only for anon and authenticated. It used to be a
  SECURITY DEFINER view that anon could UPDATE through; never bring the view back. Any new
  public coach field must be added to the table, the trigger and the backfill together.
- Row security was consolidated on 2026-09-05: one permissive policy per table and command,
  `auth.uid()` always as `(select auth.uid())`. Before touching policies, dump
  `pg_policies` and dry-run inside a rolled-back transaction with role simulation
  (`set local role authenticated; set local request.jwt.claims ...`).
- Secrets (set with `npx supabase secrets set`): `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`,
  `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RC_WEBHOOK_SECRET`, `SENTRY_DSN`, Mux keys, FCM.
  `STRIPE_CONNECT_WEBHOOK_SECRET` is not set (stripe-webhook accepts two secrets).
  **Stripe is LIVE on the server since 2026-09-07** (`STRIPE_SECRET` = sk_live, `STRIPE_WEBHOOK_SECRET`
  = the live "Stripe-Payments" destination, 7 events incl. account.updated); the app's
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` on EAS is pk_live. All pre-switch `stripe_account_id`s
  were sandbox accounts and were cleared (migration 20260907230000). `STRIPE_ORG_SEAT_PRICE` is
  still a sandbox price id (gym seats are not in the launch path). A `credentials/*.env*`
  file is how live secrets reach this machine; never paste them into chat or commit them.

## Edge functions (Deno, `supabase/functions/`)

- Every paid/AI function goes through `_shared/rateLimit.ts` (`guardRate`, fails CLOSED on paid
  buckets, hourly + `daily` ceilings) and `_shared/ai.ts` (`withRetry` 20 s timeout + 1 retry,
  `PROMPT_VERSION`, `clampInt/clampStr/pickEnum/parseJson`, `numbersNotInContext`, `report()`
  to Sentry). Never trust model JSON: clamp every field, drop rows that fail.
- `solo-corner` streams when `body.stream === true`: first line JSON meta, then text, then an
  optional tail line `{"reply": ..., "flagged": [...]}` only when the grounding rewrite changed
  the text. The client reader is `lib/soloStream.ts` (XHR progress; falls back to the JSON
  call). The grounding source includes the athlete's own message and recent turns.
- `solo-program` writes `workouts` with `trainer_id NULL`; `category` must be one of
  strength/cardio/flexibility/hiit/circuit (DB check). `adapt` keeps today's completed session.
- `text-to-speech` mode `solo`: one ElevenLabs voice per character, private bucket `solo-audio`,
  signed URLs, sha256 cache. Streaming replies make two clips per reply, caps are sized for that.

## App architecture decisions

- **Contexts are sliced.** `AppContext` (coach) exposes `useAppClients/Plans/Sessions/Business/Meta`;
  `ClientContext` (athlete) exposes `useClientIdentity/Training/Sessions/Nutrition/Progress`.
  `useApp()` / `useClient()` still return everything. New components read the narrowest slice;
  a compile-time coverage check fails `tsc` if a key is left out of every slice.
- **Coach side: `clients` is the roster only.** Pending coaching requests are `coachRequests`.
  Never count a request as a client (celebrations, seats, nudges, revenue tiles).
- **Coach requests are requests.** `clients.trainer_id` is set only by the coach accepting
  (`respond_coach_request`). `request_coach` sets `requested_trainer_id`, writes the intro
  message server-side (athletes cannot insert conversations under RLS), and notifies the coach.
  `cancel_coach_request` withdraws. Declines stamp `coach_declined_at/by`; the athlete home
  shows pending / accepted / declined strips for a week each. Solo athletes are not pitched a
  coach in their first week.
- **Solo mode.** Coachless athletes own a `clients` row with `trainer_id NULL`, `status 'solo'`
  (`ensure_solo_client()`). `onboarding_path` in auth metadata decides whether Home leads with
  the corner or with Find your coach. Premium is `clients.premium_until`, written only by the
  RevenueCat webhook (and the entitlement trigger guard).
- **Onboarding.** Editorial screens under `app/(auth)/` use `constants/onboardingDesign.ts`
  and `components/onboarding/Editorial.tsx` (+ `components/onboarding/Plan.tsx`: SegmentBar,
  Tile, DayStrip, PlanCard); those fonts load in `app/(auth)/_layout.tsx`, not the root.
  Account creation is email or phone code only — no Apple/Google sign-in (user decision).
  The draft in `lib/onboardingDraft.ts` is applied on SIGNED_IN by AuthContext.
- **Athlete onboarding map (2026-09-06, canvas "FitLink First Week").** welcome (value-first
  week loop) → role → intake.tsx (3 steps: Goal tiles, Rhythm day strip + where, Writing 2.4 s
  → Reveal with the coach/solo fork) → account (name, DOB, email|phone) → sign-in →
  athlete-permissions → Home (solo → solo-setup). The ONLY question set: goal key
  ('strength'|'fat_loss'|'return'|'pain', labels in `GOAL_LABEL`), training days
  (['tue','thu','sat']), setting (gym|home|outdoors), path. `applyOnboardingDraft` writes the
  SecureStore `fitlink_client_onboarded_<uid>` flag FIRST, then metadata `intake_goal`,
  `intake_goal_key`, `intake_days`, `intake_training_days`, `onboarding_intake`,
  `onboarding_path`, `client_onboarded`. Readers: AuthGuard (also treats a client draft as
  onboarded), find-coach (skips its intake when goal+days exist; `lib/intakeMap.ts` is the
  translation layer), solo-program (schedules on `intake_training_days`), coachMatch,
  clientGoals. `client-onboarding.tsx` (old 5-question form) is legacy-only: it redirects
  when the flag/draft exists. Never add a question to onboarding that nothing downstream
  reads; defer it into the product (weight, time of day, coaching style live there now).
- **Coach finder (2026-09-06, canvas "FitLink Coach Match").** app/(client-tabs)/find-coach.tsx
  opens on `matches` when onboarding answers exist: a horizontal card pager (best fit first),
  every card line a derived fact from trainers_public + working_hours + plans (`buildMatch`:
  facts/gaps/goalMatch/dayFit), profile with fit bars and real passes, a request PRE-WRITTEN from
  the answers (time/style optional chips), a sent moment with a timeline. The legacy `intake`
  step exists only for accounts without `intake_goal_key`/`intake_days`. Never add ratings,
  response times or athlete counts to a coach card: the data does not exist.
- **Invitations (2026-09-08, canvas "FitLink Invitations").** One table `invites` (6-char
  code from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, `kind` coach|live, sent/opened/accepted
  timestamps, Realtime on) plus `live_class_access` (a live invite grants ONE class, not the
  coach; `live_classes_select` reads it). RPCs: `create_invite` (name+contact null = the
  coach's standing link, reused), `invite_public` (anon-safe, trainers_public fields only),
  `accept_invite(code, confirm_switch)` (attaches the athlete; error strings
  `invite_not_found | invite_expired | invite_already_accepted | needs_switch_confirmation:
  <coach> | trainer_cannot_accept`), `revoke_invite`. Edge fn `invite-info` (anon key, POST
  {code}) is what the website calls; it marks opened and is IP rate-limited via
  `check_key_rate_limit` (guardRate needs a real auth user id). App: `lib/invites.ts`
  (links `https://fitlink.coach/i/CODE`, `/live/CODE`, deep link `fitlink://invite/CODE`,
  pending code in AsyncStorage `fitlink_pending_invite`), `components/invites/InviteSheet.tsx`,
  `app/invites.tsx` (coach list, realtime channel `invites:<uid>`), `app/invite/[code].tsx`
  (arrival; signed-out parks the code and the AuthGuard resumes it after SIGNED_IN),
  `app/invite/enter.tsx`. Website (C:\projects\fitlink): `/i/:code`, `/live/:code` (hls.js).
  Universal links for `fitlink.coach` need `associatedDomains` + an AASA file = a native
  build; until then the web page hands off via the custom scheme and the typed code.
  `tests/invites.test.ts` pins the code/link/message contract.
- **Motion and haptics** come from `constants/motion.ts` (120/200/320/600 ms, two easings, one
  gesture spring, `HapticMoment`). No haptic on tab press, scroll, expand, collapse or refresh.
  Every animation checks `useReducedMotion()`. Celebrations use `components/CelebrationOverlay.tsx`
  except the rich PR and season screens, which stay bespoke on purpose.
- **AI consent.** `components/solo/AiConsentSheet.tsx` + `lib/aiConsent.ts` gate the corner and
  the coach assistant (Apple 5.1.2(i)). Do not add an AI feature without routing through it.
- **Purchases.** `context/RevenueCatContext.tsx` classifies failures (`classifyPurchaseError`)
  and tracks `purchase_failed`/`purchase_cancelled`; the paywall owns the success moment
  (haptic + 400 ms pulse). Products: `fitlink_athlete_monthly/annual` (client_premium),
  `fitlink_coach_elite_monthly/annual` (coach_elite). **Packages are picked by PRODUCT
  IDENTIFIER** across every offering (`lib/storePlans.ts` → context `athletePlan` /
  `coachPlan`), never by package type: on 2026-09-06 the dashboard had the coach products in
  `default`'s standard monthly/annual slots and no `coach` offering, which would have sold
  athletes the coach product. Empty offerings surface `storeStatus` on the paywalls with a
  diagnostic line (storefront country, canMakePayments, which of the four ids StoreKit
  returned) — read it before guessing. RevenueCat's public API answers what it serves the
  phone without a dashboard login: `GET https://api.revenuecat.com/v1/subscribers/<any-id>/offerings`
  with the app's public key as Bearer and `X-Platform: ios`; `GET .../subscribers/<uid>` shows
  that user's entitlements and `last_seen` (how the 2026-09-07 wrong-account purchase was found).
- **Purchase identity and activation (2026-09-07).** The RevenueCat app user id MUST equal the
  Supabase user id: `ensureIdentity()` in `context/RevenueCatContext.tsx` runs on every session
  change (logIn / logOut) and before every purchase and restore. Never call
  `Purchases.purchasePackage` without it. Activation does not wait for the webhook: after a
  purchase or restore the context calls `lib/entitlement.ts` → edge function
  `confirm-entitlement` (asks RevenueCat about the caller's own id with secret `RC_API_KEY`, the
  public SDK key works; writes `clients.premium_until` / `trainers.elite_until` forward only,
  `compute.ts` is jest-tested). The Solo corner calls it on a 402 before showing a paywall; the
  context calls it once per launch when an entitlement is active (self-heal). The webhook stays
  the only thing that REVOKES.
- **Array columns.** `trainers.certifications`, `specializations`, `training_locations` are
  `text[]`; never seed a string state from them or call string methods on them (the coach
  wizard's first step threw `certifications.trim is not a function` the moment the row
  loaded, 2026-09-07). Test fixtures must use the real row shape:
  `tests/trainerWizardSmoke.test.tsx` fails on the old code for exactly this reason.
  "Something went wrong" = the expo-router ErrorBoundary in `app/_layout.tsx` (a render
  error); it now prints the error's message in production too.
- **Alerts and screen transitions.** `context/AlertContext.tsx` is a native Modal and presents
  only after `InteractionManager.runAfterInteractions`. Never call `showAlert` for something
  that the route guard is about to react to (a sign-up that yields a session, a role change):
  presenting a modal over an in-flight `router.replace` crashed every coach sign-up on
  2026-09-07. `signUp()` returns `{ signedIn }`; show "Check your email" only when false.
  Supabase Auth email confirmation was turned ON on 2026-09-07 (user decision): sign-up
  screens must handle "no session yet" and the onboarding draft is applied at the later
  SIGNED_IN.
- **Paywall → navigation handoff.** `SoloPaywall` and `CoachElitePaywall` hide their Modal first
  and fire `onSuccess` from the Modal's `onDismiss` (Android: 350 ms delay). Never navigate from
  inside a visible Modal: on iOS it leaves the app unresponsive (the 2026-09-07 "start live
  freezes" report went through exactly that path).
- **Phantom columns.** `public.live_classes` has NO `category` / `duration_minutes` columns;
  never send them (PostgREST answers 400 `PGRST204`). `lib/schemaErrors.ts` treats PGRST204 as
  a missing column. When a write "fails 400 with no retry", check the edge logs first:
  `source = 'edge_logs'`, `log_attributes['request.path']`, `['response.status_code']`;
  function calls are `source = 'function_edge_logs'` with `['request.pathname']`.
- **Coach Elite on the client** is `hooks/useCoachElite.ts` (RevenueCat cache OR the server's
  `trainers.elite_until`), never `useRevenueCat().isCoachElite` alone. The RevenueCat init
  effect numbers its runs so a superseded signed-out run cannot overwrite the signed-in
  customer info.
- **Live broadcast go-live (2026-09-07).** `lib/streamSetup.ts` is the only path to a Mux
  stream: `requestMuxStream()` (15 s timeout, 402 → `confirmEntitlement` → retry once, never a
  placeholder key), `readStreamSecrets`/`persistStreamSecrets`, typed `StreamSetupError`
  reasons with alert copy, and Sentry breadcrumbs under category `broadcast`.
  `createLiveClass` THROWS when no stream can be made (it used to save `key_…` placeholders
  that dead-ended the studio). `app/broadcast/[id].tsx` runs a phase machine idle →
  preparing → connecting → live (only on `onPublishStarted`) → failed, with a 20 s connect
  watchdog that stops the publisher and offers retry. The RTMP publisher is iOS-only
  (`lib/liveBroadcast.ts`); HaishinKit event ordering is unverified on a device.
  **Ending:** `endLiveClass()` stops the publisher first, retries the status write with backoff,
  parks the class id (`fitlink_pending_end`) on failure; Studio's focus effect calls
  `flushPendingEnd()` and never offers "Return to broadcast" for a parked class. Leaving the
  broadcast screen while live ends the class (the native publisher unmounts with it). The
  Mux webhook (`mux-webhook`, `video.live_stream.disconnected` → ended) is the server-side net
  but Mux has NOT been configured to call it as of 2026-09-08 (zero deliveries); Studio's
  60 s abrupt-end check is what actually closed today's class. A coach account may accept a
  LIVE invite (watch only); `trainer_cannot_accept` is for coach invites.
- **App Store Connect API from this machine.** Team key `VFPH6FZDX9` (App Manager) lives at
  `credentials/AuthKey_VFPH6FZDX9.p8` (gitignored, not uploaded). Issuer
  `a49b4160-1354-49c6-a156-254e1c076801`, app 6779058450. A read-only probe script pattern
  (ES256 JWT via Node crypto, `dsaEncoding: 'ieee-p1363'`) is in the session scratchpad as
  `asc.js`; subscriptions are 6802523621/6802523894 (athlete) and 6802524311/6802524427
  (coach). As of 2026-09-07 the athlete products have NO introductory offer: trial copy in the
  app is conditional on `introPrice`, but review notes must not promise a trial until one exists.

## Editing pitfalls on this machine

- Files are CRLF. Python patch scripts must read/write with `newline=''` and normalise the
  needle with the file's own line ending. Escaped `\n` inside a Bash heredoc gets unescaped
  by the tool layer: write patch scripts with the Write tool and run them, or use the Edit tool.
- Sentry: org `fitlink-px`, project `react-native`. The `SENTRY_AUTH_TOKEN` in `.env.local` has
  only the CI scope (source maps); reading issues needs a token with `event:read`.
- Never echo the git remote URL raw (it embeds a PAT); pipe through
  `sed -E 's#https://[^@]*@#https://***@#g'`.

## Test accounts and data

- Athlete `bsar@gmail.com` (row name may differ) is the Solo test account: character Reyes,
  premium until 2027-09-04, `onboarding_path: solo`. Coach account is Victor.
- `evals/golden.json` holds 80 corner cases (20 per persona); add a case whenever a thumbs-down
  reveals a real miss.
