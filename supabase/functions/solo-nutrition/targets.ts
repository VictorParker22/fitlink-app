// ============================================================
// targets — the arithmetic of a Solo athlete's nutrition plan.
//
// Pure TypeScript (no Deno APIs) so jest can load it from
// tests/soloNutrition.test.ts and the edge function can import it.
//
// What we know about a Solo athlete: body weight (onboarding or the corner),
// training days, the goal, sometimes a date of birth. No height, no sex, so
// the Mifflin-St Jeor equation is not on the table. Coaches without those
// numbers use a bodyweight multiplier, and so do we: 14 to 16.5 kcal per lb
// by training frequency, nudged down with age, then moved for the goal.
// Protein by bodyweight, fat as a share of calories, carbs as the rest;
// carbs move up on training days and down on rest days.
//
// The model's job (in index.ts) is to fill those numbers with real foods;
// the numbers themselves never come from the model.
// ============================================================

export type NutritionGoal = 'fat_loss' | 'strength' | 'general';

export interface TargetInput {
  weightLbs: number;
  trainingDays: number;
  goal: NutritionGoal;
  /** Years; optional. */
  age?: number | null;
}

export interface DayTargets { calories: number; protein: number; carbs: number; fat: number }

export interface Targets {
  training: DayTargets;
  rest: DayTargets;
  maintenance: number;
  /** One sentence for the plan description and the corner. */
  method: string;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

export function targetsFor(input: TargetInput): Targets {
  const lbs = Math.max(80, Math.min(450, input.weightLbs));
  const days = Math.max(0, Math.min(7, input.trainingDays));
  // 14.0 at 0 days up to 16.5 at 6+ days.
  let perLb = 14 + Math.min(6, days) * 0.42;
  if (Number.isFinite(input.age ?? NaN) && (input.age as number) > 30) perLb *= 1 - Math.min(0.1, ((input.age as number) - 30) / 10 * 0.02);
  const maintenance = round5(lbs * perLb);

  const factor = input.goal === 'fat_loss' ? 0.8 : input.goal === 'strength' ? 1.08 : 1;
  const floor = 1400;
  const trainingCal = Math.max(floor, round5(maintenance * factor));
  const proteinPerLb = input.goal === 'fat_loss' ? 1.0 : input.goal === 'strength' ? 0.9 : 0.8;
  const protein = Math.min(250, Math.round(lbs * proteinPerLb));
  const fatT = Math.round((trainingCal * 0.27) / 9);
  const carbsT = Math.max(50, Math.round((trainingCal - protein * 4 - fatT * 9) / 4));

  // Rest day: carbs down 20%, fat up a touch; protein identical.
  const carbsR = Math.max(40, Math.round(carbsT * 0.8));
  const fatR = Math.round(fatT * 1.08);
  const restCal = Math.max(floor - 100, round5(protein * 4 + carbsR * 4 + fatR * 9));

  const goalWord = input.goal === 'fat_loss' ? 'a moderate deficit for fat loss' : input.goal === 'strength' ? 'a small surplus to support strength' : 'maintenance';
  return {
    training: { calories: trainingCal, protein, carbs: carbsT, fat: fatT },
    rest: { calories: restCal, protein, carbs: carbsR, fat: fatR },
    maintenance,
    method: `From ${Math.round(lbs)} lb and ${days} training days: about ${maintenance} kcal to maintain, set to ${goalWord}; protein ${protein} g every day, carbs higher on training days.`,
  };
}

export function nutritionGoalFrom(goalKey: string, tags: { weightManagement?: boolean; hypertrophy?: boolean; powerlifting?: boolean }): NutritionGoal {
  if (goalKey === 'fat_loss' || tags.weightManagement) return 'fat_loss';
  if (goalKey === 'strength' || tags.powerlifting || tags.hypertrophy) return 'strength';
  return 'general';
}

// ── Foods ────────────────────────────────────────────────────────────────────

export type MealTime = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_TIMES: readonly MealTime[] = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export interface Food {
  name: string;
  meal_time: MealTime;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servings: number;
}

export interface DayPlan { foods: Food[] }

export const SLOT_LABELS = ['Breakfast', 'Lunch', 'Around training', 'Dinner'] as const;
/** Which slot each meal_time sits in, in eating order. */
export const SLOT_OF_MEAL_TIME: Record<MealTime, number> = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };

const q = (n: number) => Math.round(n * 4) / 4;

/** Calories that the macros imply. */
export const kcalOf = (f: { protein: number; carbs: number; fat: number }) => f.protein * 4 + f.carbs * 4 + f.fat * 9;

