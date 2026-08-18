/**
 * sessionCompletionCache.ts
 *
 * NOTE ON LOCATION: this lives in lib/, not app/. Expo Router treats every
 * file under app/ as a ROUTE, so sitting in app/session/ made the router try
 * to render a helper as a screen — "missing the required default export" on
 * every web launch. Non-route modules belong outside app/.
 *
 * Module-level singleton that bridges exercise data from the active tracker
 * ([id].tsx in track mode) to the session complete screen (complete.tsx).
 *
 * Why not URL params?
 *   Exercise set data (sets × reps × weight per exercise) can be several KB.
 *   URL encoding this is brittle. A module-level cache is safe here because:
 *   - The tracker always navigates IMMEDIATELY to complete.tsx after setting.
 *   - complete.tsx reads and clears it on mount.
 *   - The cache is cleared after read so stale data never leaks.
 *
 * Usage:
 *   Tracker:  setCompletionData({ durationSeconds, exercises })
 *             router.push('/session/complete?sessionId=xxx')
 *   Complete: const data = getCompletionData(); clearCompletionData();
 */

export interface CompletedSet {
  weight: string;
  reps: string;
  completed: boolean;
}

export interface CompletedExercise {
  exerciseName: string;
  muscleGroup: string;
  targetSets: number;
  targetReps: number;
  sets: CompletedSet[];
}

export interface CompletionData {
  durationSeconds: number;
  exercises: CompletedExercise[];
}

let _cache: CompletionData | null = null;

export function setCompletionData(data: CompletionData): void {
  _cache = data;
}

export function getCompletionData(): CompletionData | null {
  return _cache;
}

export function clearCompletionData(): void {
  _cache = null;
}
