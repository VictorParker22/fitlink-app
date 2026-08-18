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
