/**
 * Model-backed eval for the Solo program builder (run via `npm run
 * eval:program`; skipped in the normal test run). Four intakes, the real
 * prompt and response schema, the real assembly: the model must choose
 * legal options nearly everywhere, name every session, and write cues that
 * are cues.
 */
import {
  blueprint, candidatesFor, assemble, auditWeek, buildProgramPrompt, PROGRAM_SCHEMA,
  goalKeyFrom, tagsFrom, experienceFrom, type LibraryRow, type WeekPlan,
} from '../../supabase/functions/solo-program/plan';

const RUN = process.env.RUN_MODEL_EVALS === '1' && !!process.env.GEMINI_API_KEY;
const run = RUN ? describe : describe.skip;

let n = 0;
const row = (name: string, muscle_group: string, equipment: string, category = 'legs', secondary: string[] = []): LibraryRow =>
  ({ id: `ex-${++n}`, name, muscle_group, equipment, category, secondary_muscles: secondary });

// A gym's worth of the library, named as ExerciseDB names them.
const LIB: LibraryRow[] = [
  row('Barbell Full Squat', 'Quads', 'barbell'), row('Barbell Front Squat', 'Glutes', 'barbell'), row('Dumbbell Goblet Squat', 'Quads', 'dumbbell'), row('Sled 45° Leg Press', 'Quads', 'machine'), row('Lever Hack Squat', 'Quads', 'machine'), row('Bodyweight Squat', 'Quads', 'bodyweight'), row('Barbell Zercher Squat', 'Quads', 'barbell'),
  row('Barbell Deadlift', 'Glutes', 'barbell'), row('Trap Bar Deadlift', 'Glutes', 'barbell'), row('Barbell Romanian Deadlift', 'Glutes', 'barbell', 'legs', ['Hamstrings']), row('Dumbbell Romanian Deadlift', 'Hamstrings', 'dumbbell'), row('Barbell Hip Thrust', 'Glutes', 'barbell'), row('Kettlebell Swing', 'Glutes', 'kettlebell'), row('Glute Bridge', 'Glutes', 'bodyweight'), row('Barbell Good Morning', 'Hamstrings', 'barbell'),
  row('Dumbbell Lunge', 'Glutes', 'dumbbell'), row('Dumbbell Walking Lunge', 'Glutes', 'dumbbell'), row('Dumbbell Single Leg Split Squat', 'Quads', 'dumbbell'), row('Dumbbell Step-up', 'Glutes', 'dumbbell'), row('Bodyweight Reverse Lunge', 'Glutes', 'bodyweight'),
  row('Barbell Bench Press', 'Pectorals', 'barbell', 'chest'), row('Barbell Incline Bench Press', 'Pectorals', 'barbell', 'chest'), row('Dumbbell Bench Press', 'Pectorals', 'dumbbell', 'chest'), row('Dumbbell Incline Bench Press', 'Pectorals', 'dumbbell', 'chest'), row('Push-up', 'Pectorals', 'bodyweight', 'chest'), row('Cable Fly', 'Pectorals', 'cable', 'chest'), row('Lever Chest Press', 'Pectorals', 'machine', 'chest'), row('Chest Dip', 'Pectorals', 'bodyweight', 'chest'),
  row('Barbell Standing Military Press', 'Delts', 'barbell', 'shoulders'), row('Barbell Seated Overhead Press', 'Delts', 'barbell', 'shoulders'), row('Dumbbell Shoulder Press', 'Delts', 'dumbbell', 'shoulders'), row('Dumbbell Arnold Press', 'Delts', 'dumbbell', 'shoulders'), row('Pike Push-up', 'Delts', 'bodyweight', 'shoulders'), row('Lever Shoulder Press', 'Delts', 'machine', 'shoulders'),
  row('Barbell Bent Over Row', 'Upper Back', 'barbell', 'back'), row('Dumbbell Bent Over Row', 'Upper Back', 'dumbbell', 'back'), row('Dumbbell One Arm Row', 'Upper Back', 'dumbbell', 'back'), row('Cable Seated Row', 'Upper Back', 'cable', 'back'), row('Lever T-bar Row', 'Upper Back', 'machine', 'back'), row('Cable Face Pull', 'Delts', 'cable', 'shoulders'), row('Dumbbell Rear Delt Raise', 'Delts', 'dumbbell', 'shoulders'), row('Band Pull Apart', 'Upper Back', 'bands', 'back'),
  row('Pull-up', 'Lats', 'bodyweight', 'back'), row('Chin-up', 'Lats', 'bodyweight', 'back'), row('Cable Lat Pulldown Full Range Of Motion', 'Lats', 'cable', 'back'), row('Assisted Pull-up', 'Lats', 'machine', 'back'), row('Band Assisted Pull-up', 'Lats', 'bands', 'back'),
  row('Plank', 'Abs', 'bodyweight', 'core'), row('Dead Bug', 'Abs', 'bodyweight', 'core'), row('Hanging Leg Raise', 'Abs', 'bodyweight', 'core'), row('Cable Pallof Press', 'Abs', 'cable', 'core'), row('Ab Wheel Rollout', 'Abs', 'other', 'core'), row('Side Plank', 'Abs', 'bodyweight', 'core'), row('Russian Twist', 'Abs', 'bodyweight', 'core'),
  row('Farmers Walk', 'Forearms', 'dumbbell', 'arms'), row('Suitcase Carry', 'Abs', 'dumbbell', 'core'),
  row('Run', 'Cardiovascular System', 'bodyweight', 'cardio'), row('Jump Rope', 'Cardiovascular System', 'bodyweight', 'cardio'), row('Burpee', 'Cardiovascular System', 'bodyweight', 'cardio'), row('Stationary Bike', 'Cardiovascular System', 'machine', 'cardio'), row('Rowing Machine', 'Cardiovascular System', 'machine', 'cardio'),
  row('Lever Seated Leg Curl', 'Hamstrings', 'machine'), row('Lever Lying Leg Curl', 'Hamstrings', 'machine'), row('Lever Leg Extension', 'Quads', 'machine'), row('Dumbbell Standing Calf Raise', 'Calves', 'dumbbell'), row('Lever Seated Calf Raise', 'Calves', 'machine'), row('Cable Hip Adduction', 'Adductors', 'cable'), row('Cable Hip Abduction', 'Abductors', 'cable'), row('Cable Kickback', 'Glutes', 'cable'),
  row('Dumbbell Lateral Raise', 'Delts', 'dumbbell', 'shoulders'), row('Cable Lateral Raise', 'Delts', 'cable', 'shoulders'), row('Barbell Curl', 'Biceps', 'barbell', 'arms'), row('Dumbbell Hammer Curl', 'Biceps', 'dumbbell', 'arms'), row('Cable Curl', 'Biceps', 'cable', 'arms'), row('Cable Triceps Pushdown', 'Triceps', 'cable', 'arms'), row('Dumbbell Skull Crusher', 'Triceps', 'dumbbell', 'arms'), row('Dumbbell Overhead Triceps Extension', 'Triceps', 'dumbbell', 'arms'), row('Dumbbell Wrist Curl', 'Forearms', 'dumbbell', 'arms'),
  row('Standing Hamstring Stretch', 'Hamstrings', 'bodyweight'), row('Hip Flexor Stretch', 'Quads', 'bodyweight'), row('Ankle Circles', 'Calves', 'bodyweight'),
  row('Power Clean', 'Glutes', 'barbell'), row('Box Jump', 'Quads', 'bodyweight'),
];

