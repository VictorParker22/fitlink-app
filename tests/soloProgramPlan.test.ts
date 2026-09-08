/**
 * The programming brain of the Solo builder is code, not the model: the
 * split follows the day count, the rep scheme follows the goal and the week
 * of the block, every slot has pattern-matched options, and a week is
 * assembled and validated whether or not the model answered.
 */
import {
  patternOf, isBallistic, isMobility, goalKeyFrom, tagsFrom, experienceFrom,
  schemeFor, splitFor, blueprint, candidatesFor, eligible, assemble, auditWeek,
  bestSetsById, loadHint, noteFor, repsFor, buildProgramPrompt, nextBlock, describeBlock,
  type LibraryRow, type Slot, type WeekPlan, type SoloBlock,
} from '../supabase/functions/solo-program/plan';

let n = 0;
const row = (name: string, muscle_group: string, equipment: string, category = 'legs', secondary: string[] = []): LibraryRow =>
  ({ id: `ex-${++n}`, name, muscle_group, equipment, category, secondary_muscles: secondary });

/** A small but complete library, the way the ExerciseDB rows are named. */
const LIB: LibraryRow[] = [
  row('Barbell Full Squat', 'Quads', 'barbell'), row('Dumbbell Goblet Squat', 'Quads', 'dumbbell'), row('Sled 45° Leg Press', 'Quads', 'machine'), row('Barbell Front Squat', 'Glutes', 'barbell'), row('Bodyweight Squat', 'Quads', 'bodyweight'),
  row('Barbell Deadlift', 'Glutes', 'barbell'), row('Barbell Romanian Deadlift', 'Glutes', 'barbell', 'legs', ['Hamstrings']), row('Dumbbell Romanian Deadlift', 'Hamstrings', 'dumbbell'), row('Kettlebell Swing', 'Glutes', 'kettlebell'), row('Barbell Hip Thrust', 'Glutes', 'barbell'), row('Glute Bridge', 'Glutes', 'bodyweight'),
  row('Dumbbell Lunge', 'Glutes', 'dumbbell'), row('Dumbbell Single Leg Split Squat', 'Quads', 'dumbbell'), row('Bodyweight Reverse Lunge', 'Glutes', 'bodyweight'),
  row('Barbell Bench Press', 'Pectorals', 'barbell', 'chest'), row('Dumbbell Bench Press', 'Pectorals', 'dumbbell', 'chest'), row('Push-up', 'Pectorals', 'bodyweight', 'chest'), row('Dumbbell Incline Bench Press', 'Pectorals', 'dumbbell', 'chest'), row('Cable Fly', 'Pectorals', 'cable', 'chest'),
  row('Barbell Standing Military Press', 'Delts', 'barbell', 'shoulders'), row('Dumbbell Shoulder Press', 'Delts', 'dumbbell', 'shoulders'), row('Pike Push-up', 'Delts', 'bodyweight', 'shoulders'),
  row('Barbell Bent Over Row', 'Upper Back', 'barbell', 'back'), row('Dumbbell Bent Over Row', 'Upper Back', 'dumbbell', 'back'), row('Cable Seated Row', 'Upper Back', 'cable', 'back'), row('Cable Face Pull', 'Delts', 'cable', 'shoulders'), row('Band Pull Apart', 'Upper Back', 'bands', 'back'),
  row('Pull-up', 'Lats', 'bodyweight', 'back'), row('Chin-up', 'Lats', 'bodyweight', 'back'), row('Cable Lat Pulldown Full Range Of Motion', 'Lats', 'cable', 'back'), row('Band Assisted Pull-up', 'Lats', 'bands', 'back'),
  row('Plank', 'Abs', 'bodyweight', 'core'), row('Dead Bug', 'Abs', 'bodyweight', 'core'), row('Hanging Leg Raise', 'Abs', 'bodyweight', 'core'), row('Cable Pallof Press', 'Abs', 'cable', 'core'), row('Russian Twist', 'Abs', 'bodyweight', 'core'),
  row('Farmers Walk', 'Forearms', 'dumbbell', 'arms'),
  row('Run', 'Cardiovascular System', 'bodyweight', 'cardio'), row('Jump Rope', 'Cardiovascular System', 'bodyweight', 'cardio'), row('Burpee', 'Cardiovascular System', 'bodyweight', 'cardio'), row('Stationary Bike', 'Cardiovascular System', 'machine', 'cardio'),
  row('Lever Seated Leg Curl', 'Hamstrings', 'machine'), row('Lever Leg Extension', 'Quads', 'machine'), row('Dumbbell Standing Calf Raise', 'Calves', 'dumbbell'), row('Cable Hip Adduction', 'Adductors', 'cable'),
  row('Dumbbell Lateral Raise', 'Delts', 'dumbbell', 'shoulders'), row('Barbell Curl', 'Biceps', 'barbell', 'arms'), row('Dumbbell Hammer Curl', 'Biceps', 'dumbbell', 'arms'), row('Cable Triceps Pushdown', 'Triceps', 'cable', 'arms'), row('Dumbbell Skull Crusher', 'Triceps', 'dumbbell', 'arms'), row('Dumbbell Wrist Curl', 'Forearms', 'dumbbell', 'arms'),
  row('Standing Hamstring Stretch', 'Hamstrings', 'bodyweight'), row('Ankle Circles', 'Calves', 'bodyweight'),
  row('Barbell Zercher Squat', 'Quads', 'barbell'), row('Power Clean', 'Glutes', 'barbell'), row('Box Jump', 'Quads', 'bodyweight'),
];

