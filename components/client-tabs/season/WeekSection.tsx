/**
 * WeekSection — one week of the season track, as an organized, labeled,
 * tappable group of nodes.
 *
 * - Past weeks collapse to a one-line receipt ("Week 1 · 4 of 4 done") and
 *   expand on tap.
 * - The current week is expanded by default; its current node gets the big
 *   card treatment ("Up next", real workout meta, Preview button — spring
 *   entrance unless Reduce Motion).
 * - Future weeks are visible but visually quieter; their workouts still open
 *   the same preview (view-only — nothing starts or advances the track from
 *   an ahead node).
 *
 * Every tap routes through the parent's callbacks so the preview-first
 * contract in workouts.tsx stays the single entry point.
 *
 * Workout nodes — current, done and ahead alike — are drawn by the shared
 * components/client-tabs/workout/WorkoutCard, the same card the Extras list
 * uses and the Train-side sibling of the Food tab's MealCard. Diet, class and
 * milestone nodes keep their own compact rows; they are not sessions.
 *
 * COHORTS: a cohort pass has a real start date, so each node carries a real
 * calendar date (resolved upstream in SeasonTrack). Three things follow, and
 * ONLY for cohorts:
 *  · the eyebrow gains the day — "WEEK 3 · SESSION 2 · TUE 16 SEP"
 *  · today's node is emphasised (accent eyebrow, "Today" reads in it)
 *  · a node dated before today and not done is tagged "Missed" — a warning
 *    token, not an alarm. The current node keeps its "Up next" treatment; it
 *    is never tagged missed, its date just carries the warning tint.
 * An evergreen pass is athlete-paced with no schedule to miss, so it gets
 * date = null and renders exactly as before.
 *
 * CLASS NODES: a class the coach placed in the week opens the athlete class
 * detail — ClientRoute.classDetail, never the coach screen at /class/[id].
 * Same preview-before-commit contract as a workout node: opening it shows the
 * class, it never auto-plays and never advances track_position.
 */
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import { formatNodeDay } from '../../../lib/cohort';
import type { TrackNode } from '../../../context/AppContext';
import WorkoutCard from '../workout/WorkoutCard';
import { type WorkoutMuscleInfo } from './workoutMuscles';

const C = CoachColors;
const F = CoachFonts;

export type SeasonNode = {
  /** Index into the full track (position comparisons happen against this). */
  index: number;
  node: TrackNode;
  /** Real calendar date — cohorts only, null for athlete-paced passes. */
  date?: Date | null;
};

/** Days from today to `date` (negative = past). Null when there is no date. */
function dayOffset(date?: Date | null): number | null {
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day.getTime() - today.getTime()) / 86400000);
}

type Props = {
  week: number;
  /** Coach's own title for the week, from the "Week N: …" milestone, if any. */
  title: string | null;
  /** True when the week-start milestone said "Rest week". */
  isRestWeek: boolean;
  /** Week nodes, week-start milestone already stripped. */
  nodes: SeasonNode[];
  /** True when the enrolled plan is a cohort — the only case with real dates. */
  cohort?: boolean;
  /** Nodes completed on the enrollment. */
  position: number;
  status: 'past' | 'current' | 'future';
  seasonCompleted: boolean;
  workoutById: (id?: string) => any;
  /** Class row for a class node's id — resolved upstream in SeasonTrack. */
  classById?: (id?: string) => any;
  /** Memoized whole-workout muscle aggregate — computed once per workout id upstream. */
  muscleInfoFor: (workoutRow: any) => WorkoutMuscleInfo | null;
  coachFirst: string;
  /** viewOnly = open the preview to look, never to log or advance. */
  onOpenWorkout: (workoutRow: any, opts: { viewOnly: boolean }) => void;
  onOpenDiet: () => void;
  reducedMotion: boolean;
  /** Position in the stagger (0-based). */
  animationIndex: number;
};

