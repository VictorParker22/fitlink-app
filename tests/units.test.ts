import {
  DEFAULT_WEIGHT_UNIT,
  asWeightUnit,
  formatWeight,
  formatWeightNumber,
  fromKg,
  isWeightUnit,
  roundToPlate,
  toKg,
  unitLabel,
  unitLongName,
  weightStep,
} from '../lib/units';
import { suggestNextLoad } from '../lib/loadSuggestion';
import type { StrengthSetLog, SetFeel } from '../context/WorkoutContext';

describe('weightStep', () => {
  it('is a pair of plates in each unit', () => {
    expect(weightStep('lbs')).toBe(5);
    expect(weightStep('kg')).toBe(2.5);
  });
});

describe('roundToPlate', () => {
  it('rounds to the nearest plate increment', () => {
    expect(roundToPlate(137, 'lbs')).toBe(135);
    expect(roundToPlate(138, 'lbs')).toBe(140);
    expect(roundToPlate(81, 'kg')).toBe(80);
    expect(roundToPlate(81.3, 'kg')).toBe(82.5);
  });

  it('never leaks binary noise into the result', () => {
    expect(roundToPlate(82.499999, 'kg')).toBe(82.5);
    expect(roundToPlate(80 * 1.025, 'kg')).toBe(82.5);
    expect(roundToPlate(135 * 1.025, 'lbs')).toBe(140);
    const noisy = roundToPlate(0.1 + 0.2 + 82.4, 'kg');
    expect(String(noisy)).toBe('82.5');
  });

  it('keeps zero at zero', () => {
    expect(roundToPlate(0, 'lbs')).toBe(0);
    expect(roundToPlate(1, 'kg')).toBe(0);
  });
});

describe('formatting', () => {
  it('drops a trailing .0 and keeps one decimal otherwise', () => {
    expect(formatWeightNumber(140)).toBe('140');
    expect(formatWeightNumber(137.5)).toBe('137.5');
    expect(formatWeightNumber(82.499)).toBe('82.5');
    expect(formatWeightNumber(80.04)).toBe('80');
  });

  it('is defensive about non-finite input', () => {
    expect(formatWeightNumber(NaN)).toBe('0');
    expect(formatWeightNumber(Infinity)).toBe('0');
  });

  it('formatWeight always carries the suffix', () => {
    expect(formatWeight(140, 'lbs')).toBe('140 lbs');
    expect(formatWeight(82.5, 'kg')).toBe('82.5 kg');
  });

  it('labels and long names match the unit', () => {
    expect(unitLabel('lbs')).toBe('lbs');
    expect(unitLabel('kg')).toBe('kg');
    expect(unitLongName('lbs')).toBe('pounds');
    expect(unitLongName('kg')).toBe('kilograms');
  });
});

describe('isWeightUnit / asWeightUnit', () => {
  it('recognises only the two stored values', () => {
    expect(isWeightUnit('lbs')).toBe(true);
    expect(isWeightUnit('kg')).toBe(true);
    expect(isWeightUnit('KG')).toBe(false);
    expect(isWeightUnit('lb')).toBe(false);
    expect(isWeightUnit('')).toBe(false);
    expect(isWeightUnit(null)).toBe(false);
    expect(isWeightUnit(undefined)).toBe(false);
    expect(isWeightUnit(5)).toBe(false);
  });

  it('falls back to the default for anything else', () => {
    expect(DEFAULT_WEIGHT_UNIT).toBe('lbs');
    expect(asWeightUnit('kg')).toBe('kg');
    expect(asWeightUnit('lbs')).toBe('lbs');
    expect(asWeightUnit(undefined)).toBe('lbs');
    expect(asWeightUnit(null)).toBe('lbs');
    expect(asWeightUnit('stone')).toBe('lbs');
  });
});