interface Intake { label: string; days: number; goalKey: string | null; goal: string; goals: string[]; experience: string; setting: string; limitation?: string; week: number }
const INTAKES: Intake[] = [
  { label: 'powerlifter, 4 days', days: 4, goalKey: 'strength', goal: 'Get stronger on the big lifts', goals: ['Powerlifting', 'Performance'], experience: 'Training now, want it structured', setting: 'full commercial gym', week: 1 },
  { label: 'returning, 3 days, sore knee', days: 3, goalKey: 'return', goal: 'Get back into it after a break', goals: ['Weight management', 'Running'], experience: 'Trained before, out of the habit', setting: 'a coach\'s studio: barbells, dumbbells, kettlebells, cables', limitation: 'sore left knee', week: 2 },
  { label: 'fat loss, 5 days, new', days: 5, goalKey: 'fat_loss', goal: 'Lose fat', goals: ['Weight management', 'Conditioning'], experience: 'Never trained', setting: 'full commercial gym', week: 3 },
  { label: 'pain, 2 days', days: 2, goalKey: 'pain', goal: 'Train around pain', goals: ['Mobility'], experience: 'Trained before, out of the habit', setting: 'full commercial gym', limitation: 'lower back pain when bending', week: 4 },
];

async function callGemini(prompt: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: PROGRAM_SCHEMA, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 4000 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
  return JSON.parse(text);
}

