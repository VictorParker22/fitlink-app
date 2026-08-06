# FitLink — Project Rules & Context

## Project Overview

**FitLink — The Coaching Platform**
A premium multi-sport coaching platform connecting coaches with clients. Built with Expo/React Native, Supabase backend, Stripe Connect payments.

- **Domain**: fitlink.coach (Vite app on Vercel)
- **App Bundle ID**: fitlink.app
- **Revenue Model**: 10% transaction fee on all client payments via Stripe Connect Express

## Architecture

| Component | Stack |
|-----------|-------|
| Mobile App | Expo 54 / React Native 0.81 / React 19 / TypeScript |
| Navigation | Expo Router (file-based) |
| Database | Supabase (PostgreSQL + Auth + Storage + RLS + Edge Functions) |
| Payments | Stripe Connect Express (10% application_fee) |
| Push Notifications | Expo Push (iOS) / FCM (Android) |
| Health Data | Apple HealthKit / Google Health Connect |
| Video | expo-video (replaced expo-av) |
| Builds | EAS Build (dev / preview / production) |
| Website | Vite SPA on Vercel at fitlink.coach |

## Key Directories

```
app/
  (auth)/          — Login, client login, onboarding, trainer wizard
  (tabs)/          — Coach tabs: Dashboard, Clients, Programs, Messages, Diets
  (client-tabs)/   — Client tabs: Home, Workouts, Diet, Health, Messages
  workout/         — Workout detail [id].tsx
  client/          — Client detail [id].tsx, assessment
  session/         — Session detail [id].tsx
  chat/            — Chat [id].tsx
  diet/            — Diet detail [id].tsx
  earnings.tsx     — Earnings & Payouts dashboard
  subscriptions.tsx — Plan management
  checkout.tsx     — Payment flow
  create-workout.tsx — Workout builder
  create-diet.tsx  — Diet plan builder
  create-plan.tsx  — Subscription plan builder
context/
  AppContext.tsx    — Trainer, clients, plans, sessions, workouts, diets
  AuthContext.tsx   — Auth state, user, role detection
  ClientContext.tsx — Client-side state
  ThemeContext.tsx  — Dark/light theme
  NetworkContext.tsx — Offline detection
constants/
  theme.ts         — Spacing, FontFamily, FontSize, Radius, Colors (dark/light)
components/
  Card.tsx, Button.tsx, Alert.tsx, etc.
lib/
  supabase.ts      — Supabase client (URL: qcmtaskhyhwzyoegtfpw.supabase.co)
supabase/
  functions/       — Edge functions (Deno)
    create-subscription/    — Subscription creation with 10% fee + Stripe Connect
    cancel-subscription/    — Graceful cancellation (cancel_at_period_end)
    create-payment-intent/  — One-time payments with 10% fee
    create-setup-intent/    — Save card without charging
    create-connect-account/ — Stripe Connect Express onboarding
    connect-account-link/   — Generate onboarding/dashboard links
    stripe-webhook/         — Payment + account.updated events
    send-push-notification/ — Push notifications
  migrations/      — SQL migrations
```

## User Types & Auth

| Role | Auth Flow | Tab Layout |
|------|-----------|------------|
| Coach/Trainer | Phone OTP or Email/Password | (tabs)/ — 5 tabs |
| Client | Email/password + trainer pairing code | (client-tabs)/ — 5 tabs |

## Business Model

- **Coach cost**: Free to use (no SaaS subscription, no per-client fees)
- **Revenue**: 10% transaction fee on all client payments via Stripe Connect
- **Positioning**: Premium tier (Equinox-level), not budget
- **Example**: Client pays $100/mo → Coach gets $90 → FitLink gets $10

## Strategic Decisions (Locked In)

- **Brand**: Keep "FitLink" — tagline "The Coaching Platform"
- **First expansion sport**: Golf (high-value clients, tech-savvy coaches)
- **Content model**: Both pre-built sport libraries + coach-created content
- **Group classes**: Not a priority right now
- **Free tier**: No — premium positioning
- **Distribution**: App Store (no Firebase app distribution, no Samsung store)

