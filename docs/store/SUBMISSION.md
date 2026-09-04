# FitLink store submission pack

Everything the two consoles ask for, answered from the code as it ships in
build 1.0.0 (iOS build 09338c2d on TestFlight, Android bundle d56a3ab1).
Copy from here; do not improvise in the console.

Identifiers: iOS `fitlink.app` · Android `com.fitlink.app` · version 1.0.0

Privacy policy: https://fitlink.coach/privacy · Terms: https://fitlink.coach/terms
Support: support@getfitlink.com · Privacy contact: privacy@getfitlink.com

---

## What's new (both stores, release 1.0.0)

FitLink connects athletes with verified coaches, and gives athletes training
alone an AI corner that plans their week and talks back.

- Coaches: roster, programmes, sessions, check-ins, payouts. Athletes ask to
  join you; you accept or decline. Nothing changes for an athlete until you say so.
- Athletes: your coach's plan, one session at a time, with a direct line to
  whoever set it.
- Solo: choose a voice, get a spoken daily brief from your own data, hold to
  talk, and let the corner rewrite next week from what you actually logged.
- Built for accessibility: VoiceOver and TalkBack labels everywhere, Dynamic
  Type, and Reduce Motion honoured on every screen.

Short description (Play, 80 chars max):
`Coaching, sessions and programmes in one place — or train solo with an AI corner.`

---

## Apple: App Privacy (nutrition label)

Data collected, linked to the user unless noted.

| Category | Data | Purpose | Linked | Tracking |
|---|---|---|---|---|
| Contact info | Name, email, phone | App functionality, account | Yes | No |
| Health & fitness | Fitness (workouts logged, sessions), Health (steps, heart rate, calories, weight, blood pressure, SpO2 — only when the athlete turns on health sharing) | App functionality | Yes | No |
| User content | Messages to a coach or the AI corner, photos and videos the user adds, voice recordings (hold-to-talk, transcribed on device or by the OS; audio is not stored) | App functionality | Yes | No |
| Identifiers | User ID | App functionality, analytics | Yes | No |
| Purchases | Purchase history | App functionality | Yes | No |
| Usage data | Product interaction (screen and feature events) | Analytics | Yes | No |
| Diagnostics | Crash data, performance data | App functionality | No | No |
| Contacts | Contacts (only when a coach types a name to match against their address book; never uploaded) | App functionality | No | No |

Third parties that receive data, for the "data shared" questions:
- Google Gemini: athlete first name, training context and, with health sharing on, step counts, only after the in-app consent sheet. Purpose: the AI corner and coach assistant.
- ElevenLabs: the text of a corner line, to synthesise speech. No personal identifiers.
- RevenueCat and the App Store: purchase and subscription state.
- Stripe: coach payouts and athlete payments (card data never touches the app).
- Sentry: crash and error reports (no message content).
- Layers: product analytics events with the user ID.

Answer "No" to tracking (no data is used for advertising or shared with data brokers).

Age rating: 4+ with "Medical/Treatment Information: None". The app gives
training instructions and never medical advice; the corner escalates to a
human for anything medical.

Sign in with Apple: not required. The app offers email and phone one-time
code only; no third-party sign-in is used.

App Review notes (paste into the review notes field):
```
Two roles. To review the athlete side, sign up as "I'm training" then choose
"Go solo" — this uses a subscription (sandbox). To review the coach side, sign
up as "I'm a coach". Coaches must complete Stripe identity verification before
they can be paid; a reviewer can skip payouts. The AI corner requires explicit
consent before any data reaches Google Gemini (screen "Before the corner
speaks"). Health data is read only after the athlete enables sharing on the
permissions primer and is used solely to inform their own training.
```

Subscriptions (App Store Connect, must be "Ready to Submit" before RevenueCat
returns prices):
- `fitlink_athlete_monthly`, `fitlink_athlete_annual` in group "FitLink Solo" — entitlement `client_premium`
- `fitlink_coach_elite_monthly`, `fitlink_coach_elite_annual` in group "Coach Elite" — entitlement `coach_elite`
Each needs: a localisation (display name + description), a price, a review
screenshot of the paywall, and the Paid Applications agreement signed.

---

## Google Play: Data safety form

Collection and sharing, by Play's categories:

| Data type | Collected | Shared | Required | Purpose |
|---|---|---|---|---|
| Name | Yes | With coach (in-app) | Yes | App functionality, account |
| Email address | Yes | No | Yes | Account management |
| Phone number | Yes (if phone sign-in) | No | Optional | Account management |
| Health info (steps, heart rate, calories, weight, blood pressure, SpO2 via Health Connect) | Yes, optional | With coach if the athlete turns on sharing; step counts with Google Gemini after consent | Optional | App functionality |
| Fitness info (workouts, sessions, PRs) | Yes | With coach | Yes | App functionality |
| Messages (coach chat, corner chat) | Yes | Corner messages with Google Gemini after consent | Yes | App functionality |
| Photos and videos | Optional | No | Optional | App functionality |
| Voice or sound recordings | Processed on device / by the OS recognizer only; not stored, not shared | — | Optional | App functionality |
| Contacts | Read on device to match a typed name; not collected | No | Optional | App functionality |
| Purchase history | Yes | RevenueCat | Yes | App functionality |
| App interactions | Yes | Layers (analytics) | Yes | Analytics |
| Crash logs, diagnostics | Yes | Sentry | Yes | App functionality |
| User IDs | Yes | Analytics, RevenueCat, Sentry | Yes | App functionality, analytics |

Security practices: data is encrypted in transit (TLS); users can request
deletion in-app (Profile → Delete account, which cascades through
`delete_client_account` / `delete_trainer_account`).

Health Connect declaration (Play requires it because the app reads Health
Connect data): purpose is "Fitness and wellness — to show the athlete their
own activity and, with consent, share it with their coach". The privacy
policy page already covers Health Connect.

Sensitive permissions to justify in the declaration form:
- RECORD_AUDIO: exercise video audio, live classes, hold-to-talk to the AI corner.
- CAMERA / READ_MEDIA_*: profile and exercise photos and videos.
- READ_CONTACTS: match a name a coach types to their contacts, on device only.
- POST_NOTIFICATIONS: session reminders, coach messages, check-in requests.

Content rating questionnaire: no violence, no gambling, no user-generated
public content (coach–athlete messages are private, 1:1). Rated Everyone.

Target audience: 16+ (the sign-up gate enforces 16 or older). Do not select
"designed for families".

Ads: none.

---

## Screenshots to capture on a device (both stores)

1. Athlete home with today's session (coach path).
2. Solo corner mid-reply, with the orb and the spoken line.
3. Voice choice (solo-setup) with the four characters.
4. Coach home with roster and today's sessions.
5. Programme builder / pass.
6. Messages between coach and athlete.

Use a 6.7-inch iPhone and a 6.5-inch Android frame; the store crops the rest.
