/**
 * coachMatch — rank marketplace coaches against an athlete's own intake.
 *
 * Honesty contract:
 * - A match reason is built ONLY from a real textual overlap between the
 *   athlete's stored goal (clients.assessment_data.intake) and something the
 *   coach actually wrote — their specialization, a published pass's name or
 *   description, or their bio. No overlap → reason is null; the coach can
 *   still rank on real signal (has published passes) but nothing is claimed.
 * - No ratings, no availability, no compatibility percentages — none of that
 *   data exists here, so none of it is derived.
 *
 * Handles both intake shapes that exist in the wild:
 * - (auth)/client-onboarding: { goal, experience, days_per_week, ... }
 *   goals like "Get stronger on the big lifts"
 * - (client-tabs)/find-coach: { goal, days, time, style, source }
 *   goals like "Get strong in the gym"
 */

export interface IntakeLike {
  goal?: string | null;
  experience?: string | null;
  days_per_week?: number | null;
  days?: string | null;
  time?: string | null;
  style?: string | null;
  [key: string]: any;
}

export interface CoachMatchResult {
  trainer: any;
  plans: any[];
  /** Honest match reason, or null when no real overlap exists. */
  reason: string | null;
  score: number;
}

// Keywords per goal label — covers both intake wizards' goal vocabularies.
// Matching is purely textual against what the coach has actually written.
const GOAL_KEYWORDS: Record<string, string[]> = {
  // find-coach (marketplace) intake
  'Get strong in the gym': ['strength', 'powerlifting', 'barbell', 'lifting', 'weightlifting', 'hypertrophy', 'muscle'],
  'Lose fat and keep muscle': ['fat loss', 'weight loss', 'nutrition', 'body composition', 'cutting', 'diet'],
  'Train for an event': ['endurance', 'running', 'marathon', 'triathlon', 'race', 'competition', 'event', 'sport'],
  'Come back from an injury': ['rehab', 'injury', 'physio', 'recovery', 'mobility', 'corrective'],
  'Start from nothing': ['beginner', 'foundation', 'fundamentals', 'general fitness', 'getting started'],
  // (auth)/client-onboarding intake
  'Get stronger on the big lifts': ['strength', 'powerlifting', 'barbell', 'lifting', 'weightlifting', 'hypertrophy', 'muscle'],
  'Lose fat, keep the strength I have': ['fat loss', 'weight loss', 'nutrition', 'body composition', 'cutting', 'diet'],
  'Get back into it after a break': ['beginner', 'foundation', 'fundamentals', 'general fitness', 'getting started', 'habit'],
  'Train around something that hurts': ['rehab', 'injury', 'physio', 'recovery', 'mobility', 'corrective'],
};

function findKeyword(haystack: string, keywords: string[]): string | null {
  const hay = haystack.toLowerCase();
  for (const k of keywords) {
    if (hay.includes(k)) return k;
  }
  return null;
}

/**
 * Score one coach against the intake. Reason priority: their specialization
 * line (their own words, verbatim), then a published pass whose name or
 * description overlaps, then a bio mention.
 */
export function matchCoach(trainer: any, plans: any[], intake?: IntakeLike | null): CoachMatchResult {
  let score = 0;
  let reason: string | null = null;

  const keywords = intake?.goal ? GOAL_KEYWORDS[intake.goal] || [] : [];

  if (keywords.length > 0) {
    // 1. Specialization — the coach's own headline, quoted as written.
    const specHit = trainer.specialization ? findKeyword(String(trainer.specialization), keywords) : null;
    if (specHit) {
      score += 3;
      reason = `${trainer.specialization} — matches your goal`;
    }

    // 2. Published passes — a real pass whose name/description overlaps.
    const matchedPlan = plans.find((p) =>
      findKeyword(`${p?.name || ''} ${p?.description || ''}`, keywords)
    );
    if (matchedPlan) {
      score += 2;
      if (!reason) reason = `Runs ${matchedPlan.name} — fits your goal`;
    }

    // 3. Bio — a plain textual mention.
    const bioHit = !specHit && trainer.bio ? findKeyword(String(trainer.bio), keywords) : null;
    if (bioHit) {
      score += 1;
      if (!reason) reason = `Bio mentions ${bioHit}`;
    }
  }

  // Real signal even without a goal overlap: they have published passes.
  if (plans.length > 0) score += 1;

  return { trainer, plans, reason, score };
}

/**
 * Rank all coaches. With no usable intake, ordering falls back to real
 * signal only (published passes first) and every reason is null — the
 * caller must not frame that list as "recommended for you".
 */
export function matchCoaches(
  trainers: any[],
  plansByTrainer: Map<string, any[]>,
  intake?: IntakeLike | null
): CoachMatchResult[] {
  return (trainers || [])
    .map((t) => matchCoach(t, plansByTrainer.get(t.id) || [], intake))
    .sort((a, b) => b.score - a.score || b.plans.length - a.plans.length);
}
