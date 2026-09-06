/**
 * intakeMap — the one place the athlete's intake vocabulary is translated.
 *
 * The editorial onboarding (app/(auth)/intake.tsx → lib/onboardingDraft.ts)
 * writes a canonical goal KEY plus its label into auth metadata:
 *
 *   intake_goal_key  'strength' | 'fat_loss' | 'return' | 'pain'
 *   intake_goal      the matching label below (identical to the legacy
 *                    client-onboarding.tsx Q1 labels)
 *   intake_days      number of days a week
 *   intake_training_days  ['tue','thu','sat'] — chosen weekdays
 *
 * find-coach.tsx has its own option labels (they double as its stored
 * values in assessment_data.intake.goal), and coach matching / goal
 * readers work on labels. Everything that needs to hop between the two
 * vocabularies goes through this file so the athlete is asked each
 * question once and never mis-prefilled.
 */

export type IntakeGoalKey = 'strength' | 'fat_loss' | 'return' | 'pain';

export const INTAKE_GOAL_KEYS: readonly IntakeGoalKey[] = ['strength', 'fat_loss', 'return', 'pain'];

/** Canonical label per key — the exact strings written to intake_goal. */
export const INTAKE_GOAL_LABELS: Record<IntakeGoalKey, string> = {
  strength: 'Get stronger on the big lifts',
  fat_loss: 'Lose fat, keep the strength I have',
  return: 'Get back into it after a break',
  pain: 'Train around something that hurts',
};

/** find-coach option label per key (its stored intake.goal vocabulary). */
export const FIND_COACH_GOAL_LABELS: Record<IntakeGoalKey, string> = {
  strength: 'Get strong in the gym',
  fat_loss: 'Lose fat and keep muscle',
  return: 'Get back into it',
  pain: 'Come back from an injury',
};

export function isIntakeGoalKey(raw: unknown): raw is IntakeGoalKey {
  return typeof raw === 'string' && (INTAKE_GOAL_KEYS as readonly string[]).includes(raw);
}

/** Canonical label for a key, or undefined for anything that is not a key. */
export function goalKeyToLabel(raw: unknown): string | undefined {
  return isIntakeGoalKey(raw) ? INTAKE_GOAL_LABELS[raw] : undefined;
}

/**
 * Key for a label from EITHER vocabulary (onboarding or find-coach), or
 * undefined when the label has no canonical key (find-coach's "Train for an
 * event" / "Start from nothing" are marketplace-only).
 */
export function goalLabelToKey(raw: unknown): IntakeGoalKey | undefined {
  if (typeof raw !== 'string') return undefined;
  const label = raw.trim();
  if (!label) return undefined;
  for (const key of INTAKE_GOAL_KEYS) {
    if (INTAKE_GOAL_LABELS[key] === label || FIND_COACH_GOAL_LABELS[key] === label) return key;
  }
  return undefined;
}

/**
 * find-coach option label for a key or an onboarding label. A find-coach
 * label passes through unchanged when it is one of ours; anything else is
 * undefined so the caller asks instead of guessing.
 */
export function goalToFindCoachLabel(raw: unknown): string | undefined {
  if (isIntakeGoalKey(raw)) return FIND_COACH_GOAL_LABELS[raw];
  const key = goalLabelToKey(raw);
  return key ? FIND_COACH_GOAL_LABELS[key] : undefined;
}

/**
 * Prefer the key's label; fall back to the raw label when it is already a
 * known label of either vocabulary. Used by goal readers so a row that only
 * carries goal_key still reads as text.
 */
export function resolveGoalLabel(goal: unknown, goalKey: unknown): string | undefined {
  const fromKey = goalKeyToLabel(goalKey);
  if (typeof goal === 'string' && goal.trim()) return goal.trim();
  return fromKey;
}

/** find-coach's days buckets, in order. */
export const FIND_COACH_DAY_BUCKETS = ['2 days', '3 days', '4 days', '5 or more'] as const;
export type FindCoachDayBucket = (typeof FIND_COACH_DAY_BUCKETS)[number];

/** Days-a-week as stored (number, numeric string, or an existing bucket) → bucket. */
export function daysToFindCoachBucket(raw: unknown): FindCoachDayBucket | undefined {
  if (typeof raw === 'string' && (FIND_COACH_DAY_BUCKETS as readonly string[]).includes(raw)) {
    return raw as FindCoachDayBucket;
  }
  const n = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? parseInt(raw.trim(), 10) : NaN;
  if (!Number.isFinite(n) || n < 1 || n > 7) return undefined;
  if (n <= 2) return '2 days';
  if (n === 3) return '3 days';
  if (n === 4) return '4 days';
  return '5 or more';
}

/** The integer days-a-week behind a raw value, when it is one (1–7). */
export function daysToNumber(raw: unknown): number | undefined {
  const n = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? parseInt(raw.trim(), 10) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 7 ? n : undefined;
}
