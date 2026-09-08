/**
 * Nutrition numbers are arithmetic, never the model's: targets from weight,
 * training days and goal; foods cleaned and scaled to land on them; a
 * fallback day that always lands.
 */
import {
  targetsFor, nutritionGoalFrom, cleanFood, fitToTargets, totals, fallbackDay, kcalOf, buildNutritionPrompt, SLOT_OF_MEAL_TIME, violatesRestrictions, applyRestrictions,
} from '../supabase/functions/solo-nutrition/targets';

describe('targetsFor', () => {
  it('sets a moderate deficit for fat loss with protein at bodyweight', () => {
    const t = targetsFor({ weightLbs: 194, trainingDays: 4, goal: 'fat_loss', age: 31 });
    expect(t.maintenance).toBeGreaterThan(2900);
    expect(t.maintenance).toBeLessThan(3150);
    expect(t.training.calories).toBe(Math.round(t.maintenance * 0.8 / 5) * 5);
    expect(t.training.protein).toBe(194);
    expect(t.rest.calories).toBeLessThan(t.training.calories);
    expect(t.rest.protein).toBe(t.training.protein);
    expect(t.rest.carbs).toBeLessThan(t.training.carbs);
    expect(kcalOf(t.training)).toBeCloseTo(t.training.calories, -1.2);
    expect(t.method).toMatch(/194 lb and 4 training days/);
  });
  it('gives strength a small surplus and general maintenance', () => {
    const s = targetsFor({ weightLbs: 160, trainingDays: 3, goal: 'strength' });
    const g = targetsFor({ weightLbs: 160, trainingDays: 3, goal: 'general' });
    expect(s.training.calories).toBeGreaterThan(g.training.calories);
    expect(g.training.calories).toBe(g.maintenance);
    expect(s.training.protein).toBe(144);
    expect(g.training.protein).toBe(128);
  });
  it('never goes under the floor and clamps absurd weights', () => {
    const t = targetsFor({ weightLbs: 85, trainingDays: 0, goal: 'fat_loss' });
    expect(t.training.calories).toBeGreaterThanOrEqual(1400);
    expect(targetsFor({ weightLbs: 900, trainingDays: 3, goal: 'general' }).maintenance).toBe(targetsFor({ weightLbs: 450, trainingDays: 3, goal: 'general' }).maintenance);
  });
  it('maps the training goal to a nutrition goal', () => {
    expect(nutritionGoalFrom('fat_loss', {})).toBe('fat_loss');
    expect(nutritionGoalFrom('return', { weightManagement: true })).toBe('fat_loss');
    expect(nutritionGoalFrom('strength', {})).toBe('strength');
    expect(nutritionGoalFrom('return', { hypertrophy: true })).toBe('strength');
    expect(nutritionGoalFrom('return', {})).toBe('general');
  });
});

describe('cleanFood', () => {
  it('corrects calories that disagree with the macros and quarter-steps servings', () => {
    const f = cleanFood({ name: '  Chicken breast, cooked (150 g) ', meal_time: 'LUNCH', calories: 900, protein: 47, carbs: 0, fat: 5, servings: 1.3 })!;
    expect(f.name).toBe('Chicken breast, cooked (150 g)');
    expect(f.meal_time).toBe('lunch');
    expect(f.calories).toBe(233);
    expect(f.servings).toBe(1.25);
  });
  it('drops nameless or empty foods and defaults an odd meal_time to snack', () => {
    expect(cleanFood({ name: '', calories: 100 })).toBeNull();
    expect(cleanFood({ name: 'Water', calories: 0, protein: 0, carbs: 0, fat: 0 })).toBeNull();
    expect(cleanFood({ name: 'Apple', meal_time: 'brunch', calories: 95, protein: 0, carbs: 25, fat: 0 })!.meal_time).toBe('snack');
  });
});

