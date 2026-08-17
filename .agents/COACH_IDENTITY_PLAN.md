# Coach identity — the imagery plan

**What the research actually found** (joinladder.com, App Store listing, 2026 reviews):
Ladder's "lifelike" quality is not exercise pictures and not stock lifestyle shots.
It is **coach-identity photography**. Every team card is a coach's portrait with the
program name in bold caps over it (DEFINE — Coach Maia; PROJECT ALPHA — Coach Sam).
The coach's face carries the card; text only explains the training style. Around
that they layer *presence*: a weekly pep-talk video, a daily post in team chat, a
post-workout selfie wall. The product feels alive because a person is visibly
running it.

**Why this maps better to FitLink than to anyone else:** Ladder must manufacture
coach identity — they hire the coaches and shoot the photography. FitLink's coaches
are real people the athlete already pays. We do not need a photo shoot; we need the
surfaces to *carry* the coach instead of describing them.

**The doctrine still holds.** Real data or omitted: the only imagery allowed is what
the coach or athlete actually uploaded. No stock photography, ever — a stock hero on
a coach card is a fabricated credential. Every surface below renders its photo only
when one exists and collapses to today's text layout when it does not.

---

## Phase 1 — Foundation: the pixels can exist (DONE)

Schema + storage so coach identity imagery has somewhere to live:

- `trainers.cover_url` — the coach's hero photo (them coaching, their gym, their
  banner). Distinct from `avatar_url` (the 34pt face in chat rows).
- `plans.cover_url` — a pass's own card image, chosen by the coach per program,
  Ladder-team-card style.
- Storage bucket `coach-media` (public read, owner-scoped write — tighter than the
  class buckets: path must start with the uploader's uid).
- Coach profile: "Edit cover photo" upload beside the existing avatar flow.

## Phase 2 — The pass wears the coach (DONE)

The Ladder team card, in our marketplace model. Where pass cards render
(find-coach matches, my-pass hero, pass detail pre-purchase, coach's own passes
list): cover photo as the card ground with a dark scrim, pass name oversized over
it, coach name + avatar beneath. Fallback order: `plans.cover_url` →
`trainers.cover_url` → today's text card. Never a placeholder image.

## Phase 3 — Presence: the coach is visibly here (DONE — welcome video still optional/deferred)

Ladder's daily-video loop, scaled to a marketplace coach's real time budget:
- Coach profile (athlete-facing) gets the cover as a header backdrop; bio and
  credentials sit over it.
- "From your coach" surfaces already wear the real avatar (shipped with the
  filmstrip commit). Extend to Copilot rows and the thread header.
- Optional, later: coach can pin a short welcome video to a pass (bucket already
  supports video); shows once on enrollment, never autoplays mid-session.

## Phase 4 — Attribution analytics (DONE — reactivated omitted: not derivable, see components/coach/PassPerformance.tsx)

Of the two structural findings (attribution vs squad wall), **attribution is the
one to build first**: it is coach-side revenue proof — acquired / retained /
reactivated per pass, in dollars — the exact report Ladder pays coaches on. It
answers "what am I getting for the 10%" with numbers, uses only data we already
have (enrollments, payments, lapse dates), and needs no moderation story. The
squad selfie wall is deferred: UGC images demand reporting/blocking flows
(App Store 1.2) that are not RC-scope.

## Phase 5 — Squad wall (deferred, post-RC)

Team-visible completions already exist (`squad_events`). Photos come only after a
report/block flow exists.