export function totals(foods: Food[]): DayTargets {
  return foods.reduce((a, f) => ({
    calories: a.calories + f.calories * f.servings,
    protein: a.protein + f.protein * f.servings,
    carbs: a.carbs + f.carbs * f.servings,
    fat: a.fat + f.fat * f.servings,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

/**
 * Clean one model food: clamp, make calories agree with the macros (the
 * label number wins when it is within 15%, otherwise the macros do), and
 * quarter-step the servings.
 */
export function cleanFood(raw: any): Food | null {
  const name = typeof raw?.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  if (!name) return null;
  const mt = String(raw?.meal_time ?? '').toLowerCase() as MealTime;
  const meal_time: MealTime = (MEAL_TIMES as readonly string[]).includes(mt) ? mt : 'snack';
  const num = (v: unknown, max: number) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(max, Math.round(n)) : 0; };
  const protein = num(raw?.protein, 300); const carbs = num(raw?.carbs, 500); const fat = num(raw?.fat, 200);
  const implied = kcalOf({ protein, carbs, fat });
  let calories = num(raw?.calories, 3000);
  if (implied > 0 && (calories === 0 || Math.abs(calories - implied) / implied > 0.15)) calories = Math.round(implied);
  if (calories === 0) return null;
  const sv = Number(raw?.servings);
  const servings = Math.max(0.25, Math.min(6, Number.isFinite(sv) && sv > 0 ? q(sv) : 1));
  return { name, meal_time, calories, protein, carbs, fat, servings };
}

/**
 * Scale servings so the day lands on the targets. Protein foods (protein
 * share of calories over 45%) are scaled toward the protein target, the rest
 * toward the remaining calories. Two passes, quarter-step rounding, and a
 * tolerance check so a plan that cannot be fixed is reported, not shipped.
 */
export function fitToTargets(foods: Food[], target: DayTargets): { foods: Food[]; ok: boolean; offCalories: number; offProtein: number } {
  let out = foods.map((f) => ({ ...f }));
  for (let pass = 0; pass < 2; pass++) {
    const t = totals(out);
    if (t.protein > 0) {
      const pf = Math.max(0.6, Math.min(1.6, target.protein / t.protein));
      out = out.map((f) => (f.protein * 4) / Math.max(1, f.calories) > 0.45 ? { ...f, servings: Math.max(0.25, Math.min(6, q(f.servings * pf))) } : f);
    }
    const t2 = totals(out);
    const proteinCal = out.filter((f) => (f.protein * 4) / Math.max(1, f.calories) > 0.45).reduce((a, f) => a + f.calories * f.servings, 0);
    const otherCal = t2.calories - proteinCal;
    if (otherCal > 0) {
      const cf = Math.max(0.5, Math.min(2, (target.calories - proteinCal) / otherCal));
      out = out.map((f) => (f.protein * 4) / Math.max(1, f.calories) > 0.45 ? f : { ...f, servings: Math.max(0.25, Math.min(6, q(f.servings * cf))) });
    }
  }
  // Fine pass: quarter-serving nudges on whichever food closes the calorie
  // gap most, protein kept inside its band. Quarter steps on a dozen foods
  // are coarse; two proportional passes alone can sit 9% off at 1,500 kcal.
  const isProtein = (f: Food) => (f.protein * 4) / Math.max(1, f.calories) > 0.45;
  for (let iter = 0; iter < 12; iter++) {
    const cur = totals(out);
    const gap = target.calories - cur.calories;
    if (Math.abs(gap) / target.calories <= 0.02) break;
    let bestIdx = -1; let bestErr = Math.abs(gap);
    out.forEach((f, i) => {
      const dir = gap > 0 ? 0.25 : -0.25;
      const next = f.servings + dir;
      if (next < 0.25 || next > 6) return;
      const err = Math.abs(gap - dir * f.calories);
      const pAfter = cur.protein + dir * f.protein;
      if (Math.abs(pAfter - target.protein) / target.protein > 0.12 && isProtein(f)) return;
      if (err < bestErr) { bestErr = err; bestIdx = i; }
    });
    if (bestIdx < 0) break;
    out[bestIdx] = { ...out[bestIdx], servings: q(out[bestIdx].servings + (gap > 0 ? 0.25 : -0.25)) };
  }
  const t = totals(out);
  const offCalories = (t.calories - target.calories) / target.calories;
  const offProtein = (t.protein - target.protein) / target.protein;
  // Calories within 7%. Protein may not fall more than 10% short; running
  // over is fine up to 35% (a high-calorie maintenance day built from lean
  // foods lands over the protein floor by nature, and that is not a fault).
  return { foods: out, ok: Math.abs(offCalories) <= 0.07 && offProtein >= -0.10 && offProtein <= 0.35, offCalories, offProtein };
}

// ── Restrictions ─────────────────────────────────────────────────────────────

const RESTRICTIONS: { when: RegExp; drop: RegExp }[] = [
  { when: /\b(no|non|without|free of|can'?t (have|eat)|don'?t (eat|do)|avoid|allerg\w* to)\W{0,12}dairy|dairy[- ]free|dairy allerg|lactose/i, drop: /\b(milk|cheese|yogh?urt|whey|casein|protein shake|butter|cream|kefir|paneer|ghee|ice cream|latte)\b/i },
  { when: /\bvegan\b|plant[- ]based/i, drop: /\b(chicken|turkey|beef|steak|pork|bacon|ham|lamb|fish|salmon|tuna|cod|shrimp|prawn|egg|eggs|milk|cheese|yogh?urt|whey|casein|butter|honey|protein shake)\b/i },
  { when: /\bvegetarian\b/i, drop: /\b(chicken|turkey|beef|steak|pork|bacon|ham|lamb|fish|salmon|tuna|cod|shrimp|prawn|mince)\b/i },
  { when: /\bpescatarian\b/i, drop: /\b(chicken|turkey|beef|steak|pork|bacon|ham|lamb|mince)\b/i },
  { when: /gluten|c(o)?eliac/i, drop: /\b(bread|toast|wrap|tortilla|pasta|noodle|couscous|bagel|cereal|barley|bulgur|seitan|pita|pitta|wheat|granola)\b/i },
  { when: /\b(no|without|allerg\w* to|avoid)\W{0,12}(nuts?|peanuts?)|nut[- ]free|(nut|peanut|tree nut)s? allerg/i, drop: /\b(peanut|almond|cashew|walnut|pecan|pistachio|hazelnut|nut butter|nuts)\b/i },
  { when: /\b(no|without|allerg\w* to|avoid)\W{0,12}(shellfish|seafood)|shellfish allerg/i, drop: /\b(shrimp|prawn|crab|lobster|clam|mussel|oyster|scallop)\b/i },
  { when: /\b(no|without|allerg\w* to|avoid|can'?t (have|eat))\W{0,12}eggs?\b|egg allergy/i, drop: /\b(egg|eggs|omelette|omelet)\b/i },
  { when: /\b(no|without|don'?t (eat|like)|hate|avoid)\W{0,12}(fish|salmon|tuna)\b/i, drop: /\b(fish|salmon|tuna|cod|sardine|mackerel)\b/i },
  { when: /\b(no|without|don'?t (eat|like)|hate|avoid)\W{0,12}(pork|bacon|ham)\b|halal|kosher/i, drop: /\b(pork|bacon|ham|sausage|prosciutto|chorizo)\b/i },
];

/** Foods a stated restriction rules out, whatever the model did with it. */
export function violatesRestrictions(food: { name: string }, preferences: string | undefined): boolean {
  if (!preferences) return false;
  return RESTRICTIONS.some((r) => r.when.test(preferences) && r.drop.test(food.name));
}

export function applyRestrictions(foods: Food[], preferences: string | undefined): Food[] {
  return foods.filter((f) => !violatesRestrictions(f, preferences));
}

// ── Fallback day (no model) ──────────────────────────────────────────────────

/** Plain foods a coach would write on a napkin; per-serving macros. */
const PANTRY: Omit<Food, 'servings'>[] = [
  { name: 'Rolled oats, dry (50 g)', meal_time: 'breakfast', calories: 190, protein: 7, carbs: 33, fat: 3 },
  { name: 'Whole eggs (2)', meal_time: 'breakfast', calories: 140, protein: 12, carbs: 1, fat: 10 },
  { name: 'Banana (1 medium)', meal_time: 'breakfast', calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: 'Chicken breast, cooked (150 g)', meal_time: 'lunch', calories: 250, protein: 47, carbs: 0, fat: 5 },
  { name: 'Basmati rice, cooked (150 g)', meal_time: 'lunch', calories: 195, protein: 4, carbs: 43, fat: 0 },
  { name: 'Mixed salad with olive oil (1 tbsp)', meal_time: 'lunch', calories: 140, protein: 2, carbs: 6, fat: 12 },
  { name: 'Greek yoghurt, 2% (170 g)', meal_time: 'snack', calories: 120, protein: 17, carbs: 6, fat: 3 },
  { name: 'Apple (1 medium)', meal_time: 'snack', calories: 95, protein: 0, carbs: 25, fat: 0 },
  { name: 'Salmon fillet, cooked (150 g)', meal_time: 'dinner', calories: 310, protein: 34, carbs: 0, fat: 18 },
  { name: 'Potatoes, roasted (200 g)', meal_time: 'dinner', calories: 220, protein: 5, carbs: 42, fat: 4 },
  { name: 'Broccoli, steamed (150 g)', meal_time: 'dinner', calories: 50, protein: 4, carbs: 9, fat: 0 },
];

export function fallbackDay(target: DayTargets, preferences?: string): Food[] {
  const base = applyRestrictions(PANTRY.map((f) => ({ ...f, servings: 1 })), preferences);
  // A restriction that empties a meal slot gets a plain replacement so the
  // day still has breakfast, lunch, a snack and dinner.
  const fill: Food[] = [
    { name: 'Tofu, firm (200 g)', meal_time: 'dinner', calories: 290, protein: 32, carbs: 6, fat: 16, servings: 1 },
    { name: 'Lentils, cooked (200 g)', meal_time: 'lunch', calories: 230, protein: 18, carbs: 40, fat: 1, servings: 1 },
    { name: 'Peanut butter (2 tbsp)', meal_time: 'snack', calories: 190, protein: 8, carbs: 6, fat: 16, servings: 1 },
    { name: 'Rice cakes (3)', meal_time: 'breakfast', calories: 105, protein: 2, carbs: 22, fat: 1, servings: 1 },
  ];
  const have = new Set(base.map((f) => f.meal_time));
  for (const f of applyRestrictions(fill, preferences)) if (!have.has(f.meal_time)) { base.push(f); have.add(f.meal_time); }
  return fitToTargets(base, target).foods;
}

// ── Model output ─────────────────────────────────────────────────────────────

export const NUTRITION_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    training_day: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' }, meal_time: { type: 'string' },
          calories: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' }, servings: { type: 'number' },
        },
        required: ['name', 'meal_time', 'calories', 'protein', 'carbs', 'fat', 'servings'],
      },
    },
    rest_day: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' }, meal_time: { type: 'string' },
          calories: { type: 'number' }, protein: { type: 'number' }, carbs: { type: 'number' }, fat: { type: 'number' }, servings: { type: 'number' },
        },
        required: ['name', 'meal_time', 'calories', 'protein', 'carbs', 'fat', 'servings'],
      },
    },
  },
  required: ['name', 'description', 'training_day', 'rest_day'],
} as const;

export interface NutritionPromptInput {
  targets: Targets;
  goal: NutritionGoal;
  preferences?: string;
  libraryLines?: string;
  trainingDaysLabel?: string;
}

export function buildNutritionPrompt(input: NutritionPromptInput): string {
  const t = input.targets;
  const goalWord = input.goal === 'fat_loss' ? 'fat loss' : input.goal === 'strength' ? 'strength and muscle' : 'general health and performance';
  return [
    'You are a sports nutritionist writing a simple, repeatable day of eating for an athlete who trains without a human coach. The calorie and protein numbers are fixed; your job is to fill them with real foods the athlete can buy and cook without fuss.',
    `Goal: ${goalWord}. ${t.method}`,
    `Training day targets: ${t.training.calories} kcal, ${t.training.protein} g protein, ${t.training.carbs} g carbs, ${t.training.fat} g fat${input.trainingDaysLabel ? ` (${input.trainingDaysLabel})` : ''}.`,
    `Rest day targets: ${t.rest.calories} kcal, ${t.rest.protein} g protein, ${t.rest.carbs} g carbs, ${t.rest.fat} g fat.`,
    input.preferences ? `Preferences and restrictions, which override everything: ${input.preferences}` : 'No stated restrictions.',
    input.libraryLines ? `Foods already in the FitLink library (use exact names and macros when they fit):\n${input.libraryLines}` : '',
    '',
    'Rules:',
    '- Each entry is ONE food or ONE dish with a real portion in its name ("Chicken breast, cooked (150 g)", "Whole eggs (2)", "Rolled oats, dry (60 g)"). A meal is several entries sharing a meal_time.',
    '- meal_time is exactly one of breakfast, lunch, dinner, snack. Use "snack" for the food around training.',
    '- Macros are per ONE serving of the named portion; then set servings (0.25 to 6, quarter steps) so the day lands within 5% of the calorie target and within 10% of protein.',
    '- calories must equal 4 × protein + 4 × carbs + 9 × fat within 10%.',
    '- 9 to 14 entries per day. Cover breakfast, lunch and dinner, and one snack around training. The rest day keeps the same protein foods with smaller carb portions.',
    '- Ordinary supermarket foods. No supplements except whey protein when protein is hard to reach, and none at all when dairy is restricted. Never include a food the restrictions rule out.',
    '- WRONG: "Turkey wrap", "Salmon & sweet potato" (several foods in one entry). RIGHT: "Turkey breast, sliced (120 g)" and "Wholemeal tortilla (1)" as two entries; "Salmon fillet, cooked (150 g)" and "Sweet potato, baked (200 g)" as two entries.',
    '- name: 2 to 4 words for the plan ("Simple cut", "Strength fuel"). description: one plain sentence on how to eat it, under 30 words, no numbers.',
    'Return JSON only, matching the schema.',
  ].filter((l) => l !== '').join('\n');
}
