/**
 * workoutMuscles — whole-workout muscle aggregation for the season track's
 * node cards. Same counting pattern as WorkoutPreview's Targets card
 * (components/client-tabs/explore/WorkoutPreview.tsx), reduced to what a
 * 68px thumbnail and a one-line focus label need.
 *
 * Real data only: a workout with no joined exercises, or exercises with no
 * mappable muscle strings, returns null — callers render nothing rather than
 * a placeholder body.
 */
import { musclesForExercise, regionLabel, REGION_BY_ID, MuscleRegionId } from '../../../lib/muscles';

export type WorkoutMuscleInfo = {
  primary: MuscleRegionId[];
  secondary: MuscleRegionId[];
  /** Top 2–3 region labels by how many exercises hit them, primaries first. */
  topLabels: string[];
  /** Smallest silhouette that shows every highlighted region. */
  view: 'front' | 'back' | 'both';
};

/** Pick the cheapest MuscleMap view that still shows every region. */
function viewForRegions(regions: MuscleRegionId[]): 'front' | 'back' | 'both' {
  let needsFront = false;
  let needsBack = false;
  regions.forEach((id) => {
    const side = REGION_BY_ID[id]?.side;
    if (side === 'front') needsFront = true;
    else if (side === 'back') needsBack = true;
  });
  if (needsFront && needsBack) return 'both';
  if (needsBack) return 'back';
  return 'front';
}

/**
 * Aggregates muscles across a workout's joined exercises
 * (workout_exercises(*, exercises(*))). Null when nothing maps.
 */
export function aggregateWorkoutMuscles(workout: any): WorkoutMuscleInfo | null {
  const rows: any[] = workout?.workout_exercises || [];
  if (rows.length === 0) return null;

  const primaryCounts = new Map<MuscleRegionId, number>();
  const secondaryCounts = new Map<MuscleRegionId, number>();
  rows.forEach((we: any) => {
    const base = we?.exercises;
    if (!base) return;
    const { primary, secondary } = musclesForExercise(base);
    primary.forEach((id) => primaryCounts.set(id, (primaryCounts.get(id) || 0) + 1));
    secondary.forEach((id) => secondaryCounts.set(id, (secondaryCounts.get(id) || 0) + 1));
  });

  const primary = [...primaryCounts.keys()];
  const secondary = [...secondaryCounts.keys()].filter((id) => !primaryCounts.has(id));
  if (primary.length === 0 && secondary.length === 0) return null;

  const ranked = [
    ...[...primaryCounts.entries()].map(([id, count]) => ({ id, count, isPrimary: true })),
    ...secondary.map((id) => ({ id, count: secondaryCounts.get(id) || 0, isPrimary: false })),
  ].sort((a, b) => (a.isPrimary === b.isPrimary ? b.count - a.count : a.isPrimary ? -1 : 1));

  const topLabels = ranked.slice(0, 3).map((r) => regionLabel(r.id).toLowerCase());

  return {
    primary,
    secondary,
    topLabels,
    view: viewForRegions([...primary, ...secondary]),
  };
}

/**
 * The one-line "what will this do" label: the coach's own description when
 * they wrote one, else a "Targets …" line from the muscle aggregate, else null.
 */
export function focusLineForWorkout(workout: any, info: WorkoutMuscleInfo | null): string | null {
  const desc = typeof workout?.description === 'string' ? workout.description.trim() : '';
  if (desc) return desc.replace(/\s+/g, ' ');
  if (info && info.topLabels.length > 0) {
    const labels = info.topLabels;
    const joined =
      labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
    return `Targets ${joined}`;
  }
  return null;
}
