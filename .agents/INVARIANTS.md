# FitLink — Invariants

**Read this before writing code. Every rule below exists because breaking it shipped a real bug.**

`AGENTS.md` describes what the project *is*. This file describes what will *bite you*. Each entry names the failure it caused so you can recognise the shape of it elsewhere.

---

## 1. Identity: three different ids, routinely confused

| Concept | Column | Equals |
|---|---|---|
| Coach's auth id | `trainers.id` | **IS** `auth.uid()` |
| Athlete's auth id | `clients.auth_user_id` | `auth.uid()` |
| Athlete's row id | `clients.id` | **NOT** an auth id |

Tables using an **auth** id in `client_id`: `class_completions`, `class_favorites`.
Tables using **`clients.id`** in `client_id`: `client_workout_logs`, `client_habits`, `client_meal_logs`, `client_checkins`, `client_plan_enrollments`, `gym_visits`.

**What this broke:** the enrollment RLS policy compared `client_plan_enrollments.client_id` to `auth.uid()`, so **no athlete could ever read their own enrollment** — the entire season experience stayed dark. `delete_trainer_account()` matched on a non-existent `trainers.auth_user_id`, so coach account deletion failed 100% of the time (an App Store 5.1.1(v) violation). Check the id space before writing any policy or query.

## 2. Supabase writes RESOLVE with `{ error }` — they do not throw

```ts
// WRONG — the catch can never fire, failures are invisible
try { await supabase.from('x').insert(row); } catch { /* dead code */ }

// RIGHT
const { error } = await supabase.from('x').insert(row);
if (error) { /* handle honestly */ }
```

Also applies to `.rpc()`, `supabase.auth.updateUser()`, and storage calls.

**What this broke, repeatedly:** class completions (every one failed — coach analytics read zero), class ratings (never stored), live-class scheduling (always failed), athlete intake (never saved for anyone), coach onboarding metadata (wizard repeated forever), a failed account deletion that still signed the user out, and a "Your coach replied" push sent when the reply was never stored.

**Corollary:** a write targeting a column that does not exist fails with `42703` and vanishes. Verify column names against the live schema, not against the TypeScript interface — see §3.

## 3. Phantom columns — the interface lies

These are declared in TypeScript (or were) but **do not exist** in the database:

- `clients.completed_workouts` — every reader showed 0 forever, which silently flagged *every* athlete as "at risk". Use `lib/workoutCounts.ts`.
- `clients.goals` — write-only; the real data lives in `assessment_data.fitness_goals` / `assessment_data.intake.goal`. Use `lib/clientGoals.ts`. The coach's goals editor prefilled from the phantom, so it opened blank and **saving wiped the athlete's real answers**.
- `live_classes.category`, `live_classes.duration_minutes` — on `classes`, not `live_classes`.

**Rule:** before writing a column, confirm it exists. Dump the schema:

```bash
npx supabase db query --linked "select table_name || ': ' || string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_schema='public' group by table_name order by table_name;"
```

## 4. Real data or omitted

If a number cannot be sourced, **do not render it**. No placeholder, no zero, no "coming soon", no estimate presented as fact.

