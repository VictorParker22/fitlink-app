/**
 * SeasonTrack — the whole season as a vertical journey, grouped by week.
 *
 * Week grouping comes from lib/passWeeks.ts (the single source of week math);
 * this component only organizes what that returns. Week-start "Week N: …"
 * milestone labels become the week's own title (or its rest flag) instead of
 * rendering as rows — the same convention my-pass.tsx uses pre-purchase, so
 * the athlete sees one vocabulary before and after buying.
 */
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { weekStartIndices, weekOfPosition, totalWeeks } from '../../../lib/passWeeks';
import type { TrackNode } from '../../../context/AppContext';
import WeekSection, { type SeasonNode } from './WeekSection';
import type { WorkoutMuscleInfo } from './workoutMuscles';

const WEEK_LABEL_RE = /^Week (\d+):\s*/;

type WeekGroup = {
  week: number;
  title: string | null;
  isRestWeek: boolean;
  nodes: SeasonNode[];
};

type Props = {
  track: TrackNode[];
  durationWeeks: number | null;
  /** Nodes completed on the enrollment. */
  position: number;
  currentWeek: number;
  seasonCompleted: boolean;
  workoutById: (id?: string) => any;
  /** Memoized per-workout muscle aggregate (see workouts.tsx). */
  muscleInfoFor: (workoutRow: any) => WorkoutMuscleInfo | null;
  coachFirst: string;
  onOpenWorkout: (workoutRow: any, opts: { viewOnly: boolean }) => void;
  onOpenDiet: () => void;
  reducedMotion: boolean;
  /** Reports each week's y offset within this component, for strip-tap jumps. */
  onWeekLayout?: (week: number, y: number) => void;
};

export default function SeasonTrack({
  track,
  durationWeeks,
  position,
  currentWeek,
  seasonCompleted,
  workoutById,
  muscleInfoFor,
  coachFirst,
  onOpenWorkout,
  onOpenDiet,
  reducedMotion,
  onWeekLayout,
}: Props) {
  const weeks = useMemo<WeekGroup[]>(() => {
    const count = totalWeeks(track, durationWeeks);
    const starts = new Set(weekStartIndices(track, durationWeeks));
    const groups: WeekGroup[] = Array.from({ length: count }, (_, i) => ({
      week: i + 1,
      title: null,
      isRestWeek: false,
      nodes: [],
    }));

    track.forEach((node, i) => {
      const w = Math.min(weekOfPosition(i, track, durationWeeks), count);
      const group = groups[w - 1];

      // A week-start "Week N: …" milestone names the week instead of being a row.
      if (node.type === 'milestone' && node.label && WEEK_LABEL_RE.test(node.label) && starts.has(i)) {
        const text = node.label.replace(WEEK_LABEL_RE, '').trim();
        if (/^rest week$/i.test(text)) group.isRestWeek = true;
        else if (text) group.title = text;
        return;
      }
      group.nodes.push({ index: i, node });
    });

    return groups;
  }, [track, durationWeeks]);

  return (
    <View style={{ gap: 22 }}>
      {weeks.map((g, i) => (
        <View key={g.week} onLayout={(e) => onWeekLayout?.(g.week, e.nativeEvent.layout.y)}>
          <WeekSection
            week={g.week}
            title={g.title}
            isRestWeek={g.isRestWeek}
            nodes={g.nodes}
            position={position}
            status={
              seasonCompleted || g.week < currentWeek
                ? 'past'
                : g.week === currentWeek
                  ? 'current'
                  : 'future'
            }
            seasonCompleted={seasonCompleted}
            workoutById={workoutById}
            muscleInfoFor={muscleInfoFor}
            coachFirst={coachFirst}
            onOpenWorkout={onOpenWorkout}
            onOpenDiet={onOpenDiet}
            reducedMotion={reducedMotion}
            animationIndex={i}
          />
        </View>
      ))}
    </View>
  );
}
