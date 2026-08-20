# Gym mode — research findings and the two-topology proposal

Written 2026-08-21 after the user's observation that our org offering
"sells gyms a pass to pamper coaches, not a business service." Two
web-research sweeps (six gym platforms' data models; gym/trainer
economics) confirmed it. Sources live in the research agents' reports;
the load-bearing facts are restated here.

## The verdict: our org model is the marketplace model in a gym costume

Every incumbent gym platform (PushPress, Wodify, Zen Planner, Mindbody,
Glofox, TeamUp) agrees on six things, without exception:

1. **The business owns the member.** The member record — profile,
   billing, attendance, waivers — is a row in the GYM's account. When a
   coach leaves they are deactivated as staff; members and history stay.
   Glofox won't even let a trainer edit a member profile.
2. **The coach is staff on a permission ladder** (schedule + rosters +
   member read; never billing, financials, settings), not a peer party.
3. **The coach is a payroll line, not a revenue party.** Member pays
   gym; gym pays coach — commission tiers (30–60% of session to the
   trainer at big-box), or the trainer pays the GYM (rent $1–3K/mo, or
   30–50% revenue share). Money flows both directions and the platform
   models it as payroll/pay-rates.
4. **Assignment is business-initiated**; member self-booking exists but
   is gated by gym-sold session packs against gym-approved providers.
5. **The gym controls the commercial stack**: recurring memberships,
   schedule/capacity, check-in, lead CRM, retention dashboards,
   waivers, POS.
6. **The platform charges the business** (flat per location or tiered
   by member count); staff seats are free everywhere.

The economics research adds: gym contracts assign the client
relationship and data to the business by default; non-solicits are the
standard tool; a trainer leaving with clients is the gym owner's named
nightmare. Revenue is 50–88% memberships; PT is the 10–35% high-margin
upsell. Owners manage by monthly churn (3–5% healthy), visits/week
(2.5–3.5, the best churn predictor), the 90-day cliff, and LTV.

**Against that, our current org model promises the exact inversions:**
coach owns roster and leaves with 100% of it (enterprise_01, structural
trigger); gym is a read-only seat-buyer; athlete picks the coach; money
lands in the coach's Stripe with a gym-share bps slice. We built the
FreeAgent world and priced it like the Franchise world.

## Why NOT to simply flip the model

The marketplace promises are FitLink's spine and its differentiator for
the (larger, faster-growing) solo-coach segment: 329K US trainer
businesses vs ~41K facilities; 86% of six-figure coaches train online.
"Your athletes are yours" is the moat for solo coaches AND poison for
gym sales. One model cannot serve both. Two topologies can.

## The proposal: two org topologies, declared at org creation

`organizations.topology`: `'collective' | 'house'` (naming TBD).

**COLLECTIVE (what we built, renamed honestly).** Independent coaches
sharing a roof/brand. Coach owns roster, gym sees business figures,
coach leaves with athletes. Real market: co-working gyms, rent-a-floor
facilities, coach collectives — the 1099-renting-space world, which the
economics research shows is huge. Our existing schema serves this
segment AS IS; only the marketing needs to stop calling it "for gyms"
generically.

**HOUSE (the actual gym product — new build).** The inversions:
- Members belong to the org: `clients.org_id` primary, coach assignment
  is a mutable field the org controls. Coach deactivation reassigns,
  never removes.
- Coach = staff role ladder (owner / admin / front-desk / coach)
  mapping onto our existing org_role plus two tiers.
- Money: org's Stripe account receives memberships and session packs;
  coach compensation modeled as pay rates/commission splits with a
  TRANSPARENT payroll view for the coach (trainer-side commission
  opacity is the #1 staff complaint industry-wide — transparency is a
  wedge, not a feature).
- The org sells memberships (recurring) and session packs; athlete
  booking is gated by pack credits against org-approved coaches.
- Retention dashboard on the metrics owners actually use: monthly
  churn, visits/week distribution, 90-day cohort survival, LTV. We
  already have check-in/session data to compute visits/week honestly.
- Privacy line that survives: coaching THREAD content stays
  coach+athlete (our differentiator; no incumbent even has real
  coaching threads). The org sees attendance, billing, assignment —
  never conversation bodies. This is defensible in HOUSE mode because
  it mirrors employment reality: a gym reads the schedule, not the
  coach's texts.

## The wedge (why FitLink wins a crowded market)

Incumbents' loudest complaints, per research: hidden-fee stacking
(Mindbody $139 base → $1,000+/mo real), vanished support, BAD MEMBER
APPS, commission opacity for trainers. FitLink's athlete app is
category-best, our pricing doctrine is all-in honesty, and transparent
split math wins the trainers who currently take clients off-books.
Pitch: "The gym platform whose member app members actually open —
priced with no hidden line items."

## Cost honesty / sequencing

HOUSE mode is weeks of schema + product work (org Stripe accounts,
packs, payroll math, retention analytics, booking gates) and must NOT
enter the Shipaton critical path. Sequence: ship v1 with COLLECTIVE
only (rename the current org offering truthfully), build HOUSE post-
launch as the enterprise expansion. The gyms marketing page currently
brags "0% of a leaving coach's roster kept" — correct for COLLECTIVE,
anti-sales for HOUSE; the page should be re-aimed at collectives until
HOUSE exists (do not advertise HOUSE before it is real).

## Open decisions (the user's)

1. Green-light the two-topology direction?
2. Naming: collective/house, studio/gym, partners/staff?
3. HOUSE payment custody: org Stripe Connect account (parallel to
   coach accounts) — assumed yes, needs confirmation.
4. Re-aim the gyms page at collectives now, or leave until decided?