describe('fitToTargets', () => {
  const target = { calories: 2400, protein: 190, carbs: 250, fat: 72 };
  it('scales a rough day onto the targets within tolerance', () => {
    const rough = [
      cleanFood({ name: 'Oats (60 g)', meal_time: 'breakfast', calories: 230, protein: 8, carbs: 40, fat: 4, servings: 1 })!,
      cleanFood({ name: 'Eggs (2)', meal_time: 'breakfast', calories: 140, protein: 12, carbs: 1, fat: 10, servings: 1 })!,
      cleanFood({ name: 'Chicken breast (150 g)', meal_time: 'lunch', calories: 250, protein: 47, carbs: 0, fat: 5, servings: 1 })!,
      cleanFood({ name: 'Rice, cooked (150 g)', meal_time: 'lunch', calories: 195, protein: 4, carbs: 43, fat: 0, servings: 1 })!,
      cleanFood({ name: 'Greek yoghurt (170 g)', meal_time: 'snack', calories: 120, protein: 17, carbs: 6, fat: 3, servings: 1 })!,
      cleanFood({ name: 'Salmon (150 g)', meal_time: 'dinner', calories: 310, protein: 34, carbs: 0, fat: 18, servings: 1 })!,
      cleanFood({ name: 'Potatoes (200 g)', meal_time: 'dinner', calories: 220, protein: 5, carbs: 42, fat: 4, servings: 1 })!,
      cleanFood({ name: 'Olive oil (1 tbsp)', meal_time: 'dinner', calories: 120, protein: 0, carbs: 0, fat: 14, servings: 1 })!,
    ];
    const before = totals(rough);
    expect(before.calories).toBeLessThan(target.calories * 0.9);
    const fit = fitToTargets(rough, target);
    const after = totals(fit.foods);
    expect(fit.ok).toBe(true);
    expect(Math.abs(after.calories - target.calories) / target.calories).toBeLessThanOrEqual(0.07);
    expect(Math.abs(after.protein - target.protein) / target.protein).toBeLessThanOrEqual(0.12);
    expect(fit.foods.every((f) => f.servings * 4 === Math.round(f.servings * 4))).toBe(true);
  });
  it('accepts a day that runs over on protein but not one that falls short', () => {
    const lean = [
      cleanFood({ name: 'Chicken breast (150 g)', meal_time: 'lunch', calories: 250, protein: 47, carbs: 0, fat: 5, servings: 2 })!,
      cleanFood({ name: 'Rice, cooked (150 g)', meal_time: 'lunch', calories: 195, protein: 4, carbs: 43, fat: 0, servings: 3 })!,
      cleanFood({ name: 'Salmon (150 g)', meal_time: 'dinner', calories: 310, protein: 34, carbs: 0, fat: 18, servings: 2 })!,
      cleanFood({ name: 'Potatoes (200 g)', meal_time: 'dinner', calories: 220, protein: 5, carbs: 42, fat: 4, servings: 3 })!,
      cleanFood({ name: 'Oats (60 g)', meal_time: 'breakfast', calories: 230, protein: 8, carbs: 40, fat: 4, servings: 2 })!,
      cleanFood({ name: 'Olive oil (1 tbsp)', meal_time: 'dinner', calories: 120, protein: 0, carbs: 0, fat: 14, servings: 2 })!,
    ];
    const over = fitToTargets(lean, { calories: 2600, protein: 130, carbs: 330, fat: 78 });
    expect(over.offProtein).toBeGreaterThan(0.1);
    expect(over.ok).toBe(true);
    const short = fitToTargets(lean.filter((f) => !/Chicken|Salmon/.test(f.name)), { calories: 2400, protein: 190, carbs: 250, fat: 72 });
    expect(short.ok).toBe(false);
  });
  it('reports a day it cannot fix instead of shipping it', () => {
    const tiny = [cleanFood({ name: 'Apple', meal_time: 'snack', calories: 95, protein: 0, carbs: 25, fat: 0, servings: 1 })!];
    expect(fitToTargets(tiny, target).ok).toBe(false);
  });
});