run('solo program builder against Gemini', () => {
  jest.setTimeout(120_000);
  for (const intake of INTAKES) {
    it(`writes a legal, complete, cued week for: ${intake.label}`, async () => {
      const goal = goalKeyFrom(intake.goalKey, intake.goal, intake.goals);
      const tags = tagsFrom(intake.goals);
      const experience = experienceFrom(intake.experience);
      const plan: WeekPlan = blueprint({ days: intake.days, goal, tags, experience, week: intake.week, limitation: intake.limitation });
      const used = new Set<string>();
      const candidates = new Map<string, LibraryRow[][]>();
      for (const s of plan.sessions) {
        const lists = s.slots.map((slot) => candidatesFor(LIB, slot, { goal, experience, used, seed: intake.label, limit: 8 }));
        candidates.set(s.key, lists);
      }
      const prompt = buildProgramPrompt(plan, candidates, { name: 'Eval', goalLabel: intake.goal, goals: intake.goals, experienceLabel: intake.experience, setting: intake.setting, limitation: intake.limitation, adapt: intake.week > 1 });
      const output = await callGemini(prompt);
      const week = assemble(plan, candidates, output);

      const total = week.reduce((a, s) => a + s.exercises.length, 0);
      const fallbacks = week.reduce((a, s) => a + s.exercises.filter((e) => e.fallback).length, 0);
      const audit = auditWeek(week);
      const report = week.map((s) => `${s.name}: ${s.exercises.map((e) => `${e.row.name}${e.fallback ? '*' : ''} (${e.slot.sets}×${e.slot.reps}) — ${e.cue}`).join('; ')}`).join('\n');
      console.log(`\n[${intake.label}] model picks ${total - fallbacks}/${total}, audit ${audit.ok ? 'ok' : audit.problems.join('; ')}\n${report}\n${output.changes ? `changes: ${output.changes}` : ''}`);

      expect(audit.ok).toBe(true);
      expect(fallbacks / total).toBeLessThanOrEqual(0.2);
      for (const s of week) {
        expect(s.name.length).toBeGreaterThan(2);
        for (const e of s.exercises) {
          const words = e.cue.split(/\s+/).length;
          expect(words).toBeGreaterThanOrEqual(3);
          expect(words).toBeLessThanOrEqual(24);
        }
      }
      if (goal === 'strength') {
        const names = week.flatMap((s) => s.exercises.map((e) => e.row.name));
        expect(names).toEqual(expect.arrayContaining(['Barbell Full Squat', 'Barbell Bench Press', 'Barbell Deadlift']));
      }
      if (goal === 'pain') {
        const names = week.flatMap((s) => s.exercises.map((e) => e.row.name.toLowerCase()));
        expect(names.some((x) => /deadlift|good morning|jump|burpee|clean/.test(x))).toBe(false);
      }
      if (intake.week > 1) expect(typeof output.changes).toBe('string');
    });
  }
});