const TAGS = { powerlifting: false, running: false, conditioning: false, hypertrophy: false, mobility: false, weightManagement: false };

describe('patternOf', () => {
  it('reads the classic lifts into their patterns', () => {
    const by = (name: string) => patternOf(LIB.find((r) => r.name === name)!);
    expect(by('Barbell Full Squat')).toBe('squat');
    expect(by('Sled 45° Leg Press')).toBe('squat');
    expect(by('Barbell Deadlift')).toBe('hinge');
    expect(by('Barbell Hip Thrust')).toBe('hinge');
    expect(by('Kettlebell Swing')).toBe('hinge');
    expect(by('Dumbbell Lunge')).toBe('lunge');
    expect(by('Dumbbell Single Leg Split Squat')).toBe('lunge');
    expect(by('Barbell Bench Press')).toBe('hpush');
    expect(by('Push-up')).toBe('hpush');
    expect(by('Barbell Standing Military Press')).toBe('vpush');
    expect(by('Barbell Bent Over Row')).toBe('hpull');
    expect(by('Cable Face Pull')).toBe('hpull');
    expect(by('Pull-up')).toBe('vpull');
    expect(by('Cable Lat Pulldown Full Range Of Motion')).toBe('vpull');
    expect(by('Plank')).toBe('core');
    expect(by('Hanging Leg Raise')).toBe('core');
    expect(by('Farmers Walk')).toBe('carry');
    expect(by('Run')).toBe('conditioning');
    expect(by('Standing Hamstring Stretch')).toBe('mobility');
    expect(by('Lever Seated Leg Curl')).toBe('hinge');
    expect(by('Barbell Curl')).toBe('accessory');
  });
  it('flags ballistic and mobility rows', () => {
    expect(isBallistic(LIB.find((r) => r.name === 'Power Clean')!)).toBe(true);
    expect(isBallistic(LIB.find((r) => r.name === 'Box Jump')!)).toBe(true);
    expect(isBallistic(LIB.find((r) => r.name === 'Burpee')!)).toBe(true);
    expect(isBallistic(LIB.find((r) => r.name === 'Barbell Full Squat')!)).toBe(false);
    expect(isMobility(LIB.find((r) => r.name === 'Ankle Circles')!)).toBe(true);
  });
});

