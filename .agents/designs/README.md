# Imported designs — Fitlink Coach Dashboard Redesign

Source: claude.ai/design project `fde10f41-c91d-4572-a8f8-8f9349cac698`
("Fitlink Coach Dashboard Redesign"), imported 2026-08-18. Design canvas
options 27a-29b, saved as static HTML for implementation reference.

These are DESIGN REFERENCE, not shipping code. They are plain HTML/CSS built
against the "Organic" design-system bundle in the design tool — not React
Native, not the app's `constants/coachDesign.ts` tokens. Treat them as the
intended layout and information architecture; the implementation must be
rebuilt in the target platform against the real design system.

## What each option is

| File | Screen | Belongs to |
|---|---|---|
| `27a.html` | **Health** — "is it up, is it growing": API p95, error rate, crash-free sessions, downloads today, payment success, push delivery, 24h request curve, release rollout marker | Internal ops dashboard |
| `27b.html` | **Attack signals** — ranked by blast radius not recency; card testing, credential stuffing, auto-actions with their cost, "needs decision" vs "auto-mitigated" | Internal ops dashboard |
| `28a.html` | **Today in the browser** — the coach's queue, one athlete, and the reply, on one screen; keyboard-driven (J/K move, Enter open, R reply) | Coach web app |
| `28b.html` | **Pass builder** — eight weeks visible at once, versioned drafts (v3 DRAFT while 6 athletes are live on v2), blast radius still first | Coach web app |
| `29a.html` | **Org overview** — seats used vs paid, athletes across the org, athlete revenue, org share %, coach table sorted by revenue with role and last-active | Enterprise |
| `29b.html` | **Billing** — $39 per seat per month, next invoice, proration explained in words, invoice history, card on file | Enterprise |

## The design intent — turn-level, and it governs everything below

I initially imported only the option screens and missed this. It is the more
important half: the options show a layout, these state the PRINCIPLE the layout
serves. Implementation follows these, not the pixels.

### Turn 27 — internal ops
> The room nobody outside the company sees: a status center for us. Two jobs only — is the product healthy (crashes, latency, downloads, payments) and is someone attacking it. Signals rank by blast radius, every automatic action is stated together with who it may have hurt, and the pager owner is named on screen.

*What follows it:* The recommended action pairs mitigation with repair — block the attacker and free the three real people caught in it. Downloads and release health live on one screen because "is it growing" and "is it broken" get asked in the same breath.

### Turn 28 — coach web app
> The coach web app. Not a bigger phone — the browser earns its place with the two things a phone can't do: peripheral vision (queue, athlete and thread on one screen) and keyboard speed through twenty check-ins. No feature exists here that doesn't exist on native; parity is a promise, not a roadmap.

*What follows it:* Same objects, same rules as native — 28a is the coach's morning at desk speed, 28b is the one job (program design) that genuinely wants a big screen.

### Turn 29 — enterprise for gyms
> Enterprise for gyms. A gym buys seats, not features — every coach on a seat runs the same app as an independent. The org sees rosters, revenue and seats; it never sees inside a coaching thread. Money is stated as a split the owner sets, not a fee buried in terms.

*What follows it:* Seats bill flat; athlete money flows through the split above. The org's ceiling is deliberately low — rosters and money, never threads (the promise from 25d's visibility toggles extends here).

### Why these three sentences matter more than the mockups

- **"never sees inside a coaching thread"** (29) is the same privacy line the
  shipped org model already enforces — business visibility, not surveillance.
  The design and the schema agree independently, which is the strongest signal
  either is right. `enterprise_02_org_visibility.sql` grants org admins the
  roster, sessions, plans and payments and deliberately withholds messages,
  health snapshots, progress photos and check-ins.
- **"a split the owner sets, not a fee buried in terms"** (29) is a product
  decision the current code cannot express: the platform fee is a hardcoded
  10% in five places. A visible, owner-set split needs one server-side source
  of truth first, and `organizations` needs a column to hold it.
- **"No feature exists here that doesn't exist on native; parity is a promise,
  not a roadmap"** (28) settles the web architecture argument: it must be the
  same codebase, not a second app. Re-enable `web` in platforms and shim —
  never a parallel React implementation, which is exactly what rotted into the
  45 orphaned files in `C:\projectsitlink`.
- **"every automatic action is stated together with who it may have hurt"**
  (27) is the honesty rule applied to security tooling: an auto-mitigation
  that blocks an attacker will also catch real people, and the screen must say
  so. It pairs mitigation with repair — block the ASN AND free the three real
  customers caught in it.

## How these line up with what exists

They map onto the three initiatives in `.agents/PLATFORM_PLAN.md`, and two of
them already have their foundation built:

- **29a / 29b (enterprise)** — the org schema shipped 2026-08-18
  (`enterprise_01_org_schema.sql`, `enterprise_02_org_visibility.sql`).
  `organizations.seat_limit`, `organization_members.role`, and the
  owner/admin visibility policies are exactly what 29a's coach table needs.
  NOTE the designs assume things the schema does not yet have: an org
  revenue-share percentage ("Your org share - 15%"), and per-coach
  last-active. Both need adding before 29a can render real numbers.
- **27a / 27b (ops)** — NOT buildable yet. There is no audit log, no
  auth-failure stream, no rate-limit counters, and no crash/download
  ingestion. Every number on these two screens would be invented today.
  Emitting the telemetry comes first; see PLATFORM_PLAN.md.
- **28a / 28b (coach web)** — depends on re-enabling `web` in
  `app.json` platforms and working the shim list in PLATFORM_PLAN.md.

## The rule that applies to all six

Real data or omitted (INVARIANTS §4). These mockups are full of plausible
figures — "$18,440", "99.62% crash-free", "1,842 downloads", "212 declined
cards". Every one of those is design filler. A screen ships a number only
once a real source exists for it; until then the row is omitted, not
zero-filled and not estimated.
