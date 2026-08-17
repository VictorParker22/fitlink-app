/**
 * One definition of "workouts completed", used by every surface in the app.
 *
 * There is NO `clients.completed_workouts` column — it never existed, so every
 * screen that read it rendered 0 forever. The real completion record is spread
 * across two tables, and this module is the single place that reconciles them:
 *
 *   1. `client_workouts` rows with status = 'completed'
 *      — an assigned workout the athlete finished. Written unconditionally by
 *        ClientContext.completeWorkoutWithLog and markWorkoutComplete.
 *
 *   2. `client_workout_logs` rows with `client_workout_id IS NULL`
 *      — a logged session that was NOT an assignment: the strength-session
 *        player writing a season-track or ad-hoc workout. These have no
 *        client_workouts row at all, so they would otherwise be invisible.
 *
 * Summing exactly those two sets yields ONE count per finished session with no
 * double counting: when the player finishes an assignment it writes a log row
 * *with* client_workout_id AND flips the assignment to 'completed', and the
 * null-id filter keeps that pair from being counted twice.
 *
 * Known and accepted gap: a season-track workout advanced via
 * ClientContext.completeTrackWorkout without opening the player writes only a
 * `track_events` row, so it is not counted. track_events is not fetched on the
 * coach side, and inventing a second definition there would break the one
 * consistent number this module exists to guarantee.
 */

/** Minimal shape needed from a `client_workouts` row. */
export interface CompletedWorkoutSource {
  client_id: string;
  status?: string | null;
}

/** Minimal shape needed from a `client_workout_logs` row. */
export interface WorkoutLogSource {
  client_id: string;
  client_workout_id?: string | null;
}

/**
 * Build a clientId → completed-workout-count map in a single pass.
 *
 * Deliberately takes already-fetched arrays rather than querying: the coach
 * roster renders every client at once, so a per-row query is not an option.
 */
export function buildCompletedWorkoutCounts(
  clientWorkouts: CompletedWorkoutSource[],
  workoutLogs: WorkoutLogSource[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const cw of clientWorkouts) {
    if (cw?.status !== 'completed' || !cw.client_id) continue;
    counts[cw.client_id] = (counts[cw.client_id] || 0) + 1;
  }
  for (const log of workoutLogs) {
    // Assignment-linked logs are already counted via client_workouts above.
    if (!log?.client_id || log.client_workout_id) continue;
    counts[log.client_id] = (counts[log.client_id] || 0) + 1;
  }
  return counts;
}

/** Same definition, for the single-athlete case where the rows are already local. */
export function countCompletedWorkoutsForClient(
  clientWorkouts: CompletedWorkoutSource[],
  workoutLogs: WorkoutLogSource[],
): number {
  const completedAssignments = clientWorkouts.filter((cw) => cw?.status === 'completed').length;
  const standaloneSessions = workoutLogs.filter((log) => log && !log.client_workout_id).length;
  return completedAssignments + standaloneSessions;
}
