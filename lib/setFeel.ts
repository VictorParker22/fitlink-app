/**
 * setFeel — shared math for "How training felt".
 *
 * Both the coach client detail (app/client/[id].tsx) and the athlete Progress
 * tab (app/(client-tabs)/my-progress.tsx) summarise the same per-set feel
 * ratings the athlete logs in strength sessions
 * (client_workout_logs.exercises JSONB). The counting, the >= 3 rated-set
 * gate, the predominant-feel pick (ties break toward the harder rating) and
 * the heavy-week threshold live here so the two surfaces can never drift.
 * Only the sentence each side composes from this differs — coach voice vs
 * athlete voice.
 */

export type FeelKey = 'easy' | 'right' | 'grind' | 'failed';
export type FeelCounts = Record<FeelKey, number>;

export const FEEL_MIN_RATED_SETS = 3;

const FEEL_ORDER: FeelKey[] = ['easy', 'right', 'grind', 'failed'];

/** Count per-set feel ratings across workout log rows (exercises JSONB). */
export function countSetFeels(rows: { exercises?: any }[]): FeelCounts {
  const counts: FeelCounts = { easy: 0, right: 0, grind: 0, failed: 0 };
  for (const row of rows) {
    for (const ex of (Array.isArray(row.exercises) ? row.exercises : [])) {
      for (const st of (Array.isArray(ex?.sets) ? ex.sets : [])) {
        const feel = st?.feel as FeelKey | undefined;
        if (feel && counts[feel] !== undefined) counts[feel] += 1;
      }
    }
  }
  return counts;
}

export interface FeelAnalysis {
  /** Total rated sets in the window (always >= FEEL_MIN_RATED_SETS). */
  rated: number;
  /** Predominant feel; ties break toward the harder rating. */
  top: FeelKey;
  /** Grinds + failed reps. */
  hard: number;
  /** True when grinds/fails dominate (more than half of rated sets). */
  heavy: boolean;
}

/**
 * Analyse counted feels. Returns null below the honesty gate — callers render
 * nothing in that case, never an empty shell.
 */
export function analyzeFeelCounts(counts: FeelCounts | null): FeelAnalysis | null {
  if (!counts) return null;
  const rated = counts.easy + counts.right + counts.grind + counts.failed;
  if (rated < FEEL_MIN_RATED_SETS) return null;
  let top: FeelKey = 'easy';
  for (const f of FEEL_ORDER) if (counts[f] >= counts[top]) top = f;
  const hard = counts.grind + counts.failed;
  return { rated, top, hard, heavy: hard > rated / 2 };
}
