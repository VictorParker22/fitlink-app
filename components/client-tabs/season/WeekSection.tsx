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
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import type { TrackNode } from '../../../context/AppContext';

const C = CoachColors;
const F = CoachFonts;

export type SeasonNode = {
  /** Index into the full track (position comparisons happen against this). */
  index: number;
  node: TrackNode;
};

type Props = {
  week: number;
  /** Coach's own title for the week, from the "Week N: …" milestone, if any. */
  title: string | null;
  /** True when the week-start milestone said "Rest week". */
  isRestWeek: boolean;
  /** Week nodes, week-start milestone already stripped. */
  nodes: SeasonNode[];
  /** Nodes completed on the enrollment. */
  position: number;
  status: 'past' | 'current' | 'future';
  seasonCompleted: boolean;
  workoutById: (id?: string) => any;
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
  position,
  status,
  seasonCompleted,
  workoutById,
  coachFirst,
  onOpenWorkout,
  onOpenDiet,
  reducedMotion,
  animationIndex,
}: Props) {
  const [expanded, setExpanded] = useState(status === 'current');

  const actionable = nodes.filter((n) => n.node.type !== 'milestone');
  const doneCount = actionable.filter((n) => n.index < position || seasonCompleted).length;

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

  const renderNode = ({ index, node }: SeasonNode) => {
    const done = index < position || seasonCompleted;
    const isCurrent = index === position && !seasonCompleted;

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
          <Ionicons name="flag-outline" size={13} color={done ? C.textFaint : C.accent} />
          <Text style={s.markerText}>{label}</Text>
          {done && <Ionicons name="checkmark" size={13} color={C.textFaint} />}
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
              {done ? 'Done' : `${coachFirst} wants the plate in focus here`}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={C.textFaint} />
        </Pressable>
      );
    }

    if (node.type === 'class') {
      return (
        <View
          key={index}
          style={[s.nodeRow, done && s.nodeRowDone, status === 'future' && s.nodeRowFuture]}
          accessible={true}
          accessibilityLabel={`Week ${week}, ${node.label || 'class session'}${done ? ', done' : ''}`}
        >
          <View style={[s.nodeIconWrap, done && s.nodeIconWrapDone]}>
            <Ionicons name={done ? 'checkmark' : 'people-outline'} size={15} color={done ? C.accent : C.textFaint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nodeName}>{node.label || 'Class session'}</Text>
            <Text style={s.nodeSub}>{done ? 'Done' : 'A class your coach put on the plan'}</Text>
          </View>
        </View>
      );
    }

    // Workout node
    const w = workoutById(node.id);
    const exercises: any[] = w?.workout_exercises || [];
    const totalSets = exercises.reduce((sum: number, ex: any) => sum + (Number(ex.sets) || 0), 0);
    const meta: string[] = [];
    if (exercises.length > 0) meta.push(`${exercises.length} exercise${exercises.length === 1 ? '' : 's'}`);
    if (totalSets > 0) meta.push(`${totalSets} sets`);
    const mins = w?.duration || w?.duration_minutes || null;
    if (mins) meta.push(`${mins} min`);
    const name = w?.name || node.label || 'Session';

    if (isCurrent) {
      const CardWrap = reducedMotion ? View : Animated.View;
      const cardProps = reducedMotion
        ? {}
        : { entering: FadeInDown.springify().damping(16).stiffness(160) };
      return (
        <CardWrap key={index} style={s.currentCard} {...cardProps}>
          <View style={s.currentEyebrowRow}>
            <View style={s.currentDot} />
            <Text style={s.currentEyebrow}>Up next</Text>
          </View>
          <Text style={s.currentTitle}>{name}</Text>
          {meta.length > 0 && <Text style={s.currentMeta}>{meta.join(' · ')}</Text>}
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
          {w ? (
            <Pressable
              style={s.previewBtn}
              onPress={() => {
                tap();
                onOpenWorkout(w, { viewOnly: false });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Week ${week}, ${name}, up next. Double tap to preview`}
              accessibilityHint="Opens the session preview. Nothing starts until you tap start there"
            >
              <Text style={s.previewBtnText}>Preview session</Text>
            </Pressable>
          ) : (
            <Text style={s.nodeSub}>Loading the session details…</Text>
          )}
        </CardWrap>
      );
    }

    // Done or upcoming workout row — both open the same preview, view-only.
    const canOpen = !!w;
    return (
      <Pressable
        key={index}
        style={[s.nodeRow, done && s.nodeRowDone, status === 'future' && s.nodeRowFuture]}
        onPress={() => {
          if (!canOpen) return;
          tap();
          onOpenWorkout(w, { viewOnly: true });
        }}
        disabled={!canOpen}
        accessibilityRole="button"
        accessibilityLabel={`Week ${week}, ${name}, ${done ? 'done' : 'ahead on your plan'}${meta.length > 0 ? `, ${meta.join(', ')}` : ''}${canOpen ? '. Double tap to preview' : ''}`}
      >
        <View style={[s.nodeIconWrap, done && s.nodeIconWrapDone]}>
          <Ionicons
            name={done ? 'checkmark' : 'barbell-outline'}
            size={15}
            color={done ? C.accent : C.textFaint}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.nodeName}>{name}</Text>
          <Text style={s.nodeSub}>{done ? 'Done' : meta.length > 0 ? meta.join(' · ') : 'Ahead on your plan'}</Text>
        </View>
        {canOpen && <Ionicons name="chevron-forward" size={15} color={C.textFaint} />}
      </Pressable>
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
        <Pressable
          style={s.pastRow}
          onPress={() => {
            tap();
            setExpanded(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Week ${week}${title ? `, ${title}` : ''}, ${summary}. Double tap to open the week`}
        >
          <Ionicons name="checkmark-circle" size={16} color={C.accent} style={{ opacity: 0.7 }} />
          <Text style={s.pastRowText}>
            {headerTitle} · {summary}
          </Text>
          <Ionicons name="chevron-down" size={14} color={C.textFaint} />
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
        {status === 'past' && <Ionicons name="chevron-up" size={14} color={C.textFaint} />}
      </Pressable>

      {isRestWeek && actionable.length === 0 ? (
        <View
          style={[s.nodeRow, s.nodeRowFuture]}
          accessible={true}
          accessibilityLabel={`Week ${week}, rest week. Recovery is part of the plan`}
        >
          <View style={s.nodeIconWrap}>
            <Ionicons name="moon-outline" size={15} color={C.textFaint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.nodeName}>Rest</Text>
            <Text style={s.nodeSub}>Recovery is part of the plan</Text>
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>{nodes.map(renderNode)}</View>
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
    fontSize: 14,
    color: C.textSecondary,
    flexShrink: 1,
  },
  headerTextCurrent: { color: C.textPrimary, fontFamily: F.headingBold, fontSize: 15 },
  headerTextFuture: { color: C.textFaint },
  thisWeekTag: {
    backgroundColor: C.accentSoft,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  thisWeekTagText: { fontFamily: F.bodyBold, fontSize: 10, color: C.accent, letterSpacing: 0.6, textTransform: 'uppercase' },

  futureSection: { opacity: 0.62 },

  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  pastRowText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textMuted },

  nodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  nodeRowDone: { opacity: 0.65 },
  nodeRowFuture: { backgroundColor: 'transparent' },
  nodeIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.borderMuted,
  },
  nodeIconWrapDone: { backgroundColor: C.accentSofter },
  nodeName: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  nodeSub: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 2, lineHeight: 16 },

  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  markerText: { flex: 1, fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textSecondary },

  // The current node — the big treatment.
  currentCard: {
    backgroundColor: '#1E211D',
    borderWidth: 1.5,
    borderColor: C.accent,
    borderRadius: 18,
    padding: 16,
  },
  currentEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  currentDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  currentEyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  currentTitle: { fontFamily: F.headingBold, fontSize: 19, color: C.textPrimary, marginTop: 9 },
  currentMeta: { fontFamily: F.bodyMedium, fontSize: 12, color: C.textMuted, marginTop: 4 },
  exerciseList: { gap: 7, marginTop: 13 },
  exerciseRow: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  exerciseName: { flex: 1, fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  exerciseMeta: { fontFamily: F.body, fontSize: 12, color: C.textMuted },
  exerciseMore: { fontFamily: F.body, fontSize: 11.5, color: C.textFaint },
  previewBtn: {
    backgroundColor: C.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  previewBtnText: { fontFamily: F.bodyBold, fontSize: 14.5, color: C.onAccent },
});
