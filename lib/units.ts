/**
 * Weight units — the athlete's one preference for every lifted weight.
 *
 * `clients.weight_unit` (migration 20260905010000) holds 'lbs' or 'kg',
 * default 'lbs'. Every number a set, a PR or a suggestion carries is READ in
 * the athlete's current unit; nothing stored is converted when the toggle
 * flips. That is a stated trade: an athlete who logged in both flows before
 * the preference existed has mixed numbers, and relabelling them is honest
 * about what we know (nothing) rather than inventing a conversion. `toKg` /
 * `fromKg` exist for the day sets carry their own `unit` stamp and can be
 * converted for real.
 *
 * Body weight is NOT covered here — it is stored in lbs by design
 * (app/client/[id]/log-progress.tsx converts on entry).
 *
 * Pure module, no React, no imports: jest-importable.
 */

export type WeightUnit = 'lbs' | 'kg';

export const WEIGHT_UNITS: readonly WeightUnit[] = ['lbs', 'kg'];

export const DEFAULT_WEIGHT_UNIT: WeightUnit = 'lbs';

export const LBS_PER_KG = 2.20462;

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'lbs' || value === 'kg';
}

/** Anything that is not a known unit (null, '', a typo) reads as the default. */
export function asWeightUnit(value: unknown): WeightUnit {
  return isWeightUnit(value) ? value : DEFAULT_WEIGHT_UNIT;
}

/** Short suffix as it appears next to a number: "lbs" / "kg". */
export function unitLabel(unit: WeightUnit): string {
  return unit === 'kg' ? 'kg' : 'lbs';
}

/** Spoken form for accessibility labels: "pounds" / "kilograms". */
export function unitLongName(unit: WeightUnit): string {
  return unit === 'kg' ? 'kilograms' : 'pounds';
}

/**
 * Smallest plate-sized jump in that unit: a pair of 2.5 lb plates (5 lb) or a
 * pair of 1.25 kg plates (2.5 kg). Drives every +/- stepper and the load
 * suggestion's minimum increment.
 */
export function weightStep(unit: WeightUnit): number {
  return unit === 'kg' ? 2.5 : 5;
}

/**
 * Round to the nearest plate increment for the unit. Two-decimal fix so a
 * value like 82.499999 becomes 82.5 and never leaks binary noise into a label.
 */
export function roundToPlate(value: number, unit: WeightUnit): number {
  const step = weightStep(unit);
  return Math.round((Math.round(value / step) * step) * 100) / 100;
}

/** 137.5 -> "137.5", 140 -> "140", 82.499 -> "82.5". No trailing ".0". */
export function formatWeightNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** "140 lbs" / "82.5 kg" — number and suffix together, always with the unit. */
export function formatWeight(n: number, unit: WeightUnit): string {
  return `${formatWeightNumber(n)} ${unitLabel(unit)}`;
}

/** Convert a value expressed in `unit` to kilograms. */
export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LBS_PER_KG;
}

/** Convert a kilogram value into `unit`. */
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LBS_PER_KG;
}