describe('toKg / fromKg', () => {
  it('kg is the identity', () => {
    expect(toKg(80, 'kg')).toBe(80);
    expect(fromKg(80, 'kg')).toBe(80);
  });

  it('converts pounds and round-trips', () => {
    expect(toKg(220.462, 'lbs')).toBeCloseTo(100, 5);
    expect(fromKg(100, 'lbs')).toBeCloseTo(220.462, 5);
    expect(fromKg(toKg(135, 'lbs'), 'lbs')).toBeCloseTo(135, 9);
    expect(toKg(fromKg(82.5, 'lbs'), 'lbs')).toBeCloseTo(82.5, 9);
  });
});

// ── suggestNextLoad in both units ────────────────────────────────────────────

function sets(weight: number, feel?: SetFeel, count = 3): StrengthSetLog[] {
  return Array.from({ length: count }, (_, i) => ({
    exerciseId: 'ex',
    exerciseName: 'Squat',
    setIndex: i,
    weight,
    reps: 5,
    ...(feel ? { feel } : {}),
  }));
}

describe('suggestNextLoad', () => {
  it('returns null with no real history', () => {
    expect(suggestNextLoad(null)).toBeNull();
    expect(suggestNextLoad([])).toBeNull();
    expect(suggestNextLoad(sets(0, 'easy'))).toBeNull();
  });

  it('defaults to pounds', () => {
    const s = suggestNextLoad(sets(135, 'easy'));
    expect(s).not.toBeNull();
    expect(s!.suggestedWeight).toBe(140);
    expect(s!.basis).toBe('135 lbs felt easy last time');
  });

  it('easy → up one plate step in each unit', () => {
    expect(suggestNextLoad(sets(135, 'easy'), 'lbs')!.suggestedWeight).toBe(140);
    expect(suggestNextLoad(sets(80, 'easy'), 'kg')!.suggestedWeight).toBe(82.5);
  });

  it('easy on a heavy bar takes the +2.5% when it beats one step', () => {
    // 400 lb * 1.025 = 410 — two plate steps, not one.
    expect(suggestNextLoad(sets(400, 'easy'), 'lbs')!.suggestedWeight).toBe(410);
    // 200 kg * 1.025 = 205 — again two steps.
    expect(suggestNextLoad(sets(200, 'easy'), 'kg')!.suggestedWeight).toBe(205);
  });

  it('right and grind hold the weight', () => {
    expect(suggestNextLoad(sets(135, 'right'), 'lbs')!.suggestedWeight).toBe(135);
    expect(suggestNextLoad(sets(80, 'grind'), 'kg')!.suggestedWeight).toBe(80);
  });

  it('failed → minus 5%, rounded to a plate', () => {
    const lbs = suggestNextLoad(sets(200, 'failed'), 'lbs')!;
    expect(lbs.suggestedWeight).toBe(190);
    expect(lbs.basis).toBe('a rep failed at 200 lbs last time');
    const kg = suggestNextLoad(sets(100, 'failed'), 'kg')!;
    expect(kg.suggestedWeight).toBe(95);
    expect(kg.basis).toBe('a rep failed at 100 kg last time');
  });

  it('failed on a tiny weight drops one increment, or nothing at all', () => {
    expect(suggestNextLoad(sets(10, 'failed'), 'lbs')!.suggestedWeight).toBe(5);
    expect(suggestNextLoad(sets(2.5, 'failed'), 'kg')).toBeNull();
  });

  it('basis strings carry the unit', () => {
    expect(suggestNextLoad(sets(80), 'kg')!.basis).toBe('80 kg last session');
    expect(suggestNextLoad(sets(82.5, 'right'), 'kg')!.basis).toBe('82.5 kg felt right last time');
    expect(suggestNextLoad(sets(135, 'grind'), 'lbs')!.basis).toBe('135 lbs was a grind last time');
  });

  it('ties break toward the harder feel', () => {
    const mixed = [...sets(80, 'easy', 1), ...sets(80, 'failed', 1)];
    expect(suggestNextLoad(mixed, 'kg')!.suggestedWeight).toBe(75);
  });
});
