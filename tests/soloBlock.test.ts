/**
 * The phone's reading of clients.solo_block and of a stated body weight:
 * both feed the corner's context and the nutrition builder, so both must be
 * literal about what they were given.
 */
import { describeBlock, describeNutrition, readSoloBlock } from '../lib/soloBlock';
import { parseStatedWeight, NUTRITION_INTENT, PREFERENCE_HINT } from '../lib/soloNutrition';

jest.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

describe('describeBlock / describeNutrition', () => {
  const block = { started: '2026-09-08', week: 3, split: 'upper_lower', goal: 'strength', days: 4, anchors: [], rationale: 'An upper/lower split, built around the squat, bench, deadlift and overhead press; week 3 of the block: the heaviest week.', nutrition: { built_at: 'x', calories: 2470, protein: 194, carbs: 250, fat: 74, rest_calories: 2280, method: 'm' } };
  it('reads the block into the same line the server writes', () => {
    expect(describeBlock(block)).toBe('week 3 of 4 (peak), upper lower, 4 days: An upper/lower split, built around the squat, bench, deadlift and overhead press; week 3 of the block: the heaviest week.');
    expect(describeNutrition(block)).toBe('2,470 kcal and 194 g protein on training days, 2,280 kcal on rest days');
  });
  it('is empty for nothing, for a nutrition-only block and for junk', () => {
    expect(describeBlock(null)).toBe('');
    expect(describeBlock({ nutrition: block.nutrition })).toBe('');
    expect(describeNutrition({ week: 1, split: 'full_3' })).toBe('');
    expect(readSoloBlock('nope')).toBeNull();
    expect(readSoloBlock(block)).toBe(block);
  });
});

describe('parseStatedWeight', () => {
  it('reads pounds by default and kilograms when said', () => {
    expect(parseStatedWeight('I weigh 190')).toEqual({ weight: 190, unit: 'lbs' });
    expect(parseStatedWeight('about 194 lbs these days')).toEqual({ weight: 194, unit: 'lbs' });
    expect(parseStatedWeight('86 kg')).toEqual({ weight: 86, unit: 'kg' });
    expect(parseStatedWeight('86.5 kilos')).toEqual({ weight: 86.5, unit: 'kg' });
    expect(parseStatedWeight('I weigh 86', 'kg')).toEqual({ weight: 86, unit: 'kg' });
  });
  it('ignores numbers that cannot be a body weight', () => {
    expect(parseStatedWeight('3 sets of 12')).toBeNull();
    expect(parseStatedWeight('20 kg plates')).toBeNull();
    expect(parseStatedWeight('no idea')).toBeNull();
  });
});

describe('intents', () => {
  it('recognises a meal-plan ask and a restriction', () => {
    expect(NUTRITION_INTENT.test('Write my meal plan')).toBe(true);
    expect(NUTRITION_INTENT.test('what should I eat today')).toBe(true);
    expect(NUTRITION_INTENT.test('how much should I eat')).toBe(true);
    expect(NUTRITION_INTENT.test('Build my week')).toBe(false);
    expect(PREFERENCE_HINT.test("I'm vegetarian and can't eat dairy")).toBe(true);
    expect(PREFERENCE_HINT.test('190 lbs')).toBe(false);
  });
});