describe('goal, tags, experience', () => {
  it('prefers the onboarding key and falls back to text', () => {
    expect(goalKeyFrom('return', 'anything', [])).toBe('return');
    expect(goalKeyFrom(null, 'Get back into it after a break', [])).toBe('return');
    expect(goalKeyFrom(null, 'Get stronger on the big lifts', [])).toBe('strength');
    expect(goalKeyFrom(null, null, ['Weight management'])).toBe('fat_loss');
    expect(goalKeyFrom(null, 'Train around knee pain', [])).toBe('pain');
    expect(goalKeyFrom(null, '', [])).toBe('general');
  });
  it('reads interest tags from the free labels', () => {
    const t = tagsFrom(['Performance', 'Weight management', 'Powerlifting', 'Running']);
    expect(t).toMatchObject({ powerlifting: true, running: true, conditioning: true, weightManagement: true, mobility: false });
  });
  it('maps the three onboarding answers', () => {
    expect(experienceFrom('Never trained')).toBe('new');
    expect(experienceFrom('Trained before, out of the habit')).toBe('returning');
    expect(experienceFrom('Training now, want it structured')).toBe('training');
  });
});

describe('schemeFor', () => {
  it('peaks in week 3 and deloads in week 4 for strength', () => {
    const w1 = schemeFor('strength', 1), w3 = schemeFor('strength', 3), w4 = schemeFor('strength', 4);
    expect(w1.phase).toBe('base'); expect(w3.phase).toBe('peak'); expect(w4.phase).toBe('deload');
    expect(w3.main.rpe).toBeGreaterThan(w1.main.rpe);
    expect(parseInt(w3.main.reps, 10)).toBeLessThan(parseInt(w1.main.reps, 10));
    expect(w4.main.sets * parseInt(w4.main.reps, 10)).toBeLessThan(w3.main.sets * parseInt(w3.main.reps, 10));
    expect(w4.main.rpe).toBeLessThanOrEqual(6);
  });
  it('keeps pain work easy in every week', () => {
    for (let w = 1; w <= 4; w++) expect(schemeFor('pain', w).main.rpe).toBeLessThanOrEqual(7);
  });
  it('wraps week 5 back to week 1', () => {
    expect(schemeFor('general', 5)).toEqual(schemeFor('general', 1));
  });
});

describe('splitFor and blueprint', () => {
  it('chooses the split by day count', () => {
    expect(splitFor(2).sessions.map((s) => s.key)).toEqual(['full_a', 'full_b']);
    expect(splitFor(3).sessions).toHaveLength(3);
    expect(splitFor(4).key).toBe('upper_lower');
    expect(splitFor(5).sessions.map((s) => s.key)).toEqual(['upper_a', 'lower_a', 'push_a', 'pull_a', 'legs_a']);
    expect(splitFor(6).sessions).toHaveLength(6);
    expect(splitFor(9).sessions).toHaveLength(6);
  });
  it('gives every session exactly one main lift with the goal scheme', () => {
    const plan = blueprint({ days: 4, goal: 'strength', tags: TAGS, experience: 'training', week: 1 });
    expect(plan.sessions).toHaveLength(4);
    for (const s of plan.sessions) {
      const mains = s.slots.filter((x) => x.role === 'main');
      expect(mains).toHaveLength(1);
      expect(mains[0]).toMatchObject({ sets: 4, reps: '5', rpe: 7 });
      expect(s.estimated_duration).toBeGreaterThanOrEqual(25);
      expect(s.estimated_duration).toBeLessThanOrEqual(80);
    }
    expect(plan.rationale).toMatch(/upper\/lower/);
    expect(plan.rationale).toMatch(/week 1/);
  });
  it('adds a conditioning finisher for fat loss and for a running interest', () => {
    const fat = blueprint({ days: 3, goal: 'fat_loss', tags: TAGS, experience: 'returning', week: 2 });
    expect(fat.sessions.some((s) => s.slots.some((x) => x.role === 'finisher'))).toBe(true);
    const run = blueprint({ days: 4, goal: 'strength', tags: { ...TAGS, running: true }, experience: 'training', week: 1 });
    expect(run.sessions.filter((s) => s.slots.some((x) => x.role === 'finisher'))).toHaveLength(2);
    const plain = blueprint({ days: 4, goal: 'strength', tags: TAGS, experience: 'training', week: 1 });
    expect(plain.sessions.some((s) => s.slots.some((x) => x.role === 'finisher'))).toBe(false);
  });
  it('ends pain sessions with mobility', () => {
    const p = blueprint({ days: 3, goal: 'pain', tags: TAGS, experience: 'returning', week: 1 });
    expect(p.sessions.every((s) => s.slots[s.slots.length - 1].role === 'mobility')).toBe(true);
  });
});

