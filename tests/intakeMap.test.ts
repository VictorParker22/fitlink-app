import {
  INTAKE_GOAL_LABELS,
  FIND_COACH_GOAL_LABELS,
  goalKeyToLabel,
  goalLabelToKey,
  goalToFindCoachLabel,
  resolveGoalLabel,
  daysToFindCoachBucket,
  daysToNumber,
  isIntakeGoalKey,
} from '../lib/intakeMap';

describe('intakeMap — goal vocabulary', () => {
  it('maps every canonical key to its exact onboarding label', () => {
    expect(goalKeyToLabel('strength')).toBe('Get stronger on the big lifts');
    expect(goalKeyToLabel('fat_loss')).toBe('Lose fat, keep the strength I have');
    expect(goalKeyToLabel('return')).toBe('Get back into it after a break');
    expect(goalKeyToLabel('pain')).toBe('Train around something that hurts');
  });

  it('rejects anything that is not a key', () => {
    expect(goalKeyToLabel('injury')).toBeUndefined();
    expect(goalKeyToLabel(undefined)).toBeUndefined();
    expect(goalKeyToLabel(3)).toBeUndefined();
    expect(isIntakeGoalKey('')).toBe(false);
  });

  it('finds the key from either vocabulary, and none for marketplace-only labels', () => {
    for (const key of Object.keys(INTAKE_GOAL_LABELS) as (keyof typeof INTAKE_GOAL_LABELS)[]) {
      expect(goalLabelToKey(INTAKE_GOAL_LABELS[key])).toBe(key);
      expect(goalLabelToKey(FIND_COACH_GOAL_LABELS[key])).toBe(key);
    }
    expect(goalLabelToKey('Train for an event')).toBeUndefined();
    expect(goalLabelToKey('Start from nothing')).toBeUndefined();
    expect(goalLabelToKey('')).toBeUndefined();
    expect(goalLabelToKey(null)).toBeUndefined();
  });

  it('maps keys and onboarding labels onto find-coach options, including "return"', () => {
    expect(goalToFindCoachLabel('strength')).toBe('Get strong in the gym');
    expect(goalToFindCoachLabel('fat_loss')).toBe('Lose fat and keep muscle');
    expect(goalToFindCoachLabel('return')).toBe('Get back into it');
    expect(goalToFindCoachLabel('pain')).toBe('Come back from an injury');
    expect(goalToFindCoachLabel('Get back into it after a break')).toBe('Get back into it');
    expect(goalToFindCoachLabel('Train around something that hurts')).toBe('Come back from an injury');
    // A find-coach label passes through unchanged.
    expect(goalToFindCoachLabel('Come back from an injury')).toBe('Come back from an injury');
    // Unknown text is never guessed at.
    expect(goalToFindCoachLabel('Run a marathon')).toBeUndefined();
  });

  it('resolves a label from goal first, then goal_key', () => {
    expect(resolveGoalLabel('Get strong in the gym', 'strength')).toBe('Get strong in the gym');
    expect(resolveGoalLabel(undefined, 'pain')).toBe('Train around something that hurts');
    expect(resolveGoalLabel('  ', 'return')).toBe('Get back into it after a break');
    expect(resolveGoalLabel(undefined, undefined)).toBeUndefined();
  });
});

describe('intakeMap — days a week', () => {
  it('buckets numbers into the find-coach options', () => {
    expect(daysToFindCoachBucket(1)).toBe('2 days');
    expect(daysToFindCoachBucket(2)).toBe('2 days');
    expect(daysToFindCoachBucket(3)).toBe('3 days');
    expect(daysToFindCoachBucket(4)).toBe('4 days');
    expect(daysToFindCoachBucket(5)).toBe('5 or more');
    expect(daysToFindCoachBucket(7)).toBe('5 or more');
  });

  it('accepts numeric strings and existing buckets, rejects the rest', () => {
    expect(daysToFindCoachBucket('3')).toBe('3 days');
    expect(daysToFindCoachBucket('4 days')).toBe('4 days');
    expect(daysToFindCoachBucket('5 or more')).toBe('5 or more');
    expect(daysToFindCoachBucket(0)).toBeUndefined();
    expect(daysToFindCoachBucket(8)).toBeUndefined();
    expect(daysToFindCoachBucket('lots')).toBeUndefined();
    expect(daysToFindCoachBucket(undefined)).toBeUndefined();
  });

  it('reads the integer behind a raw value only when it is one', () => {
    expect(daysToNumber(3)).toBe(3);
    expect(daysToNumber('5')).toBe(5);
    expect(daysToNumber('3 days')).toBeUndefined();
    expect(daysToNumber(9)).toBeUndefined();
  });
});
