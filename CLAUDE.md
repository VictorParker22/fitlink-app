# FitLink — working notes for Claude

Read these first, in this order:

1. `.agents/INVARIANTS.md` — rules that each exist because breaking them shipped a bug.
2. `.agents/THREAT_MODEL.md` — the trust boundaries (B1–B15), public entry points, privileged
   components, sensitive data, dependencies, irreversible actions and abuse paths (A1–A14),
   each cited to the file or database object that creates it. Read it before touching any
   table, RPC, edge function, route, bucket, deep link or vendor.
3. `.agents/AGENTS.md` — what the project is: stack, directories, edge functions, payments.
4. `.agents/DESIGN.md` — the enforceable design system (dark/lime, type, motion, imagery).
5. `docs/store/SUBMISSION.md` — App Privacy / Play data-safety answers derived from the code.

This file holds what those do not: how work actually ships here, and the
decisions and traps from the 2026-09 release push.

## Security — read before building ANYTHING that touches data, money or identity

This is a marketplace where strangers pay strangers. The anon key ships in the binary, so
**every client-side write is an attacker's write**; the only boundaries are RLS, triggers,
SECURITY DEFINER RPCs and edge functions. On 2026-09-08 a sweep found coaches could set
their own fee to 0% (org_id), athletes could put themselves on a pass, insert their own
Elite/premium row, read every pass's workouts, and any coach could claim any Solo athlete
with the service role. None of that was hard to find. Do the threat model FIRST, every time:

