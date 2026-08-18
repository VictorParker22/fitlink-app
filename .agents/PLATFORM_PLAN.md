# FitLink platform plan — web app, enterprise, monitoring

Three initiatives, one dependency chain. Written 2026-08-18.

---

## The finding that reshapes initiative 1

**The coach web app is not a rewrite. It is the app you already have, with
`web` put back in `platforms`.**

`C:\projects\fitlink` contains an earlier React web app — ~45 files
(`DashboardPage`, `ClientsPage`, a whole `client/` portal). All of it is
**orphaned**: `main.jsx` mounts `App.jsx`, which is a marketing landing page
with no router and zero Supabase calls. Rebuilding the coach app there would
mean a second data layer, a second set of RLS assumptions, and permanent drift
— which is exactly how those 45 files became dead the first time.

The native repo is already most of the way to running in a browser:

| Piece | State |
|---|---|
| `react-native-web` + `react-dom` | already dependencies |
| `app.json` web block (`output: static`) | already present |
| `lib/stripe-provider.web.tsx` | already exists |
| `lib/supabase.ts` auth storage | **already branches to localStorage on web** |
| Expo Router | web-capable |
| `platforms: android, ios` | **the only thing excluding web** |

### What actually needs work (the honest list)

Already guarded, no work:
- `react-native-purchases` — `isRevenueCatAvailable` is false off-native
- `react-native-bootsplash` — try/catch guarded
- `expo-camera-rtmp-publisher` — already iOS-only via `lib/liveBroadcast.ts`

Needs a web path or an explicit gate:
- `@react-native-community/datetimepicker` -> native date input
- `react-native-health` / `expo-health-connect` -> no browser equivalent; gate
- `expo-notifications` -> web push is a different API; gate first, add later
- `lottie-react-native`, `react-native-gifted-charts` -> verify under RN-web
- `@stripe/stripe-react-native` -> the `.web.tsx` shim is a passthrough; real
  web card entry needs Stripe.js

**Coach Elite on web:** RevenueCat is native-only, so a coach cannot buy Elite
in a browser. Either send them to the app to subscribe, or add a Stripe web
checkout for Elite. Do NOT silently show a dead paywall.

**Security note for web:** tokens live in localStorage, which is XSS-readable
(unlike the native Keychain). The audit found no WebView, no eval, no
dangerouslySetInnerHTML anywhere — the posture is good and must stay that way.
Ship a strict CSP with the web build.

---

## Dependency order — and why it is not the obvious one

**The enterprise data model must land BEFORE the web app's data layer settles.**

Every RLS policy hardened in the security campaign assumes one tenancy
boundary: `trainers.id IS auth.uid()`. A gym owner seeing five coaches'
athletes has **no representation in that schema at all**. Adding it means
revisiting ~40 policies, the storage path scoping, and the `trainers_public`
view.

Doing that now costs almost nothing — 12 trainers, 17 clients, 0 payments.
Doing it after launch means migrating live data while rewriting the policies
that protect it. This is the highest-leverage sequencing decision in the plan.

Recommended order: **enterprise schema -> web app -> dashboard.**

---

## Enterprise for gyms

Schema (new):
- `organizations` — name, billing contact, seat count, Stripe customer/sub id
- `organization_members` — user_id, org_id, role in (owner, admin, coach)
- `trainers.org_id` — nullable; NULL means an independent coach, which is the
  entire current user base and must keep working untouched

Policy strategy: a SECURITY DEFINER helper `is_org_member(org_id, roles[])`
called from policies rather than inlining joins — so the tenancy rule lives in
one place and can be audited as one thing. Existing coach-scoped policies gain
an OR branch for org membership; independent coaches are unaffected.

**Billing is a different rail, not a bigger number.** Today: Stripe Connect,
coach charges athlete, platform takes 10%. Enterprise: the gym pays FitLink a
seat-based SaaS subscription, and the 10% marketplace fee does not apply to
athletes the gym already pays for. The 10% is currently hardcoded in five
places (three edge functions, two client mirrors) — that needs a single
server-side source of truth before a second rail exists.

**Consent, not just access.** A gym owner must not silently gain visibility of
a coach's existing athletes. Joining an org is an action the coach takes.
Phase G already blocks a coach claiming an athlete's account; the same
principle applies upward.

## Coach web app

Re-enable web in platforms, work the shim list, ship behind fitlink.coach.
Same repo, same data layer, same security fixes — one codebase, no drift.
Delete the orphaned React app in `C:\projects\fitlink` so nobody revives it
against the new RLS and gets silent failures. Keep that repo for the landing
page (and `public/privacy.html`, which is already there).

**Cheap win available immediately:** `fitlink.coach/delete-account` on the
existing Vercel deploy closes the public account-deletion URL Google Play
requires, which is currently an open release blocker.

## Monitoring — two dashboards, not one

Conflating these would be a mistake:

**Internal (yours):** attack signals, app health, downloads. Requires telemetry
that **does not exist yet** — no audit log, no auth-failure stream, no
rate-limit counters. Step one is emitting events, not drawing charts:
- `audit_events` table — security-relevant writes, auth failures, policy denials
- App Store Connect API + Play Developer API for downloads and crashes
- Supabase health via its own metrics endpoint

**Gym-owner (product):** org-scoped coach activity, athlete retention, revenue.
Same rendering, completely different data scope and audience. Part of the
enterprise offering, and dependent on the org model.

---

## Recommended first move

The org schema. It is small now, it unblocks both other initiatives, and every
week it waits it gets more expensive. The web app is the visible win, but
building it against a schema that is about to change means building it twice.