function candidatesOf(plan: WeekPlan, opts: Parameters<typeof candidatesFor>[2]) {
  const map = new Map<string, LibraryRow[][]>();
  for (const s of plan.sessions) map.set(s.key, s.slots.map((slot) => candidatesFor(LIB, slot, opts)));
  return map;
}

describe('candidatesFor', () => {
  const main: Slot = { role: 'main', pattern: 'squat', sets: 4, reps: '5', rest: 150, rpe: 7 };
  it('leads a strength main squat with the barbell squat and never a ballistic lift', () => {
    const c = candidatesFor(LIB, main, { goal: 'strength', experience: 'training', seed: 'x' });
    expect(c[0].name).toBe('Barbell Full Squat');
    expect(c.map((r) => r.name)).not.toContain('Box Jump');
    expect(c.map((r) => r.name)).not.toContain('Power Clean');
  });
  it('leads a general-goal gym athlete with a real bench, not a gadget push-up', () => {
    const push: Slot = { role: 'main', pattern: 'hpush', sets: 3, reps: '8', rest: 120, rpe: 7 };
    const lib = LIB.concat([row('Push-up Medicine Ball', 'Pectorals', 'other', 'chest')]);
    const c = candidatesFor(lib, push, { goal: 'general', experience: 'training', seed: 'x' });
    expect(['Barbell Bench Press', 'Dumbbell Bench Press']).toContain(c[0].name);
    expect(c.findIndex((r) => r.name === 'Push-up Medicine Ball')).toBeGreaterThan(3);
  });
  it('leads a returning athlete with dumbbells or machines', () => {
    const c = candidatesFor(LIB, main, { goal: 'return', experience: 'returning', seed: 'x' });
    expect(['Dumbbell Goblet Squat', 'Sled 45° Leg Press', 'Bodyweight Squat']).toContain(c[0].name);
  });
  it('keeps deadlifts and crunches away from a pain block', () => {
    const hinge: Slot = { role: 'main', pattern: 'hinge', sets: 3, reps: '10', rest: 90, rpe: 6 };
    const c = candidatesFor(LIB, hinge, { goal: 'pain', experience: 'returning', seed: 'x' });
    expect(c.map((r) => r.name)).not.toContain('Barbell Deadlift');
    expect(c.length).toBeGreaterThan(0);
    const core: Slot = { role: 'core', pattern: 'core', sets: 3, reps: '30s', rest: 45, rpe: 7 };
    const k = candidatesFor(LIB, core, { goal: 'pain', experience: 'returning', seed: 'x' });
    expect(k.map((r) => r.name)).not.toContain('Russian Twist');
  });
  it('puts last block\'s anchor first', () => {
    const c = candidatesFor(LIB, main, { goal: 'general', experience: 'training', anchors: ['barbell front squat'], seed: 'x' });
    expect(c[0].name).toBe('Barbell Front Squat');
  });
  it('fills a muscle accessory only with that muscle', () => {
    const acc: Slot = { role: 'accessory', pattern: 'accessory', muscle: 'triceps', sets: 3, reps: '10', rest: 60, rpe: 7 };
    const c = candidatesFor(LIB, acc, { goal: 'general', experience: 'training', seed: 'x' });
    expect(c.length).toBe(2);
    expect(c.every((r) => String(r.muscle_group).toLowerCase() === 'triceps')).toBe(true);
    expect(eligible(LIB.find((r) => r.name === 'Barbell Curl')!, acc, { goal: 'general', experience: 'training' })).toBe(false);
  });
});