1. **Who can write this column, and what is it worth?** For every table a screen writes,
   dump `pg_policies` and ask what the row's OWN user gains by writing each column
   (fee, entitlement, membership, plan, price, seat, status, another user's id). Anything
   with value is server-written only: service role, a postgres-owned definer RPC, or a
   BEFORE trigger that refuses it (`guard_entitlement_columns`, `guard_enrollment_columns`,
   `guard_notification_insert`, `guard_org_billing_columns`). INSERT needs the guard as much
   as UPDATE. Column-level REVOKE does nothing while the role holds table-wide grants.
2. **Child rows inherit the parent's visibility.** A `USING (true)` SELECT on a child table
   (workout_exercises, diet_plan_meals) leaks the paid content of every parent whose id can
   be learned. Write `EXISTS (SELECT 1 FROM parent WHERE parent.id = child.parent_id)`.
3. **Money is computed on the server from server rows.** Price from `plans`, payee from
   `plans.trainer_id`, fee from `payment_split_for_trainer()`, entitlement from
   `elite_until`/`premium_until`. The app sends ids, never amounts, never a payee, never a
   flag that unlocks anything. A fee frozen into a Stripe object must be re-synced when the
   entitlement changes (`syncCoachApplicationFee`).
4. **A definer RPC is an API.** Its first lines check `auth.uid()` against the row it
   touches; it clamps every text input; it never returns another person's contact, intake
   or name unless the caller already holds a relationship to them. `REVOKE EXECUTE FROM
   anon, authenticated` on anything only triggers call. Run the Security Advisor
   (`get_advisors`) after every migration and explain every WARN.
5. **Edge functions identify the caller from the JWT** (`requireCaller`,
   `requireTrainerSelf`, `requireClientAccess`), never from the body. Webhooks verify a
   signature or a shared secret; internal functions `requireServiceRole`. A function that
   reads with the service role must filter by the caller's own id.
6. **Relationships are consent.** `clients.trainer_id` is set only by `respond_coach_request`
   / `accept_invite` / a paid pass. No "claim", "link" or "add existing athlete" path may
   attach a person to a roster without that person acting. Binding an auth user to a
   client row is `link_client_to_auth_user` (contact-verified) or the athlete's own row.
7. **Storage paths are scoped** (`storage.foldername(name)[1] = auth.uid()`), private
   buckets for anything personal, no public SELECT policy on a public bucket (it allows
   listing), no unscoped INSERT policy.
8. **Client-side inputs are hostile.** Deep links and universal links carry codes that are
   normalised to a fixed alphabet (`normalizeCode`) before use; redirects go only to
   `fitlink://` (`stripe-redirect`); user text renders in `<Text>` never as markup; URLs the
   app opens come from our own constants or `lib/safeUrl.ts`. Never trust a return URL, a
   query param or a pasted code to decide who a user is or what they own.
9. **Prove it before reporting it.** Every guard/policy change is exercised with
   `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"<uid>","role":"authenticated"}'; <write>; ROLLBACK;`
   for the attacker AND for the legitimate user. The proof files live in `supabase/security/`
   (`python supabase/security/run_audit.py supabase/security/self_grant_audit.sql`, same
   for `security_sweep.sql`); add a block for every new guard and re-run both before
   shipping a policy, trigger or RPC change. A fix that was not run against the live
   database is a hypothesis. "Noted as a follow-up" is not an outcome for a hole with money or
   personal data behind it — close it or say plainly that it is open.
10. **Keep the map current.** `.agents/THREAT_MODEL.md` is the security ledger. Anything that
   adds or moves a boundary — a new table or column with value, an RPC, an edge function, a
   route the OS can open, a bucket, a webhook, a vendor, an irreversible action — is added to
   the map in the SAME commit, with its enforcement point, and gets a proof block in
   `supabase/security/`. When a fix closes an abuse path, flip its status there with the date.
   The map's §9 is the open security backlog; work it before new features and never
   re-discover it. As of 2026-09-08 evening every code item is closed; what remains is
   operator-owned (MFA on the five vendor accounts, replacing the PAT in this repo's git
   remote, Auth CAPTCHA/rate settings). Live playback is SIGNED: `create-mux-stream` uses
   `playback_policy: ['signed']`, viewers get URLs from `mux-playback-token` (signed-in) or
   `invite-info` (guests with a live code), the RSA key lives in Vault via
   `get_platform_secret` (service role only), and `_shared/muxTokenCore.ts` is jest-proved.
   Never build a Mux URL from `mux_playback_id` in the app — use `lib/muxPlayback.ts`.
   Removing an athlete is `remove-client` → `detach_client()`; `clients_delete` no longer
   exists. The tenant-isolation review is
   `.agents/AUTHZ_REVIEW.md` (tests `supabase/security/authz_isolation.sql`): athletes read
   `trainers_public`, never `trainers` (the private row is self + org admin only); a coach
   writes only onto their own roster; live chat names come from the database; a contact
   binds an account only once verified (`contact_verified`); pushes name a recipient
   (`toTrainerId` / `toClientId`) and `send-push-notification` resolves the token.
   `REVOKE EXECUTE` must name `PUBLIC` too, or the grant survives.
   Input rules (`.agents/INPUT_REVIEW.md`, tests `supabase/security/input_validation.sql`):
   every user-text column has a `char_length` CHECK (migration 20260908080000; add one
   with every new text column); a value that reaches `.ilike()`/`.like()` goes through
   `_shared/contact.ts escapeLike`; a 500 answers with `_shared/http.ts internalError()`
   (generic sentence to the caller, real error in the log with the endpoint), never
   `err.message`; never log a request or webhook payload whole; model input is clamped
   (`clampText`/`clampStr`) and model output is clamped or dropped (`_shared/ai.ts`).
   Abuse rules (`.agents/ABUSE_REVIEW.md`, tests `supabase/security/abuse_controls.sql`):
   every paid route names who may call it (coach row, `premium_until`, `elite_until`) AND
   carries a `global` daily ceiling in its `guardRate` rule — per-account limits do not
   survive account farming; every table a user can insert into gets a `rate_limit_writes`
   trigger; anonymous RPCs call `api_rate_ok()` (per address via `request_ip()`); every
   bucket has `file_size_limit` + `allowed_mime_types`; a webhook verifies signature AND
   age. Dependencies: `npm audit --omit=dev` runs in CI (advisory) and Dependabot opens
   upgrades weekly; Expo/react-native bumps wait for a native build; esm.sh imports are
   pinned by hand (`@supabase/supabase-js@2.105.3` everywhere).

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
  `guard_entitlement_columns` BEFORE INSERT OR UPDATE trigger instead (migration
  20260908050000, the self-grant audit). Privileged = service_role / postgres-owned
  definer functions / supabase_auth_admin; everyone else: on `trainers` no
  `elite_until`, `org_id`, `stripe_*` on insert or update; on `clients` no
  `premium_until`/`solo_summary*` ever, no coach relationship columns, an athlete's own
  row may not change `plan_id`, `status`, `trial_end_date`, `stripe_customer_id`,
  `referred_by`, `notes`, an athlete's self-insert starts coachless/planless, and a coach's
  direct insert may not pre-bind another uid. `guard_enrollment_columns` keeps an athlete
  from moving `client_plan_enrollments` to another plan. `payment_split_for_trainer` and
  the roster-cap triggers waive fees/caps for an org only while `organizations.seat_status`
  is active/trialing (anyone signed in may create an org row). `lookup_client_by_contact`
  (anon, sign-up) returns only found / has_account / coach first name. Every one of these
  was proved with `set local role authenticated` dry runs; repeat that before touching them.
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
  **The programming is code, the model only chooses (2026-09-08, "make it smarter").**
  `solo-program/plan.ts` (pure, `tests/soloProgramPlan.test.ts`) decides the split from the day
  count (2–3 full body, 4 upper/lower, 5 UL+PPL, 6 PPL×2), one main lift per session by
  movement pattern (`patternOf`), sets × reps × RPE per goal and per week of a 4-week block
  (`schemeFor`: base / build / peak / deload), finishers for fat loss or a running interest,
  mobility for pain. Every slot gets ≤8 pattern-matched options (`candidatesFor`: classics
  first for strength, dumbbell/machine first for return/pain/new, ballistics out, gadget
  variants down); the model picks one per slot, names the session and writes a cue
  (`buildProgramPrompt` + Gemini `responseSchema`); `assemble()` validates every pick and
  fills gaps deterministically, so a week is written even when the model fails (`model:
  'fallback'` in the response and `[solo-program] assembled … fallback picks N` in the log).
  `workout_exercises.notes` = effort ("RPE 7 — leave 3 reps in the tank"), warm-up on the
  main lift, the cue, and a load hint from `client_workout_logs` (`loadHint`); the player
  renders it under the prescription. Block state is `clients.solo_block` (week, split, goal,
  anchors, rationale, nutrition), server-written only (`guard_entitlement_columns`); a weekly
  `adapt` moves to the next week, week 4 rolls into a fresh block; `rebuild` keeps the week.
  The corner receives it as context key `program` (`lib/soloBlock.ts describeBlock`).
- `solo-nutrition` writes a Solo athlete's meal plan into the SAME tables the Food tab reads:
  `diet_plans` with `trainer_id NULL` (nullable since 20260908110000) → `diet_plan_meals` →
  `meals` (`is_custom true, trainer_id NULL`, reachable only through the plan) + `client_diets`,
  with a training-day list and `week_structure.restVariant`. The numbers are arithmetic
  (`targets.ts targetsFor`: lb × 14–16.5 by training days, goal ×0.8/×1.08, protein 0.8–1.0
  g/lb, carbs down 20% on rest days; `tests/soloNutrition.test.ts`); the model fills them with
  foods, `cleanFood` reconciles macros, `applyRestrictions` enforces "no dairy"/vegan/gluten/
  nut/… in code, `fitToTargets` scales servings (calories ±7%, protein −10%/+35%), and a
  pantry day (`fallbackDay`) lands when the model does not. Body weight: request → metadata
  `intake_weight_lbs` (saved back) → 409 `needs_weight`, and the corner asks. Triggers:
  the corner's `NUTRITION_INTENT` ("write my meal plan", "what should I eat"), the Food
  tab's empty-state button (`solo?ask=nutrition`), or a weight reply after `needs_weight`
  (`lib/soloNutrition.ts parseStatedWeight`). Context keys: `nutrition_targets`,
  `just_built_nutrition`, `nutrition_needs_weight`, `nutrition_build_failed`.
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
- **Coach passes (Stripe, 2026-09-08).** A pass is a `plans` row (price, period). The athlete buys it
  in `app/checkout.tsx` (Apple payment sheet) via edge fn `create-subscription`, which creates a
  Stripe subscription with `transfer_data.destination` = the PLAN OWNER's connected account and
  the platform fee; the payee comes from `plans.trainer_id` on the server, never from the app.
  `stripe-webhook` (`invoice.payment_succeeded` / `payment_intent.succeeded`) calls
  `attachClientToPlan`: status active, plan_id, and `trainer_id` = the plan's coach (service role
  bypasses `guard_entitlement_columns`), so buying a pass IS joining that coach. Checkout resolves
  the plan by id and the coach from trainers_public when they are not in context (the athlete may
  be buying from a coach who is not yet theirs). Entry points: find-coach → pass, Train tab
  "Find your season" → my-pass, my-subscription tiers. Coaches must have
  `stripe_charges_enabled` (Connect onboarding) or the server refuses the charge.
  **Activation does not wait for the webhook (2026-09-08, the first live pass).** The Deno
  build of the Stripe SDK throws on the synchronous `webhooks.constructEvent`
  ("SubtleCryptoProvider cannot be used in a synchronous context"), so EVERY live delivery
  was answered 400 and the athlete who paid $1 came back to an unpaid pass, a second tap
  that said "Failed to create payment intent" (create-subscription answered
  `alreadyActive` and checkout treated a missing clientSecret as failure), and a coach with
  no revenue. Now: the webhook uses `constructEventAsync` (`tests/edgePatterns.test.ts`
  forbids the sync form); the enrolment writers live in `_shared/enrollment.ts`
  (`attachClientToPlan`, `ensurePlanEnrollment`, `activateStripeSubscription`) and are
  shared by the webhook and by `confirm-subscription`, which the app calls right after
  `presentPaymentSheet` succeeds (`lib/subscriptionConfirm.ts`, three tries) and once per
  session from ClientContext when the membership row is still `incomplete`; checkout treats
  `alreadyActive` as a success and skips the sheet. Stripe redelivers rejected events for
  three days, and `stripe_events` dedupes them, so the webhook and the confirm path may
  both run; both are idempotent.
  **A paid pass must be readable (migration 20260908120000).** The tenant sweep scoped
  `workouts_select` to assigned rows and `diet_plans_select` to `client_diets`, which also
  hid the season's own track nodes from the athlete who paid ("Loading the session
  details…" forever, empty Food tab). `my_track_ids(kind)` (SECURITY INVOKER, authenticated
  only) returns the workout/diet ids named in the caller's active or completed
  `client_plan_enrollments.track_snapshot` and in the track of the plan they are attached
  to; both SELECT policies add `id IN (SELECT my_track_ids(...))`, and child tables follow
  through their parent-scoped EXISTS. `ensureTrackDiet` (in `_shared/enrollment.ts`, called
  by the webhook and confirm-subscription) assigns the track's first diet node through
  `client_diets` so the Food tab shows it. Proofs: `supabase/security/pass_content.sql`.
  **Proof files must use `-- @@ <title>` blocks**: `run_audit.py` splits on that marker and a
  file with no such blocks prints ALL AS EXPECTED having run nothing (solo_block.sql was
  written with `-- title:` on 2026-09-08 and "passed" until it was re-marked).
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
- **One Apple ID, one FitLink account at a time (2026-09-08).** A second account on the same
  phone hits `PRODUCT_ALREADY_PURCHASED` when it tries to buy a plan the Apple ID already owns.
  `purchasePackage` then restores instead of failing (`shouldAutoRestore`): RevenueCat's
  restore behaviour is "transfer to new app user id", so the plan moves to the signed-in
  account, `confirm-entitlement` grants it, and the `TRANSFER` webhook re-reads BOTH sides
  from RevenueCat (`syncFromRevenueCat`) so the old account loses it and any coach fee
  follows. Do not change RevenueCat's restore behaviour to "keep with original" without
  changing this flow; do not auto-restore on sign-in (shared phones would silently move
  plans between people).
