// lib/muscles.ts
// Canonical muscle region model for the anatomy muscle map.
//
// Region ids are stable — components/anatomy/MuscleMap.tsx keys its SVG paths
// on them. normalizeMuscle() maps the free-form muscle strings that actually
// exist in the app's exercise data onto these regions:
//   - muscle_group: capitalized ExerciseDB target names written by
//     scripts/seed-exercises.mjs and lib/exercisedb.ts (e.g. "Pectorals",
//     "Delts", "Upper Back", "Cardiovascular System", "Full Body")
//   - the curated MUSCLE_GROUPS picker list in app/create-exercise.tsx /
//     supabase/functions/generate-exercise (e.g. "Latissimus Dorsi",
//     "Trapezius", "Deltoids", "Quadriceps")
//   - secondary_muscles: raw lowercase ExerciseDB secondaryMuscles written by
//     scripts/backfill-details.mjs (e.g. "wrist flexors", "rotator cuff",
//     "lower back", "hip flexors")

export type MuscleRegionId =
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'obliques'
  | 'lats'
  | 'traps'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves';

export interface MuscleRegion {
  id: MuscleRegionId;
  label: string;
  side: 'front' | 'back' | 'both';
}

export const REGIONS: MuscleRegion[] = [
  { id: 'neck', label: 'Neck', side: 'both' },
  { id: 'shoulders', label: 'Shoulders', side: 'both' },
  { id: 'chest', label: 'Chest', side: 'front' },
  { id: 'biceps', label: 'Biceps', side: 'front' },
  { id: 'triceps', label: 'Triceps', side: 'back' },
  { id: 'forearms', label: 'Forearms', side: 'both' },
  { id: 'core', label: 'Core', side: 'front' },
  { id: 'obliques', label: 'Obliques', side: 'front' },
  { id: 'lats', label: 'Lats', side: 'back' },
  { id: 'traps', label: 'Traps', side: 'back' },
  { id: 'lower_back', label: 'Lower back', side: 'back' },
  { id: 'glutes', label: 'Glutes', side: 'back' },
  { id: 'quads', label: 'Quads', side: 'front' },
  { id: 'hamstrings', label: 'Hamstrings', side: 'back' },
  { id: 'calves', label: 'Calves', side: 'both' },
];

export const REGION_BY_ID: Record<MuscleRegionId, MuscleRegion> = REGIONS.reduce(
  (acc, r) => {
    acc[r.id] = r;
    return acc;
  },
  {} as Record<MuscleRegionId, MuscleRegion>
);

export function regionLabel(id: string): string {
  return REGION_BY_ID[id as MuscleRegionId]?.label ?? id;
}

// Alias table built from the values actually present in the data (see header).
// Keys are pre-normalized: lowercase, punctuation collapsed to single spaces.
const ALIASES: Record<string, MuscleRegionId> = {
  // neck
  neck: 'neck',
  'levator scapulae': 'neck',
  sternocleidomastoid: 'neck',

  // shoulders
  shoulders: 'shoulders',
  shoulder: 'shoulders',
  delts: 'shoulders',
  deltoids: 'shoulders',
  deltoid: 'shoulders',
  'rear deltoids': 'shoulders',
  'front deltoids': 'shoulders',
  'rotator cuff': 'shoulders',

  // chest
  chest: 'chest',
  pectorals: 'chest',
  pecs: 'chest',
  'upper chest': 'chest',
  'serratus anterior': 'chest',

  // biceps
  biceps: 'biceps',
  brachialis: 'biceps',

  // triceps
  triceps: 'triceps',

  // forearms
  forearms: 'forearms',
  forearm: 'forearms',
  wrists: 'forearms',
  'wrist flexors': 'forearms',
  'wrist extensors': 'forearms',
  'grip muscles': 'forearms',

  // core
  core: 'core',
  abs: 'core',
  abdominals: 'core',
  'lower abs': 'core',
  'upper abs': 'core',
  'hip flexors': 'core',
  'core stabilizers': 'core',

  // obliques
  obliques: 'obliques',

  // lats — generic "back" maps here as the dominant back-training region
  lats: 'lats',
  lat: 'lats',
  'latissimus dorsi': 'lats',
  back: 'lats',

  // traps — "upper back" (ExerciseDB target) covers traps/rhomboids territory
  traps: 'traps',
  trapezius: 'traps',
  'upper back': 'traps',
  rhomboids: 'traps',

  // lower back
  'lower back': 'lower_back',
  spine: 'lower_back',
  'erector spinae': 'lower_back',

  // glutes
  glutes: 'glutes',
  'gluteus maximus': 'glutes',
  abductors: 'glutes',

  // quads — generic "legs" and the inner-thigh groups land here
  quads: 'quads',
  quadriceps: 'quads',
  adductors: 'quads',
  groin: 'quads',
  'inner thighs': 'quads',
  legs: 'quads',

  // hamstrings
  hamstrings: 'hamstrings',
  hamstring: 'hamstrings',

  // calves
  calves: 'calves',
  calf: 'calves',
  soleus: 'calves',
  shins: 'calves',
  'ankle stabilizers': 'calves',
  'tibialis anterior': 'calves',
};

// Deliberately unmapped (return null): 'cardiovascular system', 'cardiovascular',
// 'cardio', 'full body', 'feet arches' — no meaningful single region.

/**
 * Maps a free-form muscle string from exercise data to a canonical region id.
 * Returns null for unknown or non-regional values ("Full Body", "Cardiovascular System").
 */
export function normalizeMuscle(raw: string): MuscleRegionId | null {
  if (!raw || typeof raw !== 'string') return null;
  const key = raw
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/**
 * Resolves an exercise's primary and secondary muscle regions.
 * Secondary regions never repeat the primary region.
 */
export function musclesForExercise(exercise: {
  muscle_group?: string;
  secondary_muscles?: string[];
}): { primary: MuscleRegionId[]; secondary: MuscleRegionId[] } {
  const primary: MuscleRegionId[] = [];
  const primaryId = exercise.muscle_group ? normalizeMuscle(exercise.muscle_group) : null;
  if (primaryId) primary.push(primaryId);

  const secondary: MuscleRegionId[] = [];
  for (const raw of exercise.secondary_muscles ?? []) {
    const id = normalizeMuscle(raw);
    if (id && !primary.includes(id) && !secondary.includes(id)) {
      secondary.push(id);
    }
  }
  return { primary, secondary };
}
