import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import MuscleMap from '../../anatomy/MuscleMap';
import { musclesForExercise, regionLabel, MuscleRegionId } from '../../../lib/muscles';

/**
 * Review-before-commit gate in front of ActiveWorkoutPlayer.
 *
 * Every path into a session (Today card, Copilot rows, the startWorkoutId
 * deep link, assigned-list rows) lands here first. Nothing is timed, nothing
 * is logged — the elapsed timer only exists once the athlete taps the one
 * accent CTA, "Start session". Backing out from here asks no questions,
 * because nothing was started.
 *
 * Every number shown is real or omitted: the duration line prefers the
 * coach-set minutes; failing that it shows an estimate (sets × (rest + ~40s
 * of work)) labeled "Est.", and only when every exercise has a real sets
 * count; otherwise the line is dropped.
 */

function cap(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

interface WorkoutPreviewProps {
  activeWorkout: any;
  onStart: () => void;
  onBack: () => void;
}

export default function WorkoutPreview({ activeWorkout, onStart, onBack }: WorkoutPreviewProps) {
  const workout = activeWorkout?.workouts || {};

  const exercises = useMemo(() => {
    return ([...(workout.workout_exercises || [])] as any[]).sort(
      (a, b) => (a.order_index ?? a.order ?? 0) - (b.order_index ?? b.order ?? 0)
    );
  }, [workout]);

  // Whole-workout muscle aggregate — same pattern as the Targets card in
  // app/workout/[id].tsx. Real exercise data only; nothing → no figure.
  const muscles = useMemo(() => {
    const primaryCounts = new Map<MuscleRegionId, number>();
    const secondaryCounts = new Map<MuscleRegionId, number>();
    exercises.forEach((we: any) => {
      const base = we.exercises;
      if (!base) return;
      const { primary, secondary } = musclesForExercise(base);
      primary.forEach(id => primaryCounts.set(id, (primaryCounts.get(id) || 0) + 1));
      secondary.forEach(id => secondaryCounts.set(id, (secondaryCounts.get(id) || 0) + 1));
    });
    const primary = [...primaryCounts.keys()];
    const secondary = [...secondaryCounts.keys()].filter(id => !primaryCounts.has(id));
    const rows = [
      ...[...primaryCounts.entries()].map(([id, count]) => ({ id, count, isPrimary: true })),
      ...secondary.map(id => ({ id, count: secondaryCounts.get(id) || 0, isPrimary: false })),
    ].sort((a, b) => (a.isPrimary === b.isPrimary ? b.count - a.count : a.isPrimary ? -1 : 1));
    return { primary, secondary, rows };
  }, [exercises]);

  const totalSets = useMemo(
    () => exercises.reduce((sum: number, we: any) => {
      const n = parseInt(String(we.sets), 10);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0),
    [exercises]
  );

  // Duration: coach-set minutes when present (real), else an honest estimate,
  // else nothing.
  const durationLine = useMemo(() => {
    const coachMins = workout.duration || workout.duration_minutes;
    if (coachMins) return `${coachMins} min`;
    if (exercises.length === 0) return null;
    const allReal = exercises.every((we: any) => {
      const n = parseInt(String(we.sets), 10);
      return Number.isFinite(n) && n > 0;
    });
    if (!allReal) return null;
    const seconds = exercises.reduce((sum: number, we: any) => {
      const sets = parseInt(String(we.sets), 10);
      const rest = we.rest_seconds > 0 ? we.rest_seconds : 90;
      return sum + sets * (rest + 40);
    }, 0);
    return `Est. ${Math.max(1, Math.round(seconds / 60))} min`;
  }, [workout, exercises]);

  const metaParts = [
    `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`,
    ...(totalSets > 0 ? [`${totalSets} sets`] : []),
    ...(durationLine ? [durationLine] : []),
  ];

  return (
    <View style={s.container}>
      <TouchableOpacity
        onPress={onBack}
        style={s.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        accessibilityHint="Returns without starting the session"
      >
        <Ionicons name="chevron-back" size={26} color={CoachColors.textPrimary} />
      </TouchableOpacity>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.eyebrow}>Session preview</Text>
        <Text style={s.title} accessibilityRole="header">{workout.name || 'Workout'}</Text>
        {metaParts.length > 0 && <Text style={s.meta}>{metaParts.join(' · ')}</Text>}
        {workout.description ? <Text style={s.desc}>{workout.description}</Text> : null}

        {/* Targets — which muscles this session hits, from real data */}
        {muscles.rows.length > 0 && (
          <View
            style={s.targetsCard}
            accessible
            accessibilityLabel={`Targets ${muscles.rows.slice(0, 7).map(r => regionLabel(r.id)).join(', ')}`}
          >
            <MuscleMap view="both" height={150} primary={muscles.primary} secondary={muscles.secondary} />
            <View style={s.targetsList}>
              {muscles.rows.slice(0, 7).map(row => (
                <View key={row.id} style={s.targetRow}>
                  <View style={[s.targetDot, !row.isPrimary && s.targetDotSecondary]} />
                  <Text style={s.targetRowText} numberOfLines={1}>
                    {regionLabel(row.id)} · {row.count} exercise{row.count === 1 ? '' : 's'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Full exercise list — name, sets × reps, equipment when real */}
        <View style={{ gap: 8, marginTop: 22 }}>
          {exercises.map((we: any, i: number) => {
            const name = we.exercises?.name || 'Exercise';
            const sets = parseInt(String(we.sets), 10);
            const reps = parseInt(String(we.reps), 10);
            const equipment = we.exercises?.equipment as string | undefined;
            const parts = [
              ...(Number.isFinite(sets) && Number.isFinite(reps) && sets > 0 && reps > 0
                ? [`${sets}×${reps}`]
                : []),
              ...(we.rest_seconds > 0 ? [`${we.rest_seconds}s rest`] : []),
            ];
            return (
              <View
                key={we.id || i}
                style={s.exRow}
                accessible
                accessibilityLabel={`${name}${parts.length > 0 ? `, ${parts.join(', ')}` : ''}${equipment ? `, ${equipment}` : ''}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>{name}</Text>
                  {parts.length > 0 && <Text style={s.exMeta}>{parts.join(' · ')}</Text>}
                </View>
                {equipment ? (
                  <View style={s.tag}><Text style={s.tagText}>{cap(equipment)}</Text></View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* The one commit — nothing above this starts anything */}
      <View style={s.footer}>
        <TouchableOpacity
          style={[s.startBtn, exercises.length === 0 && { opacity: 0.5 }]}
          onPress={() => {
            if (exercises.length === 0) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onStart();
          }}
          activeOpacity={0.85}
          disabled={exercises.length === 0}
          accessibilityRole="button"
          accessibilityLabel="Start session"
          accessibilityHint="Starts the workout and the session timer"
        >
          <Text style={s.startBtnText}>Start session</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  backBtn: { paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },

  eyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.accent,
    letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8,
  },
  title: {
    fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary,
    lineHeight: 33, marginTop: 8,
  },
  meta: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 8 },
  desc: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary,
    lineHeight: 21, marginTop: 14,
  },

  targetsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 15, marginTop: 18,
  },
  targetsList: { flex: 1, gap: 8 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: CoachColors.accent },
  targetDotSecondary: { backgroundColor: CoachColors.accentSoft },
  targetRowText: {
    flex: 1, fontFamily: CoachFonts.bodyMedium, fontSize: 12.5,
    color: CoachColors.textSecondary,
  },

  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 15,
  },
  exName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  exMeta: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 3 },
  tag: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  tagText: { fontFamily: CoachFonts.bodyMedium, fontSize: 11.5, color: CoachColors.textSecondary },

  footer: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: '#1E211D',
  },
  startBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 16, alignItems: 'center',
  },
  startBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },
});