- **AI generation profile (2026-09-08).** `gemini-2.5-flash` thinks by default and a JSON
  build with a catalogue in the prompt blew the 20 s ceiling every time (`solo-program`
  ai_timeout ×3 in an hour). Every builder now uses `FAST_JSON` / `NO_THINKING` from
  `_shared/ai.ts` (thinkingBudget 0), `BUILD_TIMEOUT_MS` 45 s for whole-plan builds and
  `REPLY_TIMEOUT_MS` 30 s for single turns, a `maxOutputTokens` cap, and `solo-program`
  samples 140 exercises instead of 230 (`sample.ts` keeps every muscle-group floor).
  `[solo-program] generation ms` in the function logs is the number to watch. Since the
  plan.ts rewrite the prompt is ~10 k chars of options, not a catalogue, and a 5-day week
  generates in ~8 s; a model failure no longer fails the build (see Edge functions).
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
- **Coach payouts (2026-09-08, canvas "FitLink Payouts").** ONE screen, `app/payouts.tsx`,
  and one library, `lib/payouts.ts` (+ pure `lib/payoutsState.ts`, hook `hooks/usePayouts.ts`,
  panel `components/payouts/PayoutsPanel.tsx`). Every entry routes there: home setup card,
  Settings, Earnings "Connect my bank", plan-detail's collect gate; the sign-up wizard's
  Payouts stop embeds the same panel. Stripe ALWAYS opens as
  `WebBrowser.openAuthSessionAsync(url, 'fitlink://stripe-return')` and returns as a resolved
  promise; after ANY outcome the app calls `connect-account-link` with `mode: 'status'` (refreshes
  the trainer flags, reports `due` + `pendingVerification`, mints no link). `Linking.openURL`
  for Stripe is banned: the return arrived as a deep link the router could not place
  ("unmatched route" after "Return to FitLink"). `app/stripe-return.tsx`/`stripe-refresh.tsx`
  are the safety net and redirect a coach to `/payouts`. States: not_connected / in_progress /
  connected, where connected means `stripe_charges_enabled` (details_submitted alone still
  cannot be charged and create-subscription refuses it). `payoutsReady(trainer)` is the one
  check; never read the flags directly on a screen. `PayoutSetupModal` (image-based, three
  steps) is deleted.
