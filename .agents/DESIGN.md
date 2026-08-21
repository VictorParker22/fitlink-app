# FitLink design system — the enforceable version

This file exists so that AI-generated UI cannot drift. Every agent and
session doing UI work follows it; where a rule is grep-able it belongs in
scripts/verify.js eventually. It was written after auditing the codebase
against the "vibe-coded tells" checklist (2026-08-20) — the audit numbers
below are the baseline to improve on, not guesses.

## What we already pass (do not break)

- **One icon library.** 117 imports, all Ionicons, zero strays. Any PR
  importing MaterialIcons/Feather/FontAwesome is wrong by definition.
- **Haptics.** 69 files use expo-haptics. The bar: meaningful actions get
  ONE notification, never a burst (see PRCelebrationModal for the rule).
- **One accent.** #C6F24E is the only accent. There is no second accent,
  and no purple-to-blue gradient will ever enter this codebase.
- **Sentence case, no emoji in UI.** Long-standing, holds.
- **Safe areas + hitSlop.** SafeAreaView/insets used throughout; small
  controls carry hitSlop to reach 44pt (SessionSetRow is the reference).

## The system

### Type
- Headings: **Space Grotesk** (600, 700). Body: **Epilogue** (400, 500,
  600, 700). Numbers-as-data: **JetBrains Mono 500** — sparingly.
- Epilogue-ExtraBold is loaded but used by ZERO files → remove from
  useFonts. Every unused weight is startup cost on a platform where font
  loading has already hung release builds once.
- **Tabular numerals on anything that ticks or counts** — timers, money,
  reps, streaks: `fontVariant: ['tabular-nums']`. Audit found only 2
  files doing this; every counter added since is wrong until it does.

### Color
- **Tokens only, from constants/coachDesign.ts.** No raw hex in app/ or
  components/. Audit baseline: 172 hardcoded hexes across 47 files —
  including near-duplicate dark surfaces (#1E211D ×26, #2E322B ×12,
  #21241F ×9) that are exactly the "six shades of gray" drift. When a
  needed color has no token, ADD the token, then use it.
- Migration is opportunistic: touching a file for any reason means
  replacing its raw hexes in the same commit.

### Shape
- **Radius scale, five stops, nothing else:**
  `2` (bars/tracks) · `12` (controls: buttons-in-cards, inputs, chips
  that aren't pills) · `16` (cards, list rows) · `24` (sheets, modals,
  hero cards) · `999` (pills, avatars).
  Audit baseline: 14+ distinct radii in use (incl. 3, 6, 10, 14, 17, 18,
  20, 22). New code uses the scale; migrations are opportunistic.
- **`borderCurve: 'continuous'` accompanies every borderRadius on iOS
  surfaces** (it is a no-op on Android — safe everywhere). This is the
  squircle: the single cheapest "native, not webview" tell. Baseline: 0
  usages. New/touched styles must include it.

### Spacing
- Base unit 4. Legal paddings/margins/gaps: 4, 8, 12, 16, 20, 24, 32,
  40. An arbitrary 18 or 26 in spacing (not radius) is a smell.

### Motion & feedback
- Every touchable reacts: activeOpacity, a pressed style, or a haptic.
  A dead-feeling control reads as a broken control.
- Reduce Motion is law: every loop/burst checks useReducedMotion (the
  PR modal and splash are the references).

## Imagery (added 2026-08-21 — the "speak with visuals" pass)

The app was functionality-first and text-dense; the visual layer was
built and left on the shelf. The shelf: six purpose-shot card images
(`assets/images/card-*.jpg`), `session-bg`/`milestone-bg`/`auth-bg`,
muscle-group emblems (`utils/workoutEmblems.ts` + `assets/emblems/`),
ExerciseDB gif/thumb helpers (`lib/exercisedb.ts`), food imagery
(`lib/foodImages.ts`), muscle maps (`lib/muscles.ts`). USE THESE FIRST
— never add a new stock photo when a purpose-shot asset exists.

Rules:
- **Text over an image always sits on a scrim.** Standard treatment:
  `expo-linear-gradient` from `rgba(16,18,16,0)` → `rgba(16,18,16,0.88)`
  toward the text edge, or a flat `rgba(16,18,16,0.55)` veil for
  full-card labels. These two rgba forms are the ONLY sanctioned raw
  colors (they are `CoachColors.bg` with alpha). Body text on image
  keeps ≥4.5:1 — when in doubt, darken the scrim, never shrink the text.
- **Images are content-shaped, not wallpaper.** A card slit shows the
  thing the card does (create workout → barbell shot); a workout row
  shows its muscle-group emblem or the exercise's first-frame thumb; a
  meal shows its food. Decorative-only full-screen backgrounds are the
  exception (auth, milestone moments), never behind dense UI.
- **Lists get thumbnails, never GIFs** (`getStaticThumbUrl`); detail
  views may animate. `expo-image` with `contentFit="cover"`, a
  `transition`, and `recyclingKey` inside FlashList/FlatList.
- **Card imagery obeys the shape system**: same radius stop as the card
  it lives in, `borderCurve: 'continuous'`, `overflow: 'hidden'` on the
  clipping container.
- **No fabricated social proof in imagery** — no stock "clients", no
  fake coach headshots. People appear only as real avatars users
  uploaded, or in clearly aspirational training photography.
- **Emblems are the identity of a workout.** `getWorkoutEmblem(id,
  muscleGroups)` is deterministic — the same workout always wears the
  same badge, so athletes recognise "leg day" at a glance.

## Funnel-order polish priority (where design effort goes)

1. **App icon + store screenshots** — convert before the app is ever
   opened. Screenshots are ad creative: one benefit per frame, caption
   on top, in-brand (dark #101210 + lime).
2. **Onboarding + paywall** — the money screens. Paywall numerals
   tabular, terms honest, zero drift from this file.
3. **First 10 seconds** — splash → dashboard/welcome. (Splash saga
   resolved 2026-08-19; keep its fail-open watchdogs.)
4. **Everything else.** The settings screen does not need to be
   gorgeous. Polish in funnel order, not evenly.

## What we deliberately reject from the standard advice

- **"Use SF Pro in-app."** Our brand type IS the product's face across
  app, site and share cards; the marketing site already ships it.
  Retreating to system font would erase the one visual asset that makes
  FitLink recognisable in a screenshot. We accept the cost (font
  loading is capped at 900ms with a system-font fail-open — a wrong
  typeface beats a dead app) and keep the brand.
- **"Dark mode is a vibe-coded tell."** Ours is a designed, committed
  dark — single accent, warm greys, no glowing borders. The tell is
  defaulted dark, not chosen dark.

## Weekly 20-minute audit (the tell list)

Run the greps at the top of this file's history commit, or eyeball:
fonts (no new weights), spacing (on the scale), colors (no new hex),
radius (five stops), icons (Ionicons only), states (everything reacts),
numerals (tabular where counting), curves (continuous where rounded).