describe('assemble', () => {
  const opts = { goal: 'strength' as const, experience: 'training' as const, seed: 'gerry' };
  it('builds a complete, audited week with no model at all', () => {
    const plan = blueprint({ days: 4, goal: 'strength', tags: { ...TAGS, powerlifting: true }, experience: 'training', week: 1 });
    const week = assemble(plan, candidatesOf(plan, opts), null);
    expect(week).toHaveLength(4);
    for (const s of week) {
      expect(s.exercises.length).toBe(plan.sessions.find((p) => p.key === s.key)!.slots.length);
      expect(s.exercises.every((e) => e.fallback)).toBe(true);
      expect(s.name).toBeTruthy();
    }
    const names = week.flatMap((s) => s.exercises.map((e) => e.row.name));
    expect(names).toContain('Barbell Full Squat');
    expect(names).toContain('Barbell Bench Press');
    expect(names).toContain('Barbell Deadlift');
    expect(auditWeek(week).ok).toBe(true);
  });
  it('keeps the model\'s legal picks and cues, and replaces illegal ones', () => {
    const plan = blueprint({ days: 2, goal: 'general', tags: TAGS, experience: 'training', week: 1 });
    const cands = candidatesOf(plan, { goal: 'general', experience: 'training', seed: 's' });
    const legal = cands.get('full_a')![0][1].name; // second squat option
    const week = assemble(plan, cands, {
      sessions: [{ key: 'full_a', name: 'Heavy squat day', description: 'Squat first, then press and row.', picks: [
        { slot: 1, exercise: legal, cue: 'Knees out, chest up.' },
        { slot: 2, exercise: 'Invented Press 3000', cue: 'x' },
      ] }],
    });
    const a = week.find((s) => s.key === 'full_a')!;
    expect(a.name).toBe('Heavy squat day');
    expect(a.exercises[0].row.name).toBe(legal);
    expect(a.exercises[0].cue).toBe('Knees out, chest up.');
    expect(a.exercises[0].fallback).toBe(false);
    expect(a.exercises[1].fallback).toBe(true);
    expect(a.exercises[1].cue).toMatch(/Shoulder blades/);
    // The session the model skipped is still complete.
    expect(week.find((s) => s.key === 'full_b')!.exercises.length).toBeGreaterThanOrEqual(5);
  });
  it('never repeats an exercise inside one session', () => {
    const plan = blueprint({ days: 5, goal: 'fat_loss', tags: { ...TAGS, running: true }, experience: 'new', week: 3 });
    const week = assemble(plan, candidatesOf(plan, { goal: 'fat_loss', experience: 'new', seed: 'n' }), null);
    for (const s of week) {
      const names = s.exercises.map((e) => e.row.name);
      expect(new Set(names).size).toBe(names.length);
    }
    expect(auditWeek(week).ok).toBe(true);
  });
});

describe('notes and loads', () => {
  it('finds the best completed set per exercise id', () => {
    const best = bestSetsById([
      { exercises: [{ id: 'sq', sets: [{ weight: 135, reps: 8, completed: true, unit: 'lbs' }, { weight: 145, reps: 6, completed: true, unit: 'lbs' }, { weight: 155, reps: 5, completed: false }] }] },
      { exercises: [{ id: 'sq', sets: [{ weight: '145', reps: '7', completed: true }] }] },
    ]);
    expect(best.get('sq')).toEqual({ weight: 145, reps: 7, unit: '' });
  });
  it('suggests the next step by phase', () => {
    const slot: Slot = { role: 'main', pattern: 'squat', sets: 4, reps: '5', rest: 150, rpe: 8 };
    expect(loadHint(undefined, slot, 'build', 'lbs')).toBeNull();
    expect(loadHint({ weight: 135, reps: 5, unit: 'lbs' }, slot, 'build', 'lbs')).toBe('Last: 135 lbs × 5. Try 140 lbs this week.');
    expect(loadHint({ weight: 60, reps: 5, unit: 'kg' }, slot, 'build', 'lbs')).toBe('Last: 60 kg × 5. Try 62.5 kg this week.');
    expect(loadHint({ weight: 135, reps: 3, unit: 'lbs' }, slot, 'build', 'lbs')).toMatch(/add a rep before adding weight/);
    expect(loadHint({ weight: 200, reps: 5, unit: 'lbs' }, slot, 'deload', 'lbs')).toBe('Last: 200 lbs × 5. Deload: about 140 lbs.');
  });
  it('times holds and carries, counts raises', () => {
    const core = (name: string, sets = 3) => ({ row: LIB.find((r) => r.name === name)!, slot: { role: 'core' as const, pattern: 'core' as const, sets, reps: '30-45s', rest: 45, rpe: 7 }, cue: '', fallback: false });
    expect(repsFor(core('Plank'))).toBe('30-45s');
    expect(repsFor(core('Hanging Leg Raise'))).toBe('10-15');
    expect(repsFor(core('Hanging Leg Raise', 2))).toBe('10-12');
    expect(noteFor(core('Hanging Leg Raise'), 'base', null)).toMatch(/^Slow reps/);
    const plan = blueprint({ days: 5, goal: 'general', tags: TAGS, experience: 'training', week: 1 });
    const carry = plan.sessions.find((s) => s.key === 'pull_a')!.slots.find((s) => s.pattern === 'carry')!;
    expect(carry.reps).toBe('30-45s');
    expect(plan.rationale).toMatch(/^An upper\/lower plus/);
  });
  it('writes the effort, the warm-up, the cue and the load into one note', () => {
    const ex = { row: LIB[0], slot: { role: 'main' as const, pattern: 'squat' as const, sets: 4, reps: '5', rest: 150, rpe: 7 }, cue: 'Brace hard.', fallback: false };
    const note = noteFor(ex, 'base', 'Last: 135 lbs × 5. Start there and add a rep before adding weight.');
    expect(note).toBe('RPE 7 — leave 3 reps in the tank. Warm up with 2 lighter sets first. Brace hard. Last: 135 lbs × 5. Start there and add a rep before adding weight.');
    const fin = noteFor({ ...ex, slot: { role: 'finisher', pattern: 'conditioning', sets: 1, reps: '10 min', rest: 0, rpe: 7 } }, 'base', null);
    expect(fin).toMatch(/^Conversational pace/);
  });
});