- **Elite fee (5%) is server-truth, and it follows the coach.** `payment_split_for_trainer()`
  returns 500 bps while `trainers.elite_until > now()` (org seat 0, else `platform_config`).
  `elite_until`, `org_id` and the three `stripe_*` columns are refused to authenticated
  UPDATEs by `guard_entitlement_columns` (migration 20260908040000); only the service role and
  postgres-owned definer functions write them, and `elite_until` comes only from RevenueCat
  (`revenuecat-webhook`, `confirm-entitlement` reading RC for the caller's own uid). Stripe
  freezes `application_fee_percent` into a subscription at creation, so
  `_shared/money.ts syncCoachApplicationFee()` rewrites it on every live subscription of a
  coach whenever the entitlement changes (both writers call it) and `stripe-webhook`
  `invoice.created` re-checks before a renewal finalizes (the Stripe destination must send
  that event). Pure rules in `_shared/fees.ts` (tests/fees.test.ts).
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
- `evals/golden.json` holds 85 corner cases (20 per persona + 5 for the block/nutrition
  keys); add a case whenever a thumbs-down reveals a real miss. `npm run eval:program`
  (`tests/evals/programModel.test.ts`, needs `GEMINI_API_KEY`) sends four real intakes
  through the builder's prompt and asserts the model picked legal options and wrote cues;
  both evals run in `.github/workflows/evals.yml`.
- End-to-end runs of the Solo builders as the test account: sign it in through an admin
  magic link (`auth.admin.generateLink` + `verifyOtp`, service role from
  `npx supabase projects api-keys -o json` kept in the session scratchpad, never in the
  repo or in chat) and call the functions with that JWT; the 2026-09-08 runs are in the
  function logs (`source = 'function_logs'` in the MCP log query).
