import { ImageSourcePropType } from 'react-native';

// Workout emblem images — each muscle group gets a distinctive gaming badge
const EMBLEM_IMAGES = {
  chest: require('../assets/emblems/emblem_chest.png'),
  back: require('../assets/emblems/emblem_back.png'),
  legs: require('../assets/emblems/emblem_legs.png'),
  arms: require('../assets/emblems/emblem_arms.png'),
  shoulders: require('../assets/emblems/emblem_shoulders.png'),
  core: require('../assets/emblems/emblem_core.png'),
  cardio: require('../assets/emblems/emblem_cardio.png'),
  fullbody: require('../assets/emblems/emblem_fullbody.png'),
} as const;

type EmblemKey = keyof typeof EMBLEM_IMAGES;

// Maps muscle group / category keywords to an emblem key
const KEYWORD_MAP: [string[], EmblemKey][] = [
  [['chest', 'pec', 'bench', 'push'], 'chest'],
  [['back', 'lat', 'row', 'pull', 'deadlift'], 'back'],
  [['leg', 'quad', 'hamstring', 'glute', 'squat', 'calf', 'calves', 'hip'], 'legs'],
  [['arm', 'bicep', 'tricep', 'curl', 'forearm'], 'arms'],
  [['shoulder', 'delt', 'deltoid', 'press', 'overhead'], 'shoulders'],
  [['core', 'ab', 'abs', 'oblique', 'plank', 'crunch'], 'core'],
  [['cardio', 'hiit', 'run', 'sprint', 'endurance', 'conditioning', 'heart'], 'cardio'],
  [['full', 'total', 'compound', 'functional', 'circuit', 'strength'], 'fullbody'],
];

// Deterministic emblem assignment by hashing the workout ID
const EMBLEM_KEYS = Object.keys(EMBLEM_IMAGES) as EmblemKey[];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit int
  }
  return Math.abs(hash);
}

/**
 * Get the emblem image for a workout based on its exercises' muscle groups.
 * Falls back to a deterministic selection based on workout ID.
 */
export function getWorkoutEmblem(
  workoutId: string,
  workoutName?: string,
  muscleGroups?: string[],
): ImageSourcePropType {
  // Try to match by muscle groups first
  if (muscleGroups && muscleGroups.length > 0) {
    const combined = muscleGroups.join(' ').toLowerCase();
    for (const [keywords, key] of KEYWORD_MAP) {
      if (keywords.some(kw => combined.includes(kw))) {
        return EMBLEM_IMAGES[key];
      }
    }
  }

  // Try to match by workout name
  if (workoutName) {
    const lower = workoutName.toLowerCase();
    for (const [keywords, key] of KEYWORD_MAP) {
      if (keywords.some(kw => lower.includes(kw))) {
        return EMBLEM_IMAGES[key];
      }
    }
  }

  // Deterministic fallback based on workout ID
  const index = hashString(workoutId) % EMBLEM_KEYS.length;
  return EMBLEM_IMAGES[EMBLEM_KEYS[index]];
}


export { EMBLEM_IMAGES };