describe('fallbackDay', () => {
  it('lands on any reasonable target from the pantry alone', () => {
    for (const cal of [1500, 2000, 2600, 3200]) {
      const target = { calories: cal, protein: Math.round(cal / 13), carbs: Math.round(cal * 0.45 / 4), fat: Math.round(cal * 0.27 / 9) };
      const foods = fallbackDay(target);
      const t = totals(foods);
      expect(Math.abs(t.calories - cal) / cal).toBeLessThanOrEqual(0.08);
      expect(Math.abs(t.protein - target.protein) / target.protein).toBeLessThanOrEqual(0.15);
      expect(new Set(foods.map((f) => f.meal_time))).toEqual(new Set(['breakfast', 'lunch', 'snack', 'dinner']));
    }
  });
});

describe('restrictions', () => {
  const food = (name: string) => ({ name, meal_time: 'snack' as const, calories: 100, protein: 10, carbs: 5, fat: 3, servings: 1 });
  it('drops what a stated restriction rules out, and nothing else', () => {
    expect(violatesRestrictions(food('Protein Shake'), 'no dairy')).toBe(true);
    expect(violatesRestrictions(food('Greek yoghurt, 2% (170 g)'), "I can't eat dairy")).toBe(true);
    expect(violatesRestrictions(food('Chicken breast, cooked (150 g)'), 'no dairy')).toBe(false);
    expect(violatesRestrictions(food('Chicken breast, cooked (150 g)'), 'vegetarian')).toBe(true);
    expect(violatesRestrictions(food('Whole eggs (2)'), 'vegetarian')).toBe(false);
    expect(violatesRestrictions(food('Whole eggs (2)'), 'vegan')).toBe(true);
    expect(violatesRestrictions(food('Turkey wrap'), 'gluten free please')).toBe(true);
    expect(violatesRestrictions(food('Apple & Peanut Butter'), 'nut allergy')).toBe(true);
    expect(violatesRestrictions(food('Protein Shake'), undefined)).toBe(false);
    expect(violatesRestrictions(food('Protein Shake'), 'I love dairy')).toBe(false);
  });
  it('keeps the pantry day complete without dairy or meat', () => {
    const t = { calories: 2200, protein: 150, carbs: 240, fat: 66 };
    for (const pref of ['no dairy', 'vegetarian', 'vegan and gluten free']) {
      const foods = fallbackDay(t, pref);
      expect(applyRestrictions(foods, pref)).toHaveLength(foods.length);
      expect(new Set(foods.map((f) => f.meal_time))).toEqual(new Set(['breakfast', 'lunch', 'snack', 'dinner']));
      const tt = totals(foods);
      expect(Math.abs(tt.calories - t.calories) / t.calories).toBeLessThanOrEqual(0.08);
    }
  });
});

describe('prompt and slots', () => {
  it('states both days\' numbers and the restrictions', () => {
    const t = targetsFor({ weightLbs: 194, trainingDays: 4, goal: 'fat_loss' });
    const p = buildNutritionPrompt({ targets: t, goal: 'fat_loss', preferences: 'no dairy', trainingDaysLabel: 'Mon/Wed/Fri/Sat' });
    expect(p).toMatch(new RegExp(`Training day targets: ${t.training.calories} kcal, ${t.training.protein} g protein`));
    expect(p).toMatch(new RegExp(`Rest day targets: ${t.rest.calories} kcal`));
    expect(p).toMatch(/override everything: no dairy/);
    expect(p).toMatch(/Mon\/Wed\/Fri\/Sat/);
  });
  it('orders the slots through the day', () => {
    expect(SLOT_OF_MEAL_TIME).toEqual({ breakfast: 0, lunch: 1, snack: 2, dinner: 3 });
  });
});