## Expansion Roadmap

### Phase 1: Multi-Sport Foundation
- Sport/specialty selector during coach onboarding
- Configurable terminology ("workout" → "session/lesson/practice")
- Flexible exercise fields (beyond sets/reps: distance, duration, etc.)
- Pre-built exercise libraries per sport (fitness + golf first)

### Phase 2: Golf-Specific Features
- Video annotation (draw on video frames)
- Side-by-side video comparison
- Golf drill library
- Practice plan templates

### Phase 3: AI & Scale
- AI swing/form analysis (skeleton tracking)
- Smart programming (auto-generate plans)
- Additional sport modules (tennis, yoga, swimming, martial arts)

## Competitive Advantages (vs Trainerize, TrueCoach, CoachNow, Mindbody)

1. **All-in-one**: Workouts + nutrition + messaging + scheduling + payments + health in ONE app
2. **Free for coaches**: No per-client pricing (Trainerize charges per client)
3. **Premium UI**: Not "bloated" or "clunky" (top complaint about Trainerize/Mindbody)
4. **Cross-platform**: iOS + Android (TrueCoach has no Android client app)
5. **Fast set logging**: Active workout mode with inline inputs (not "too many taps")
6. **Transparent pricing**: Flat 10% fee, no hidden fees (TrueCoach added "stealth" 5% fee)
7. **No contracts**: Cancel anytime (Mindbody has predatory contracts)
8. **No data hostage**: Plan to add full data export (Mindbody charges for exports)
9. **Real support**: Personal human support, not AI chatbots (Mindbody complaint)
10. **Working video**: expo-video with streaming uploads (CoachNow videos fail/black screen)

## Priority Features to Build (from Competitor Research)

### Tier 1 — Quick Wins
- Autosave in workout builder (Trainerize's #1 complaint)
- Offline workout caching (universal complaint)
- Data export CSV/PDF (beats Mindbody "data hostage")
- Undo button in workout builder

### Tier 2 — Differentiators
- Video annotation (draw on video) — critical for golf expansion
- Side-by-side video comparison
- Coach-created exercise libraries
- Smart notifications (motivating, not shaming)

### Tier 3 — Long-Term Moat
- AI form/swing analysis
- White-label / coach branding
- Multi-language support

## Technical Rules

- Use `expo-video` (NOT expo-av — deprecated in SDK 54)
- Use `FormData` for video uploads (NOT base64 — causes freezes)
- Wrap console.log/warn in `__DEV__` checks for production
- Never hardcode API keys — use env vars
- Gate push notification token logs behind `__DEV__`
- All Stripe keys come from env vars or Supabase secrets
- Edge functions use `STRIPE_SECRET` env var (Supabase secrets)
- Privacy policy hosted at fitlink.coach/privacy

## Market Data (for reference)

- Total addressable coaches: ~1.7M worldwide
- Annual coaching transactions: $42-86B
- FitLink TAM at 10%: $4.2-8.6B
- Closest multi-sport competitor: CoachNow (~$1M revenue, $2.8M valuation)
- Biggest single-sport: Trainerize (400K coaches, $186M payments processed)
- Golf instruction market: $4.8B (2025), growing 6.7% CAGR
- Online yoga market: $4.7B (2025), growing 7.8% CAGR
- AI coaching market: $4B (2024), growing 22% CAGR


## React Native & Supabase Quirks

- **Supabase Storage Uploads**: Never use etch(uri).blob() to upload local images in React Native/Expo to Supabase Storage, as it is extremely flaky and often results in 0-byte corrupt files. Always request base64 from expo-image-picker (ase64: true) and use decode from ase64-arraybuffer to manually decode and stream the data.
- **Image Layout Quirks**: When placing <Image> components inside containers with lignItems: 'center', using width: undefined and height: undefined with bsoluteFillObject can cause the image to collapse to 0x0 and appear as a black/invisible box. Always explicitly define width: '100%', height: '100%' and position: 'absolute' to ensure it fills the container perfectly.
