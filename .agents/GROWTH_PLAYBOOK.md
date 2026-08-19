# FitLink growth playbook

Adapted from Jurre's Gotcha writeup (7M views / 32k users, organic). His
playbook is sound; what follows is the translation, because copying a
consumer toy's plan onto a two-sided coaching platform without translating
it would fail quietly. Every section says what transfers, what doesn't, and
what FitLink does instead.

---

## 1. The one sentence

Gotcha: "Pokémon Go, but for real life." The test is whether a stranger can
repeat it to a friend after hearing it once.

FitLink's, chosen deliberately per audience — do not blend them:

- **Coaches (the buyer):** "Coaches keep 90%." Already the hero of the
  site. It plugs into a frame every coach carries: Trainerize/TrueCoach
  charge $99+/mo whether you earn or not.
- **Athletes (the reach):** "Your coach lives in your pocket."
- **TOF video hook (the anchor frame):** "Gym apps charge your coach rent.
  This one takes a cut only when they get paid." Disbelief anchor — the
  "wait, that's real?" reaction the article names.

## 2. The psychology, validated elsewhere

The behaviours FitLink's loop rides are already proven in other forms:

- **Progress reveal** — PR moments, before/after culture. FitTok's entire
  economy runs on it.
- **Being seen by a person** — the coach's reply. Duolingo streaks prove
  people crave an entity noticing their consistency; a HUMAN noticing is
  strictly stronger.
- **The income reveal** — "how much I made this month as a ___" is a
  proven genre. Coach-side content slots straight into it.

## 3. The wow moment — where it actually lives

Gotcha's wow is scan → suspense → rarity reveal. FitLink's equivalents,
ranked by shareability:

1. **The PR moment (athlete).** A set logged heavier than every set before
   it. The app already detects PRs (session complete, t12). The reveal
   sequence — log → beat pause → "185 → 200. New best." — is our pack
   opening. **Product gap: there is no share card.** The single
   highest-leverage pre-launch build in this document: a share button on
   the PR/session-complete screen that renders a branded image (lift, new
   number, delta, FitLink mark, dark+lime). One tap → story-sized PNG.
   That is the organic loop: athlete shares PR → their circle sees the
   brand → their coach gets asked about it.
2. **The money moment (coach).** First payout landing. "Stripe: you
   received $240 · FitLink fee $24" is a screenshot coaches will post
   unprompted, because income proof is currency on coach-tok.
3. **The nudge moment (retention story, BOF).** "Jonas has gone quiet —
   12 days." One button. For talking-head content: "this feature saved a
   client I'd have lost."

## 4. Design as the edge

Already the operating doctrine (coachDesign.ts, one accent, no slop). The
site pass proved the point. Keep the bar: every share card and every video
frame uses the app's own design system, so brand recognition compounds.

## 5–6. Content anchors and what the algorithm rewards

The two anchors that fit us:

- **Disbelief (coach TOF):** "Your coaching app charges you $99/month.
  Even in the months you earn $0." → cut to the calculator dragging →
  "$720 vs $701. And ours is $0 in a bad month."
- **Progress (athlete TOF):** raw phone-camera PR attempt → the app's PR
  reveal → the share card. First frame is the barbell, not the app.

Rules from the article that hold verbatim: first second decides
everything; watch-time and shares over likes; the reveal IS the video.

## 7. Facebook auto-crosspost

Zero-cost, on by default. FitLink's coach demographic (30–55, small
business owners) skews MORE Facebook than Gotcha's audience did. This is
free reach into the exact buyer.

## 8. Repeat winners

Same hook, different lift / different coach / different sound. A PR reveal
format never wears out because the number is always new. Income-reveal
format refreshes monthly by construction.

## 9. TOF vs BOF

- **TOF:** PR reveals, the disbelief fee comparison, "rate my client's
  squat" formats. High reach, low intent — fine.
- **BOF (profile + talking heads):** the founder story (still missing —
  see site audit), feature walkthroughs (nudge, blast-radius edit,
  seasons), build-in-public updates. Shipaton itself is BOF content:
  "we're racing a hackathon deadline to launch" is a story people follow.
- Never blend them in one video; the article is right about why.

## 10. Comments do the selling

Don't name the app in TOF captions; let "what app is this?" farm
distribution, answer with auto-DM once volume justifies it (openreply is
open-source; evaluate AFTER there is volume, not before — wiring auto-DM
at zero followers is procrastination dressed as work).

---

## What this playbook changes about the build queue

1. **PR share card** (native app) — the missing viral loop. Build before
   launch: session-complete + PR screens get a share action rendering a
   branded story-size image. No backend needed; render client-side.
2. **Payout share moment** (coach side) — tasteful "first payout" card,
   post-RevenueCat/Stripe polish. Income proof content writes itself.
3. Everything else in this doc is filming and posting discipline, not
   code. The founder decides when to point a camera at themselves; no
   commit can do it for them.

## What does NOT transfer from Gotcha

- Gotcha converts viewers to users in one tap because it's free + instant.
  FitLink's coach onboarding is a considered purchase — expect coach
  conversion to run through BOF + the site, not straight from a reel.
- Gotcha's loop is solo; FitLink's athlete needs a coach for full value.
  Athlete-side TOF therefore sells the COACH on the idea indirectly
  ("my coach uses this") — that's the actual funnel, and it's slower but
  compounding.
