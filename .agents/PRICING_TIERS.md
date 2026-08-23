# Free vs Elite — the packaging doctrine (2026-08-22)

The founder's brief: "everything free + only broadcasting behind Elite is
an invitation to cheat — but we have to stay competitive and lure coaches
in." The answer is the classic shape: **free until it works, paid when it
scales.** Nothing a coach needs to START is gated; everything that grows
with their success is.

## The wall

| | Free | Elite ($29.99/mo · $249/yr) |
|---|---|---|
| Athletes | **5 active** | Unlimited |
| Platform fee | 10% | **5%** |
| Seasons, passes, payments, scheduling, messaging, check-ins, library, VOD class sales | ✔ all of it | ✔ |
| Live broadcasting (Studio) | — | ✔ |
| AI coach assistant | — | ✔ |
| Elite badge | — | ✔ |

Why these four gates and no others:

- **Roster cap (5)** is the conversion engine. A coach with 6 paying
  athletes is, by definition, making money on FitLink — $29.99 is noise
  next to their revenue, and the paywall arrives exactly at the moment of
  proven value. Competitors charge from athlete #1 (Trainerize's free
  tier is 1 client); 5 free is genuinely the most generous door in the
  category.
- **The 5% fee** makes Elite self-funding for any real book: at $600/mo
  of athlete revenue the fee savings alone pay for Elite. This is the
  "lure" — Elite isn't a tax, it's a raise.
- **AI assistant** has per-use COGS (Gemini inference) — it can't be free.
- **Broadcasting** has per-minute COGS (Mux).
- Everything with network effects (selling passes/classes, messaging)
  stays free — 10% of GMV is our revenue; gating GMV would starve us.

## Why multi-accounting doesn't beat the wall

Splitting a roster across free accounts fragments the coach's OWN
business: separate Stripe Connect accounts (each with KYC), separate
payout ledgers, athletes split across two apps, seasons/library
duplicated by hand, and the fee stays 10% on every dollar. The cheat
costs more than $29.99/mo in pure friction — the cap doesn't need
device-fingerprinting to hold.

## Enforcement map (client UX is never the security boundary)

| Gate | Friendly wall (client) | Real wall (server) |
|---|---|---|
| 5% fee | earnings/paywall copy | `payment_split_for_trainer()` reads `trainers.elite_until` |
| Roster cap | add-client soft wall → paywall | `trg_roster_cap` trigger on clients INSERT |
| AI assistant | coach-home gate → paywall | `coach-assistant` returns 402 unless elite |
| Broadcasting | studio.tsx gates → paywall | (Mux credential function — TODO if abuse appears) |

`trainers.elite_until` is written ONLY by the `revenuecat-webhook` edge
function (RevenueCat → signed webhook → service role). Column-level
REVOKE strips authenticated UPDATE on it. The client's RevenueCat
entitlement is UX, not truth.

## Grandfathering / safety

- The roster trigger blocks only NEW inserts past 5 — existing rosters
  (and org-seat coaches, who are exempt) never lose an athlete.
- A lapsed Elite keeps every athlete they added; they just can't add a
  7th until they resubscribe. Fee returns to 10% at expiry (+3-day
  billing-retry grace baked into the webhook).

## Athlete side: FitLink Solo (added 2026-08-23)

`client_premium` ($19.99/mo · $149.99/yr, 7-day trials — real ASC
products) now has its content: **Solo mode**, the AI corner for
athletes without a coach. Positioning rules (non-negotiable):

- Never called a "coach" — it's "your corner" / Solo. Human coaching
  stays the premium of the product story.
- Every AI message grounds in the athlete's REAL data; the guardrailed
  persona prompts live server-side in `solo-corner` (402s non-premium —
  `clients.premium_until`, written only by revenuecat-webhook).
- "Prefer a human? Find a coach" is visible inside the mode — Solo
  FEEDS the marketplace (graduation dossier), never competes with it.
  Athletes with a coach never see Solo entries.
- Four characters (Reyes/Imani/Dane/Sol — lib/soloCharacters.ts), two
  male/two female voices, all labeled AI, abstract marks only. A
  character changes delivery, never the brain.
- Voice (ElevenLabs) is v2 — no dead mic/play buttons shipped in v1.
- Solo chat (`solo_messages`) is PRIVATE to the athlete: no trainer
  read policy, ever. A hired coach gets derived stats, not transcripts.
- Deferred to v2: solo season auto-generation and the graduation
  screen (needs solo seasons to complete).

## User-side setup still owed (RevenueCat dashboard)

1. Products/offerings/entitlements per lib/revenuecat.ts header.
2. Webhook: URL `https://qcmtaskhyhwzyoegtfpw.supabase.co/functions/v1/revenuecat-webhook`,
   header `Authorization: Bearer <secret>`, and
   `npx supabase secrets set RC_WEBHOOK_SECRET=<same secret>`.
3. Android RC key (`goog_…`) into lib/revenuecat.ts.
