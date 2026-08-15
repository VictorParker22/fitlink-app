import { StrengthSetLog, SetFeel } from '../context/WorkoutContext';

/**
 * Suggested next load for a strength exercise, derived ONLY from the athlete's
 * real logged history for that exercise. No history → no suggestion.
 *
 * Grounding: meta-analyses on autoregulation (RPE/RIR-based load adjustment)
 * show it works as a layer on top of structured programming, not a
 * replacement — and subjective ratings are often overestimated, so the
 * adjustments here are deliberately conservative:
 *   felt easy   → +2.5% (low end of the +2.5–5% band used by
 *                 evidence-based apps), at minimum one plate increment
 *   felt right  → repeat the weight
 *   grind       → hold the weight
 *   failed rep  → −5%
 */

export interface LoadSuggestion {
  suggestedWeight: number; // kg, rounded to a real plate increment
  basis: string;           // the honest reason, e.g. "80 felt easy last time"
}

// The whole strength flow is kg-native (inputs, ±2.5 steppers). The smallest
// practical jump in a kg gym is a pair of 1.25 plates = 2.5 kg total, which
// also matches the in-session stepper.
export const KG_INCREMENT = 2.5;

function roundToIncrement(x: number, inc: number): number {
  // Two-decimal fix so 82.499999 doesn't leak into the UI.
  return Math.round((Math.round(x / inc) * inc) * 100) / 100;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

// Ties break toward the harder feel — conservative by design, since athletes
// tend to under-report difficulty session to session.
const FEEL_SEVERITY: SetFeel[] = ['easy', 'right', 'grind', 'failed'];

function predominantFeel(sets: StrengthSetLog[]): SetFeel | null {
  const counts: Partial<Record<SetFeel, number>> = {};
  for (const s of sets) {
    if (s.feel) counts[s.feel] = (counts[s.feel] ?? 0) + 1;
  }
  let winner: SetFeel | null = null;
  let best = 0;
  for (const feel of FEEL_SEVERITY) {
    const c = counts[feel] ?? 0;
    if (c >= best && c > 0) { winner = feel; best = c; } // >= : harder feel wins ties
  }
  return winner;
}

/**
 * @param lastSessionSets the sets this athlete logged for ONE exercise in
 *        their most recent session that touched it (real weights only).
 * @returns a suggestion with its stated basis, or null when there is no
 *          real prior data to base one on.
 */
export function suggestNextLoad(
  lastSessionSets: StrengthSetLog[] | null | undefined,
  increment: number = KG_INCREMENT,
): LoadSuggestion | null {
  const real = (lastSessionSets ?? []).filter(
    s => Number.isFinite(s.weight) && s.weight > 0,
  );
  if (real.length === 0) return null;

  const top = real.reduce((max, s) => Math.max(max, s.weight), 0);
  const feel = predominantFeel(real);

  // Feels missing entirely → plain repeat, basis states it's just last session.
  if (!feel) {
    return { suggestedWeight: top, basis: `${fmt(top)} kg last session` };
  }

  switch (feel) {
    case 'easy': {
      // +2.5% rounded to a plate; for lighter bars 2.5 kg is simply the
      // smallest expressible jump, so it becomes the floor.
      const target = roundToIncrement(top * 1.025, increment);
      const suggested = Math.max(roundToIncrement(top + increment, increment), target);
      return { suggestedWeight: suggested, basis: `${fmt(top)} felt easy last time` };
    }
    case 'right':
      return { suggestedWeight: top, basis: `${fmt(top)} felt right last time` };
    case 'grind':
      return { suggestedWeight: top, basis: `${fmt(top)} was a grind last time` };
    case 'failed': {
      const dropped = Math.max(0, roundToIncrement(top * 0.95, increment));
      // Rounding can bounce a tiny weight back up to (or past) the top —
      // then the honest drop is one increment; if even that hits zero,
      // there is no sensible number to suggest.
      const final = dropped >= top ? Math.max(0, top - increment) : dropped;
      if (final <= 0) return null;
      return { suggestedWeight: final, basis: `a rep failed at ${fmt(top)} last time` };
    }
  }
}
