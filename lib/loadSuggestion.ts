import { StrengthSetLog, SetFeel } from '../context/WorkoutContext';
import {
  DEFAULT_WEIGHT_UNIT, WeightUnit, formatWeight, roundToPlate, weightStep,
} from './units';

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
 *
 * UNITS. The engine is relative math (percentages of last time's top set), so
 * it never converts: the logged numbers are read in the athlete's current
 * unit (lib/units.ts) and the answer comes back in the same unit. The unit
 * only decides the plate increment (5 lb / 2.5 kg) and the suffix in `basis`.
 */

export interface LoadSuggestion {
  suggestedWeight: number; // in the athlete's unit, rounded to a real plate increment
  basis: string;           // the honest reason, e.g. "80 kg felt easy last time"
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
  unit: WeightUnit = DEFAULT_WEIGHT_UNIT,
): LoadSuggestion | null {
  const real = (lastSessionSets ?? []).filter(
    s => Number.isFinite(s.weight) && s.weight > 0,
  );
  if (real.length === 0) return null;

  const increment = weightStep(unit);
  const top = real.reduce((max, s) => Math.max(max, s.weight), 0);
  const topLabel = formatWeight(top, unit);
  const feel = predominantFeel(real);

  // Feels missing entirely → plain repeat, basis states it's just last session.
  if (!feel) {
    return { suggestedWeight: top, basis: `${topLabel} last session` };
  }

  switch (feel) {
    case 'easy': {
      // +2.5% rounded to a plate; for lighter bars one increment is simply
      // the smallest expressible jump, so it becomes the floor.
      const target = roundToPlate(top * 1.025, unit);
      const suggested = Math.max(roundToPlate(top + increment, unit), target);
      return { suggestedWeight: suggested, basis: `${topLabel} felt easy last time` };
    }
    case 'right':
      return { suggestedWeight: top, basis: `${topLabel} felt right last time` };
    case 'grind':
      return { suggestedWeight: top, basis: `${topLabel} was a grind last time` };
    case 'failed': {
      const dropped = Math.max(0, roundToPlate(top * 0.95, unit));
      // Rounding can bounce a tiny weight back up to (or past) the top —
      // then the honest drop is one increment; if even that hits zero,
      // there is no sensible number to suggest.
      const final = dropped >= top ? Math.max(0, top - increment) : dropped;
      if (final <= 0) return null;
      return { suggestedWeight: final, basis: `a rep failed at ${topLabel} last time` };
    }
  }
}
