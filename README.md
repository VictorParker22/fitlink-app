# FitLink — The Coaching Platform

A premium multi-sport coaching platform built with Expo/React Native. Connects coaches with clients for workouts, nutrition, messaging, scheduling, health tracking, and payments — all in one app.

## Tech Stack

- **Frontend**: Expo 54 / React Native 0.81 / React 19 / TypeScript
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Payments**: Stripe Connect Express (10% platform fee)
- **Health**: Apple HealthKit / Google Health Connect
- **Builds**: EAS Build

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Start with tunnel (for device testing)
npx expo start --tunnel

# Start backend server (Supabase Edge Functions)
supabase functions serve
```

## Project Structure

```
app/              — Screens (file-based routing via Expo Router)
  (auth)/         — Login, signup, onboarding
  (tabs)/         — Coach tab screens
  (client-tabs)/  — Client tab screens
context/          — React contexts (App, Auth, Client, Theme, Network)
components/       — Reusable UI components
constants/        — Theme tokens, colors, typography
lib/              — Supabase client config
supabase/
  functions/      — Deno edge functions (payments, webhooks, notifications)
  migrations/     — SQL migrations
```

## Features

### For Coaches
- Client management & assessment
- Custom workout builder with video demos
- Diet/nutrition plan builder
- Real-time messaging
- Session scheduling
- Subscription plans & payment collection
- Earnings & payouts dashboard (Stripe Connect)
- Push notifications

### For Clients
- Active workout mode with set logging & rest timers
- Exercise video demos
- Diet plan viewer
- Health dashboard (Apple Health / Health Connect)
- Real-time messaging with coach
- Progress tracking

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_or_live_key
```

## Supabase Secrets (Edge Functions)

```bash
supabase secrets set STRIPE_SECRET=sk_test_or_live_key
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

## Deploying

```bash
# Deploy edge functions
supabase functions deploy create-subscription
supabase functions deploy create-connect-account
supabase functions deploy stripe-webhook --no-verify-jwt

# Build for production
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios
```

## Website

Landing page at [fitlink.coach](https://fitlink.coach) — Vite SPA on Vercel (separate repo at `c:\projects\fitlink`).