describe('prompt', () => {
  it('lists every slot with its options and the athlete facts', () => {
    const plan = blueprint({ days: 3, goal: 'return', tags: TAGS, experience: 'returning', week: 1 });
    const cands = candidatesOf(plan, { goal: 'return', experience: 'returning', seed: 'p' });
    const prompt = buildProgramPrompt(plan, cands, { name: 'Gerry', goalLabel: 'Get back into it after a break', goals: ['Running'], experienceLabel: 'Trained before, out of the habit', setting: 'home', limitation: 'sore left knee' });
    expect(prompt).toMatch(/Athlete Gerry: main goal = Get back into it after a break/);
    expect(prompt).toMatch(/must work around: sore left knee/);
    expect(prompt).toMatch(/Session key "full_a"/);
    expect(prompt).toMatch(/slot 1 — main squat, 3×8 @RPE 6.5:/);
    expect(prompt).toMatch(/Dumbbell Goblet Squat/);
    expect(prompt).not.toMatch(/"changes"/);
    expect(buildProgramPrompt(plan, cands, { goalLabel: 'x', goals: [], experienceLabel: 'y', setting: 'z', adapt: true })).toMatch(/"changes"/);
  });
});

describe('block', () => {
  const block: SoloBlock = { started: '2026-09-01', week: 2, split: 'upper_lower', goal: 'strength', days: 4, anchors: ['barbell full squat'], rationale: 'r' };
  it('starts fresh, advances weekly, and rolls over after the deload', () => {
    expect(nextBlock(null, 'strength', 4, '2026-09-08', 'first')).toEqual({ week: 1, started: '2026-09-08', fresh: true });
    expect(nextBlock(block, 'strength', 4, '2026-09-08', 'adapt')).toEqual({ week: 3, started: '2026-09-01', fresh: false });
    expect(nextBlock({ ...block, week: 4 }, 'strength', 4, '2026-09-08', 'adapt')).toEqual({ week: 1, started: '2026-09-08', fresh: true });
    expect(nextBlock(block, 'strength', 4, '2026-09-08', 'rebuild')).toEqual({ week: 2, started: '2026-09-01', fresh: false });
    expect(nextBlock(block, 'fat_loss', 4, '2026-09-08', 'rebuild').fresh).toBe(true);
    expect(nextBlock(block, 'strength', 3, '2026-09-08', 'rebuild').fresh).toBe(true);
  });
  it('describes the block in one line for the corner', () => {
    expect(describeBlock(block)).toBe('week 2 of 4 (build), upper lower, 4 days: r');
    expect(describeBlock(null)).toBe('');
  });
});