This is not stylistic — fabricated content is an App Store 2.1 rejection, and third-party brands in mock data (this repo shipped Equinox/SoulCycle names and real instructors' names) risk 4.1/5.2 and a trademark complaint.

Deleted for violating this: a 0–100 "readiness score" from invented weights, an "industry-standard 60%" trial-conversion benchmark, "+50 XP per workout" with no XP surface, a fake `12 joining` viewer count, `calories = minutes × 6`, "Your PR is likely between" from a feel multiplier, and ~9,500 lines of fictional Programs/Collections/Articles.

**Corollary — never claim an action you did not take.** No "Sent!" from a `finally` block, no success state before the write resolves, no push notification announcing something that failed.

## 5. Native modals

- **Never navigate while a native `Modal` is visible.** Dismiss, wait ~300 ms, then navigate. Two visible `Modal`s at once freezes iOS.
- Modals and `absoluteFill` overlays **inherit no safe area** — they must supply their own insets.
- Android requires `onRequestClose` on every `Modal`, or the back button does nothing and traps the user.

## 6. Safe areas and the floating tab bars

Both tab bars are `position: absolute` and **render over `href: null` screens too**.

| Bar | Height |
|---|---|
| Athlete (`(client-tabs)/_layout`) | `Math.max(insets.bottom, 14) + 55` |
| Coach (`(tabs)/_layout`) | `Math.max(insets.bottom, 12) + 80` |

Scroll content on a tab screen: `insets.bottom + 130`.

**Pushed routes have NO tab bar.** `app/_layout.tsx` is a root Stack and `(tabs)` is one screen in it, so everything pushed over it (settings, create-*, class/, workout/, session/, …) needs home-indicator clearance only — usually `insets.bottom + 24`.

**Never double-count:** if a `SafeAreaView` already applies `edges={['bottom']}`, do not also add `insets.bottom` inside it. That produced a visible dead gap in messages and 198 pt of dead space in the class player.

## 7. iOS-only APIs that silently do nothing on Android

- `Alert.prompt` — renders **nothing**. Coach account deletion dead-ended (a Play policy violation).
- `SafeAreaView` imported from `react-native` (not `react-native-safe-area-context`) — a no-op, so headers sat under the Android status bar.
- `presentationStyle="pageSheet"` — ignored; the Modal is full-screen and needs its own status-bar inset.
- `accessibilityLiveRegion` — Android only; on iOS use `AccessibilityInfo.announceForAccessibility`.
- `KeyboardAvoidingView behavior="padding"` (and `"height"`) — correct on iOS, wrong on Android where it double-compensates against `adjustResize`. Use `Platform.OS === 'ios' ? 'padding' : undefined`.
- **Live broadcasting is iOS-only** (`expo-camera-rtmp-publisher` has no Android view). See `lib/liveBroadcast.ts` — never sell or paywall it on Android.

## 8. Design system

`constants/coachDesign.ts` only. Fixed dark, **ONE** lime accent (`#C6F24E`); `warning`/`danger` for genuine status only. Sentence case. No emoji in UI strings. Multi-hue palettes have been deleted twice — do not reintroduce per-category colour.

Contrast is enforced at 4.5:1. If you derive a colour at runtime (e.g. `lib/mealColor.ts` from a photo), you must verify the result with real WCAG maths and fall back when it cannot pass.

All decorative motion gates behind `lib/useReducedMotion.ts`. Interactive controls reach 44×44 pt — expand `hitSlop`, do not enlarge circles (a circle is `width === height === 2 × borderRadius`; scaling one breaks it).

## 9. Preview before commit

Nothing time-committing or state-committing starts on a bare tap. One tap to look, a second explicit tap to commit. Reversible toggles (habit ticks, meal logs, water) stay one-tap.

Entering a workout opens `WorkoutPreview`; only "Start session" starts the timer. `viewOnly` nodes never advance `track_position`.

## 10. Migrations and deploys

- The CLI **is** linked. Apply one file: `npx supabase db query --linked -f supabase/migrations/<file>.sql`
- Hand-authored migrations lack a `<timestamp>_name.sql` prefix, so **`db push` skips them entirely**.
- Grep every migration for `drop table|truncate|delete from` before running it.
- Edge Functions deploy without Docker: `npx supabase functions deploy <name>`.
- `20260728000006` / `20260728000009` still contain the OLD broken enrollment RLS policy — **never re-run them**.

## 11. Before you commit

A husky `pre-commit` hook runs this automatically — it is versioned in `.husky/`, so a fresh clone gets it from `npm install`. To run it by hand:

```bash
npm run check             # tsc --noEmit && verify
npm run verify            # invariant checks only
npm run secrets           # secret scan across every tracked file
```

The hook, in order:

1. **`scripts/scan-secrets.js`** — the only unrecoverable mistake here. A credential is in the object store the moment it is committed and public the moment it is pushed; deleting it in a later commit does nothing. **Rotate at the source instead.** It also blocks files that must never be committed: `google-services.json`, `.env*`, signing material.
2. **`scripts/verify.js --staged`** — reads the *index*, not the working tree, so it checks exactly what is about to land.
3. **`npx tsc --noEmit`** — only when a `.ts`/`.tsx` is staged (~11s).

`verify.js` greps for the failure patterns above: third-party brand names, phantom columns, `Alert.prompt`, RN-core `SafeAreaView`, unconditional `behavior="padding"`, and `try {` wrapped directly around a bare `await supabase`. It is a smoke alarm, not a proof — it catches the shapes that have shipped bugs before.

Suppress a reviewed line with a trailing `// invariant-ok: <reason>` (or `// secret-ok: <reason>`). `git commit --no-verify` skips the lot, which is the right call for WIP on a branch and the wrong call on `master`.

---

## 12. A readiness flag must never sit behind an unrelated permission prompt

**The bug.** `AuthContext.handleSession` ended with `setLoading(false)`, placed
*after* `await registerForPushNotificationsAsync()`. `AuthGuard` renders `null`
while `loading` is true, so the whole navigation Stack was gated on a
notification-permission decision. When that promise did not settle, a fully
signed-in coach sat on the splash screen forever — no error, no route, no way
forward. It looked like a font problem, a routing problem, and a Metro problem
before it turned out to be none of those.

**The rule.** When a flag means "X is ready", resolve it the instant X is
actually ready, and detach everything else with `.then/.catch`. Whether push
notifications work is not part of whether you are logged in.

**How to spot it.** In any `async` initialiser, look at what sits between the
last piece of real state being set and the `setReady(false→true)` call. Every
`await` in that gap is something that can hang your entire app. Permission
prompts (`requestPermissionsAsync`, geolocation, camera) are the worst of them:
on web they can simply never settle, and on native they wait on a human.

**Why a grep cannot check this.** The order of statements in an async function
is not a pattern — it is a dependency claim, and only reading the function
tells you whether the claim is true.