export default function WeekSection({
  week,
  title,
  isRestWeek,
  nodes,
  cohort = false,
  position,
  status,
  seasonCompleted,
  workoutById,
  classById,
  muscleInfoFor,
  coachFirst,
  onOpenWorkout,
  onOpenDiet,
  reducedMotion,
  animationIndex,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(status === 'current');

  const actionable = nodes.filter((n) => n.node.type !== 'milestone');
  const doneCount = actionable.filter((n) => n.index < position || seasonCompleted).length;

  // "Session M" position within this week — workout nodes only, in track order.
  const sessionNumberByIndex = useMemo(() => {
    const map = new Map<number, number>();
    let n = 0;
    nodes.forEach(({ index, node }) => {
      if (node.type === 'workout') {
        n += 1;
        map.set(index, n);
      }
    });
    return map;
  }, [nodes]);

  const headerTitle = title ? `Week ${week} · ${title}` : `Week ${week}`;
  const summary =
    actionable.length > 0
      ? `${doneCount} of ${actionable.length} done`
      : isRestWeek
        ? 'Rest week'
        : 'Nothing scheduled';

  const tap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const renderNode = ({ index, node, date }: SeasonNode) => {
    const done = index < position || seasonCompleted;
    const isCurrent = index === position && !seasonCompleted;

    // Cohort schedule reads — all null/false for an athlete-paced pass.
    const offset = cohort ? dayOffset(date) : null;
    const dayLabel = cohort ? formatNodeDay(date) : null;
    const isToday = offset === 0;
    // Past and not done. The current node keeps "Up next" and is never tagged.
    const isMissed = offset !== null && offset < 0 && !done && !isCurrent;

    if (node.type === 'milestone') {
      const label = (node.label || '').trim();
      if (!label) return null;
      return (
        <View
          key={index}
          style={s.markerRow}
          accessible={true}
          accessibilityLabel={`Week ${week}, marker: ${label}${done ? ', passed' : ''}`}
        >
          <Ionicons name="flag-outline" size={15} color={done ? C.textFaint : C.accent} />
          <Text style={s.markerText}>{label}</Text>
          {done && <Ionicons name="checkmark" size={15} color={C.textFaint} />}
        </View>
      );
    }

    if (node.type === 'diet') {
      return (
        <Pressable
          key={index}
          style={[s.nodeRow, done && s.nodeRowDone, status === 'future' && s.nodeRowFuture]}
          onPress={() => {
            tap();
            onOpenDiet();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Week ${week}, food focus${done ? ', done' : isCurrent ? ', up next' : ''}. Double tap to open your meal plan`}
        >
          <View style={[s.nodeIconWrap, done && s.nodeIconWrapDone]}>
            <Ionicons
              name={done ? 'checkmark' : 'nutrition-outline'}
              size={15}
              color={done ? C.accent : isCurrent ? C.accent : C.textFaint}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nodeName}>Food focus</Text>
            <Text style={s.nodeSub}>
              {[dayLabel, done ? 'Done' : `${coachFirst} wants the plate in focus here`]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={C.textFaint} />
        </Pressable>
      );
    }

    if (node.type === 'class') {
      // Real row when the class resolved; the node's own label otherwise.
      const cls = classById?.(node.id);
      const className = cls?.title || node.label || 'Class session';
      const classMeta: string[] = [];
      if (cls?.duration_minutes) classMeta.push(`${cls.duration_minutes} min`);
      if (cls?.category) classMeta.push(String(cls.category));
      if (cls?.difficulty) classMeta.push(String(cls.difficulty));

      // Same eyebrow grammar as the sibling workout cards.
      const classWhen = [`Week ${week}`, 'Class', dayLabel].filter(Boolean).join(' · ');
      const classSpoken = [`Week ${week}`, 'class', dayLabel].filter(Boolean).join(', ');

      // View-only, always: opening the detail never starts playback and never
      // advances track_position. Class completion is not wired to the track.
      const canOpenClass = !!cls;
      return (
        <Pressable hitSlop={{ top: 1, bottom: 1 }}
          key={index}
          style={[s.nodeCard, done && s.nodeRowDone, status === 'future' && s.nodeRowFuture]}
          onPress={() => {
            if (!canOpenClass) return;
            tap();
            router.push({
              pathname: ClientRoute.classDetail,
              params: {
                id: cls.id,
                title: cls.title || '',
                category: cls.category || '',
                level: cls.difficulty || '',
                durationMin: cls.duration_minutes != null ? String(cls.duration_minutes) : '',
                thumbnail: cls.thumbnail_url || '',
                description: cls.description || '',
                equipment: Array.isArray(cls.equipment) ? cls.equipment.join(', ') : '',
                video_url: cls.video_url || '',
                // class-detail gates its paywall on this exact string.
                is_free: cls.is_free ? 'true' : 'false',
                instructor: coachFirst,
              },
            });
          }}
          disabled={!canOpenClass}
          accessibilityRole="button"
          accessibilityLabel={`${classSpoken}, ${className}, ${done ? 'done' : isMissed ? 'missed' : isToday ? 'today' : 'ahead on your plan'}${classMeta.length > 0 ? `, ${classMeta.join(', ')}` : ''}${canOpenClass ? '. Double tap to open the class' : ''}`}
          accessibilityHint={canOpenClass ? 'Opens the class. Nothing plays until you start it there' : undefined}
        >
          <View style={[s.nodeIconWrap, done && s.nodeIconWrapDone]}>
            <Ionicons
              name={done ? 'checkmark' : 'videocam-outline'}
              size={15}
              color={done ? C.accent : isCurrent ? C.accent : C.textFaint}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.whenRow}>
              <Text
                style={[
                  s.whenText,
                  isToday && !done && s.whenTextToday,
                  isMissed && s.whenTextLate,
                ]}
              >
                {classWhen}
              </Text>
              {done && (
                <View style={s.doneChip}>
                  <Text style={s.doneChipText}>Done</Text>
                </View>
              )}
              {!done && isMissed && (
                <View style={s.missedChip}>
                  <Text style={s.missedChipText}>Missed</Text>
                </View>
              )}
            </View>
            <Text style={s.nodeName} numberOfLines={1}>
              {className}
            </Text>
            {classMeta.length > 0 ? (
              <Text style={s.nodeSub}>{classMeta.join(' · ')}</Text>
            ) : (
              <Text style={s.nodeSub}>A class your coach put on the plan</Text>
            )}
          </View>
          {canOpenClass && <Ionicons name="chevron-forward" size={17} color={C.textFaint} />}
        </Pressable>
      );
    }

    // Workout node
    const w = workoutById(node.id);
    const exercises: any[] = w?.workout_exercises || [];
    const name = w?.name || node.label || 'Session';

    // WHEN / WHAT IT DOES — position label and muscle focus, real data only.
    // For a cohort the day is real, so it joins the eyebrow:
    // "Week 3 · Session 2 · Tue 16 Sep". Evergreen stays sequential.
    const sessionNo = sessionNumberByIndex.get(index) || null;
    const whenLabel = [`Week ${week}`, sessionNo ? `Session ${sessionNo}` : null, dayLabel]
      .filter(Boolean)
      .join(' · ');
    const whenSpoken = [`Week ${week}`, sessionNo ? `session ${sessionNo}` : null, dayLabel]
      .filter(Boolean)
      .join(', ');
    const info = w ? muscleInfoFor(w) : null;

    if (isCurrent) {
      const CardWrap = reducedMotion ? View : Animated.View;
      const cardProps = reducedMotion
        ? {}
        : { entering: FadeInDown.springify().damping(16).stiffness(160) };
      // The hero keeps its larger treatment and its out-loud "Preview session"
      // button — the preview-first contract deserves a labelled affordance —
      // but it is now the same card as every other session on the screen.
      return (
        <CardWrap key={index} {...cardProps}>
          <WorkoutCard
            workout={w}
            name={name}
            hero
            eyebrow={whenLabel}
            eyebrowSpoken={whenSpoken}
            eyebrowTone={isToday ? 'today' : offset !== null && offset < 0 ? 'late' : 'default'}
            statusChip="up-next"
            muscleInfo={info}
            reduceMotion={reducedMotion}
            primaryLabel={w ? 'Preview session' : null}
            accessibilityHint="Opens the session preview. Nothing starts until you tap start there"
            onPress={
              w
                ? () => {
                    tap();
                    onOpenWorkout(w, { viewOnly: false });
                  }
                : undefined
            }
          >
            {exercises.length > 0 && (
              <View style={s.exerciseList}>
                {[...exercises]
                  .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
                  .slice(0, 5)
                  .map((ex: any, i: number) => (
                    <View key={ex.id || i} style={s.exerciseRow}>
                      <Text style={s.exerciseName} numberOfLines={1}>
                        {ex.exercises?.name || 'Exercise'}
                      </Text>
                      {ex.sets && ex.reps ? <Text style={s.exerciseMeta}>{ex.sets}×{ex.reps}</Text> : null}
                    </View>
                  ))}
                {exercises.length > 5 && <Text style={s.exerciseMore}>+{exercises.length - 5} more</Text>}
              </View>
            )}
            {!w && <Text style={s.nodeSub}>Loading the session details…</Text>}
          </WorkoutCard>
        </CardWrap>
      );
    }

    // Done or upcoming session — both open the same preview, view-only.
    const canOpen = !!w;
    return (
      <WorkoutCard
        key={index}
        workout={w}
        name={name}
        eyebrow={whenLabel}
        eyebrowSpoken={whenSpoken}
        eyebrowTone={isMissed ? 'late' : isToday && !done ? 'today' : 'default'}
        statusChip={done ? 'done' : isMissed ? 'missed' : null}
        statusSpoken={done ? 'done' : isMissed ? 'missed' : isToday ? 'today' : 'ahead on your plan'}
        muscleInfo={info}
        viewOnly
        dimmed={done}
        transparent={status === 'future'}
        reduceMotion={reducedMotion}
        onPress={
          canOpen
            ? () => {
                tap();
                onOpenWorkout(w, { viewOnly: true });
              }
            : undefined
        }
      />
    );
  };

  const Wrap = reducedMotion ? View : Animated.View;
  const wrapProps = reducedMotion
    ? {}
    : { entering: FadeInDown.delay(Math.min(animationIndex, 8) * 70).duration(340) };

  // Past weeks: a one-line receipt until tapped open.
  if (status === 'past' && !expanded) {
    return (
      <Wrap {...wrapProps}>
        <Pressable hitSlop={{ top: 2, bottom: 2 }}
          style={s.pastRow}
          onPress={() => {
            tap();
            setExpanded(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Week ${week}${title ? `, ${title}` : ''}, ${summary}. Double tap to open the week`}
        >
          <Ionicons name="checkmark-circle" size={18} color={C.accent} style={{ opacity: 0.7 }} />
          <Text style={s.pastRowText}>
            {headerTitle} · {summary}
          </Text>
          <Ionicons name="chevron-down" size={16} color={C.textFaint} />
        </Pressable>
      </Wrap>
    );
  }

  return (
    <Wrap {...wrapProps} style={status === 'future' ? s.futureSection : undefined}>
      <Pressable
        style={s.header}
        onPress={
          status === 'past'
            ? () => {
                tap();
                setExpanded(false);
              }
            : undefined
        }
        disabled={status !== 'past'}
        accessibilityRole={status === 'past' ? 'button' : 'header'}
        accessibilityState={status === 'past' ? { expanded: true } : undefined}
        accessibilityLabel={`Week ${week}${title ? `, ${title}` : ''}${status === 'current' ? ', this week' : status === 'future' ? ', ahead' : ', done'}${status === 'past' ? '. Double tap to collapse' : ''}`}
      >
        <Text style={[s.headerText, status === 'current' && s.headerTextCurrent, status === 'future' && s.headerTextFuture]}>
          {headerTitle}
        </Text>
        {status === 'current' && (
          <View style={s.thisWeekTag}>
            <Text style={s.thisWeekTagText}>This week</Text>
          </View>
        )}
        {status === 'past' && <Ionicons name="chevron-up" size={16} color={C.textFaint} />}
      </Pressable>

      {isRestWeek && actionable.length === 0 ? (
        <View
          style={[s.nodeRow, s.nodeRowFuture]}
          accessible={true}
          accessibilityLabel={`Week ${week}, rest week. Recovery is part of the plan`}
        >
          <View style={s.nodeIconWrap}>
            <Ionicons name="moon-outline" size={17} color={C.textFaint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nodeName}>Rest</Text>
            <Text style={s.nodeSub}>Recovery is part of the plan</Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>{nodes.map(renderNode)}</View>
      )}
    </Wrap>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 10,
  },
  headerText: {
    fontFamily: F.headingSemiBold,
    fontSize: 15.5,
    color: C.textSecondary,
    flexShrink: 1,
  },
  headerTextCurrent: { color: C.textPrimary, fontFamily: F.headingBold, fontSize: 17 },
  headerTextFuture: { color: C.textFaint },
  thisWeekTag: {
    backgroundColor: C.accentSoft,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  thisWeekTagText: { fontFamily: F.bodyBold, fontSize: 11, color: C.accent, letterSpacing: 0.6, textTransform: 'uppercase' },

  futureSection: { opacity: 0.62 },

  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pastRowText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 14, color: C.textMuted },

  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  // Workout node card — the when/what/does treatment.
  nodeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  whenText: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  doneChip: {
    backgroundColor: C.accentSoft,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  doneChipText: { fontFamily: F.bodyBold, fontSize: 11, color: C.accent },
  // Cohort-only schedule reads. Today is emphasis, not alarm; missed is a
  // warning token — a real day passed, not a failure state.
  whenTextToday: { color: C.accent },
  whenTextLate: { color: C.warning },
  missedChip: {
    backgroundColor: C.warningSoft,
    borderRadius: 999,
    borderCurve: 'continuous',
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  missedChipText: { fontFamily: F.bodyBold, fontSize: 11, color: C.warning },
  nodeRowDone: { opacity: 0.65 },
  nodeRowFuture: { backgroundColor: 'transparent' },
  nodeIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.borderMuted,
  },
  nodeIconWrapDone: { backgroundColor: C.accentSofter },
  nodeName: { fontFamily: F.bodySemiBold, fontSize: 15.5, color: C.textPrimary },
  nodeSub: { fontFamily: F.body, fontSize: 13, color: C.textMuted, marginTop: 2, lineHeight: 18 },

  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  markerText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 14, color: C.textSecondary },

  // The current node's exercise list — the one extra the hero card carries.
  exerciseList: { gap: 7, marginTop: 13 },
  exerciseRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  exerciseName: { flex: 1, fontFamily: F.bodySemiBold, fontSize: 14.5, color: C.textPrimary },
  exerciseMeta: { fontFamily: F.body, fontSize: 13.5, color: C.textMuted },
  exerciseMore: { fontFamily: F.body, fontSize: 13, color: C.textFaint },
});
