/**
 * SeasonTrack — the whole season as a vertical journey, grouped by week.
 *
 * Week grouping comes from lib/passWeeks.ts (the single source of week math);
 * this component only organizes what that returns. Week-start "Week N: …"
 * milestone labels become the week's own title (or its rest flag) instead of
 * rendering as rows — the same convention my-pass.tsx uses pre-purchase, so
 * the athlete sees one vocabulary before and after buying.
 *
 * COHORTS: when the enrolled plan has a real starts_on, each node's true
 * calendar date is resolved here once (lib/cohort.ts dateForNode) and handed
 * to WeekSection, which uses it for the dated eyebrow and the Today/Missed
 * treatments. Evergreen passes get date = null everywhere and are unchanged.
 *
 * CLASS NODES: a coach can place one of their own published classes into a
 * week. The rows are resolved here in one query keyed on the class ids the
 * track actually references (not a catalog fetch), so WeekSection can show
 * real duration/category meta instead of a bare label. RLS keeps this honest
 * — an athlete only reads the classes of the coach they're a client of, see
 * supabase/migrations/scope_classes_to_coach.sql. Anything the query doesn't
 * return simply renders without meta.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { weekStartIndices, weekOfPosition, totalWeeks } from '../../../lib/passWeeks';
import { isCohort, dateForNode, type CohortFields } from '../../../lib/cohort';
import { supabase } from '../../../lib/supabase';
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
  /** The enrolled plan — read only for its cohort fields (starts_on et al). */
  plan?: CohortFields | null;
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
  plan,
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
  const cohort = isCohort(plan);

  // ── Class rows for the class nodes this track references ──
  const classIds = useMemo(() => {
    const ids = track.filter((n) => n.type === 'class' && n.id).map((n) => n.id as string);
    return Array.from(new Set(ids)).sort();
  }, [track]);
  const classIdKey = classIds.join(',');

  const [classRows, setClassRows] = useState<Record<string, any>>({});
  useEffect(() => {
    if (classIds.length === 0) {
      setClassRows({});
      return;
    }
    let alive = true;
    supabase
      .from('classes')
      .select('id, title, category, difficulty, duration_minutes, thumbnail_url, video_url, description, equipment, is_free')
      .in('id', classIds)
      .then(({ data, error }) => {
        if (!alive || error || !data) return;
        const map: Record<string, any> = {};
        data.forEach((row: any) => { map[row.id] = row; });
        setClassRows(map);
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIdKey]);

  const classById = useMemo(
    () => (id?: string) => (id ? classRows[id] : undefined),
    [classRows],
  );

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
      // Real calendar date for cohorts only — null keeps evergreen sequential.
      group.nodes.push({ index: i, node, date: cohort ? dateForNode(plan, track, i) : null });
    });

    return groups;
  }, [track, durationWeeks, cohort, plan]);

  return (
    <View style={{ gap: 22 }}>
      {weeks.map((g, i) => (
        <View key={g.week} onLayout={(e) => onWeekLayout?.(g.week, e.nativeEvent.layout.y)}>
          <WeekSection
            week={g.week}
            title={g.title}
            isRestWeek={g.isRestWeek}
            nodes={g.nodes}
            cohort={cohort}
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
            classById={classById}
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
