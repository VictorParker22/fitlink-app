# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required reading

This repo maintains its real engineering rules in dedicated docs. Read them before writing code — every rule in them exists because breaking it shipped a real bug:

- **`.agents/INVARIANTS.md`** — what will bite you (id-space confusion, Supabase error handling, phantom columns, safe areas, iOS-only APIs, migration hazards). Read this first.
- **`.agents/AGENTS.md`** — what the project is: architecture, business model, locked-in strategic decisions, RN/Supabase quirks.
- **`.agents/DESIGN.md`** — the enforceable design system (for any UI work).
- **`SOP.md`** — process checklist: verify screens/schema/functions exist before planning; run `npx tsc --noEmit` after every major phase.

## Commands

```bash
npm install                # postinstall runs patch-package; husky installs the pre-commit hook
npx expo start             # dev server (also: npm run ios / android / web)
npm run check              # tsc --noEmit + invariant scan — run before committing
npm run lint               # expo lint (eslint)
npm run verify             # invariant checks only (scripts/verify.js; --staged for the index)
npm run secrets            # secret scan across tracked files
```

There is no test suite. `npm run check` (typecheck + `scripts/verify.js`) is the validation gate; a husky pre-commit hook runs the secret scan, staged invariant scan, and typecheck automatically. Suppress a reviewed line with `// invariant-ok: <reason>` (or `// secret-ok: <reason>`).

Supabase (CLI is linked):

```bash
npx supabase db query --linked -f supabase/migrations/<file>.sql   # apply one migration
npx supabase functions deploy <name>                               # deploy an edge function (no Docker)
```

Beware: hand-authored migrations without a `<timestamp>_name.sql` prefix are **skipped by `db push`**; apply them explicitly. Never re-run `20260728000006` / `20260728000009` (they contain a known-broken RLS policy). The root-level `supabase_*.sql` files are legacy one-off migrations.

## Architecture

Two-sided coaching marketplace (coach ↔ client) built on Expo 54 / React Native 0.81 / React 19 / TypeScript, with Supabase (Postgres + Auth + Storage + RLS + Edge Functions) as the backend and Stripe Connect Express for payments (10% platform fee).

**Routing** — Expo Router, file-based, in `app/`. `app/_layout.tsx` is a root Stack; the role decides the tab layout:

- `app/(auth)/` — login, onboarding, trainer wizard. Coaches auth via phone OTP or email; clients via email + trainer pairing code.
- `app/(tabs)/` — coach experience (Dashboard, Clients, Programs, Messages, Diets).
- `app/(client-tabs)/` — client experience (Home, Workouts, Diet, Health, Messages).
- Everything else in `app/` (e.g. `workout/[id]`, `chat/[id]`, `create-*`, `earnings`) is pushed over the root Stack and has **no tab bar** (see INVARIANTS §6 for the safe-area consequences — both tab bars are absolutely positioned).

**State** — React contexts in `context/`: `AuthContext` (session + role detection), `AppContext` (coach-side data: clients, plans, sessions, workouts, diets), `ClientContext` (client-side state), plus Theme, Network/offline, Health, RevenueCat, Workout, Alert (in-app alerts — not OS `Alert`), and Layers.

**Platform-split modules** — `lib/` uses filename suffixes for divergent implementations: `stripe-checkout.ts` / `.native.ts` / `.web.tsx`, `stripe-provider.*`, `revenuecat-sdk.*`, `DateTimePicker.*`. Follow that pattern for anything with per-platform behavior. `lib/supabase.ts` is the client; domain logic that papers over schema quirks lives here too (`workoutCounts.ts`, `clientGoals.ts` — use these instead of the phantom columns documented in INVARIANTS §3).

**Backend** — `supabase/functions/` holds ~30 Deno edge functions: Stripe (subscriptions, Connect onboarding, webhooks), RevenueCat webhook, Mux live streaming, AI generation (workouts/diets/exercises, coach-assistant), and push notifications. `firebase-functions/` is a separate Node function used only for Android FCM push (payloads must be strictly stringified `data: Record<string, string>`); iOS goes through Expo Push.

## Non-negotiables (details in .agents/)

- Supabase calls **resolve with `{ error }`, they don't throw** — always check the error; never wrap a bare `await supabase...` in try/catch.
- Three id spaces: `trainers.id` **is** `auth.uid()`; `clients.auth_user_id` is the athlete's auth id; `clients.id` is not an auth id. Check which one a table's `client_id` holds before writing any query or RLS policy.
- Verify columns against the live schema, not the TypeScript interfaces (phantom columns exist).
- Design system: tokens from `constants/coachDesign.ts` only, fixed dark, one accent (`#C6F24E`), Ionicons only, sentence case, no emoji in UI strings, 44pt touch targets via `hitSlop`, decorative motion gated behind `lib/useReducedMotion.ts`.
- Real data or omitted — never render placeholders, invented metrics, or success states before the write resolves.
- Use `expo-video` (not deprecated `expo-av`), `FormData` for video uploads, base64 + `base64-arraybuffer` for image uploads to Supabase Storage (never `fetch(uri).blob()`).
