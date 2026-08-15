import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  LayoutAnimation, UIManager, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import MuscleMap from '../../anatomy/MuscleMap';
import { musclesForExercise, regionLabel, MuscleRegionId } from '../../../lib/muscles';
import ExerciseMediaDemo from '../../shared/exercise/ExerciseMediaDemo';
import { useReducedMotion } from '../../../lib/useReducedMotion';

// Enable LayoutAnimation on Android (same guard as strength-session)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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

// Real instructions → bullet lines. HTML list items / paragraphs become
// bullets; a single plain-text blob is split on sentence ends. No data → [].
// Same approach as strength-session's toBullets.
function toBullets(raw?: string | null): string[] {
  if (!raw) return [];
  const withBreaks = String(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(li|p|div|ol|ul)\s*>/gi, '\n');
  const text = withBreaks.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ');
  const lines = text.split(/\r?\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items = lines.length > 1
    ? lines
    : (lines[0] ?? '').split(/\.\s+/).map(s => s.trim()).filter(s => s.length > 1);
  return items.map(s => (/[.!?]$/.test(s) ? s : `${s}.`));
}

// External hosts need a video modal we don't have in the preview; the inline
// expo-video player can't play them, so they are treated as no media here.
function isExternalVideo(url?: string | null): boolean {
  if (!url) return false;
  return /youtube\.com|youtu\.be|instagram\.com|tiktok\.com/.test(url);
}

interface WorkoutPreviewProps {
  activeWorkout: any;
  onStart: () => void;
  onBack: () => void;
}

export default function WorkoutPreview({ activeWorkout, onStart, onBack }: WorkoutPreviewProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const workout = activeWorkout?.workouts || {};

  // Per-row expand state, keyed by workout_exercise id (index fallback).
  // Expanded content is only mounted while open — no hidden mounts.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggleRow = useCallback((key: string) => {
    if (!reducedMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, [reducedMotion]);

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

        {/* Full exercise list — each row expands in place to show the
            exercise's real details (media, muscles, instructions, meta).
            Every block below is rendered only when its data exists. */}
        <View style={{ gap: 8, marginTop: 22 }}>
          {exercises.map((we: any, i: number) => {
            const key = String(we.id || i);
            const base = we.exercises;
            const name = base?.name || 'Exercise';
            const sets = parseInt(String(we.sets), 10);
            const reps = parseInt(String(we.reps), 10);
            const equipment = base?.equipment as string | undefined;
            const parts = [
              ...(Number.isFinite(sets) && Number.isFinite(reps) && sets > 0 && reps > 0
                ? [`${sets}×${reps}`]
                : []),
              ...(we.rest_seconds > 0 ? [`${we.rest_seconds}s rest`] : []),
            ];
            const isOpen = !!expanded[key];

            const setsReadable =
              Number.isFinite(sets) && Number.isFinite(reps) && sets > 0 && reps > 0
                ? `, ${sets} sets of ${reps}`
                : '';

            // Detail availability — computed cheaply for every row so the
            // a11y hint is honest, but the blocks themselves mount only
            // while the row is open.
            const imageUrl = base?.image_url as string | undefined;
            const videoUrl = isExternalVideo(we.video_url) ? undefined : (we.video_url as string | undefined);
            const hasMedia = !!(imageUrl || videoUrl);
            const rowMuscles = base
              ? musclesForExercise(base)
              : { primary: [] as MuscleRegionId[], secondary: [] as MuscleRegionId[] };
            const hasMuscles = rowMuscles.primary.length + rowMuscles.secondary.length > 0;
            const bullets = toBullets(we.notes || base?.instructions);
            const difficulty = base?.difficulty as string | undefined;
            const muscleLabel = rowMuscles.primary.length > 0
              ? regionLabel(rowMuscles.primary[0])
              : (base?.muscle_group ? cap(String(base.muscle_group)) : null);
            const metaTags = [
              ...(equipment ? [cap(equipment)] : []),
              ...(difficulty ? [cap(difficulty)] : []),
              ...(muscleLabel ? [muscleLabel] : []),
            ];
            const hasDetails = hasMedia || hasMuscles || bullets.length > 0 || metaTags.length > 0;

            return (
              <View key={key} style={s.exCard}>
                <TouchableOpacity
                  style={s.exRow}
                  onPress={() => toggleRow(key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${name}${setsReadable}${we.rest_seconds > 0 ? `, ${we.rest_seconds} seconds rest` : ''}`}
                  accessibilityHint={
                    hasDetails
                      ? (isOpen ? 'Double tap to hide details' : 'Double tap to show details')
                      : 'No further details for this exercise'
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.exName}>{name}</Text>
                    {parts.length > 0 && <Text style={s.exMeta}>{parts.join(' · ')}</Text>}
                  </View>
                  {equipment && !isOpen ? (
                    <View style={s.tag}><Text style={s.tagText}>{cap(equipment)}</Text></View>
                  ) : null}
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={17}
                    color={CoachColors.textMuted}
                  />
                </TouchableOpacity>

                {isOpen && (
                  <View style={s.exExpanded}>
                    {!hasDetails && (
                      <Text style={s.exNoDetails}>No further details for this exercise.</Text>
                    )}

                    {/* Demo media — image/gif or inline video, real URL only */}
                    {hasMedia && (
                      <ExerciseMediaDemo
                        imageUrl={imageUrl}
                        videoUrl={videoUrl}
                        exerciseName={name}
                      />
                    )}

                    {/* This exercise's own muscles — only when recognizable */}
                    {hasMuscles && (
                      <View
                        style={s.exMuscleRow}
                        accessible
                        accessibilityLabel={`Targets ${[...rowMuscles.primary, ...rowMuscles.secondary].map(id => regionLabel(id)).join(', ')}`}
                      >
                        <MuscleMap
                          view="both"
                          height={90}
                          primary={rowMuscles.primary}
                          secondary={rowMuscles.secondary}
                        />
                      </View>
                    )}

                    {/* Real instructions as bullets, capped at 4 */}
                    {bullets.length > 0 && (
                      <View style={s.exInstrBlock}>
                        {bullets.slice(0, 4).map((line, j) => (
                          <View key={j} style={s.exInstrLine}>
                            <Text style={s.exInstrDot}>{'•'}</Text>
                            <Text style={s.exInstrText}>{line}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Meta — equipment, difficulty, muscle group; real values only */}
                    {metaTags.length > 0 && (
                      <View style={s.exTagRow}>
                        {metaTags.map(t => (
                          <View key={t} style={s.tag}><Text style={s.tagText}>{t}</Text></View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* The one commit — nothing above this starts anything.
          Bottom padding clears the floating tab bar, which is
          position:absolute and was covering this button entirely. */}
      <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) + 92 }]}>
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

  exCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14,
  },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 15,
  },
  exName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  exMeta: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 3 },

  exExpanded: {
    paddingHorizontal: 15, paddingBottom: 14, gap: 12,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
    paddingTop: 12,
  },
  exNoDetails: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  exMuscleRow: { alignItems: 'center' },
  exInstrBlock: { gap: 6 },
  exInstrLine: { flexDirection: 'row', gap: 8 },
  exInstrDot: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.accent, lineHeight: 19 },
  exInstrText: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 12.5,
    color: CoachColors.textSecondary, lineHeight: 19,
  },
  exTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  tagText: { fontFamily: CoachFonts.bodyMedium, fontSize: 11.5, color: CoachColors.textSecondary },

  footer: {
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted,
  },
  startBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 16, alignItems: 'center',
  },
  startBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },
});
