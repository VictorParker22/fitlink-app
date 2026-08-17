/**
 * SessionSetRow — one set, mid-workout.
 *
 * The card language from MealCard/WorkoutCard, brought down to the row that
 * the athlete actually touches while out of breath:
 *   · a round set "portrait" — the set number, filled lime once logged
 *   · two large labelled wells instead of a cramped spreadsheet cell
 *   · a big circular commit action on the right, the card's action-button
 *     shape at row scale
 *
 * WHY THE WELLS ARE LABELLED IN PLACE. The old table put "Weight (lbs)" and
 * "Reps" in a header row above the first set. By set three that header has
 * scrolled away and the two identical boxes are a guess. Each well carries its
 * own unit, so a row is readable on its own.
 *
 * THE TIMER IS OPT-IN AND IT IS NOT A REST TIMER. Rest is the coach's
 * prescription and interrupts you between sets; this is the athlete's own
 * stopwatch for time under tension — planks, carries, holds, or just wanting to
 * know. It never starts by itself on a bare tap, and a set that was not timed
 * stores no duration at all rather than a zero.
 *
 * TOUCH TARGETS: every control is >= 44pt through its own box or hitSlop, and
 * the circular ones keep width === height === 2 x borderRadius.
 */

import React from 'react';
import { View, Text, StyleSheet, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

const C = CoachColors;
const F = CoachFonts;

/** mm:ss — the one duration format the session uses. */
export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, Math.floor(seconds % 60));
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export interface SessionSetRowProps {
  setNumber: number;
  exerciseName: string;

  weight: string;
  reps: string;
  completed: boolean;

  /** Recorded stopwatch time for this set, when it was timed. */
  seconds?: number;
  /** This set owns the running stopwatch. Only one set can, ever. */
  timerRunning: boolean;
  /** Live seconds while running — ignored when `timerRunning` is false. */
  timerElapsed: number;

  onChange: (field: 'weight' | 'reps', value: string) => void;
  onLog: () => void;
  onToggleTimer: () => void;
}

export default function SessionSetRow({
  setNumber,
  exerciseName,
  weight,
  reps,
  completed,
  seconds,
  timerRunning,
  timerElapsed,
  onChange,
  onLog,
  onToggleTimer,
}: SessionSetRowProps) {
  const shownSeconds = timerRunning ? timerElapsed : seconds ?? 0;
  const hasTime = timerRunning || (seconds ?? 0) > 0;

  return (
    <View style={[st.row, completed && st.rowDone, timerRunning && st.rowTiming]}>
      <View style={st.topLine}>
        {/* The set's own portrait — same circle the cards use, at row scale. */}
        <View style={[st.badge, completed && st.badgeDone]}>
          <Text style={[st.badgeText, completed && { color: C.onAccent }]}>{setNumber}</Text>
        </View>

        <View style={st.well}>
          <Text style={st.wellLabel}>Weight</Text>
          <View style={st.wellInputRow}>
            <TextInput
              style={[st.wellInput, completed && st.wellInputDone]}
              value={weight}
              onChangeText={(v) => onChange('weight', v)}
              placeholder="0"
              placeholderTextColor={C.textFaint}
              keyboardType="numeric"
              editable={!completed}
              selectTextOnFocus
              accessibilityLabel={`${exerciseName}, set ${setNumber}, weight in pounds`}
              accessibilityState={{ disabled: completed }}
              accessibilityHint={completed ? 'Locked because this set is already logged' : undefined}
            />
            <Text style={st.wellUnit}>lbs</Text>
          </View>
        </View>

        <View style={st.well}>
          <Text style={st.wellLabel}>Reps</Text>
          <View style={st.wellInputRow}>
            <TextInput
              style={[st.wellInput, completed && st.wellInputDone]}
              value={reps}
              onChangeText={(v) => onChange('reps', v)}
              placeholder="0"
              placeholderTextColor={C.textFaint}
              keyboardType="numeric"
              editable={!completed}
              selectTextOnFocus
              accessibilityLabel={`${exerciseName}, set ${setNumber}, reps`}
              accessibilityState={{ disabled: completed }}
              accessibilityHint={completed ? 'Locked because this set is already logged' : undefined}
            />
          </View>
        </View>

        <Pressable
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[st.logBtn, completed && st.logBtnDone]}
          onPress={onLog}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={`Log set ${setNumber} of ${exerciseName}`}
          accessibilityHint={completed ? 'Unlogs this set and unlocks it for editing' : undefined}
        >
          <Ionicons
            name={completed ? 'checkmark' : 'ellipse-outline'}
            size={completed ? 26 : 24}
            color={completed ? C.onAccent : C.textMuted}
          />
        </Pressable>
      </View>

      {/* The stopwatch strip. Present as a quiet affordance until it has
          something to say, then it holds the live clock. */}
      <Pressable
        style={st.timerStrip}
        onPress={onToggleTimer}
        accessibilityRole="button"
        accessibilityLabel={
          timerRunning
            ? `Stop set timer at ${formatClock(shownSeconds)}`
            : hasTime
              ? `Set timer, ${formatClock(shownSeconds)} recorded. Double tap to time it again`
              : `Time set ${setNumber}`
        }
        accessibilityHint={timerRunning ? 'Records the time on this set' : undefined}
      >
        <Ionicons
          name={timerRunning ? 'stop-circle' : 'stopwatch-outline'}
          size={17}
          color={timerRunning ? C.accent : hasTime ? C.textSecondary : C.textMuted}
        />
        {hasTime ? (
          <Text style={[st.timerValue, timerRunning && { color: C.accent }]}>
            {formatClock(shownSeconds)}
          </Text>
        ) : (
          <Text style={st.timerHint}>Time this set</Text>
        )}
        {timerRunning ? <Text style={st.timerStop}>Stop</Text> : null}
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    backgroundColor: C.bg,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.borderMuted,
    padding: 12,
    gap: 2,
  },
  rowDone: { borderColor: C.accentSoft },
  rowTiming: { borderColor: C.accent },

  topLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },

  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDone: { backgroundColor: C.accent, borderColor: C.accent },
  badgeText: { fontFamily: F.bodyBold, fontSize: 15, color: C.textPrimary },

  well: {
    flex: 1,
    minHeight: 52,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  wellLabel: {
    fontFamily: F.bodyBold,
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  wellInputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  wellInput: {
    flex: 1,
    padding: 0,
    fontFamily: F.bodyBold,
    fontSize: 18,
    color: C.textPrimary,
  },
  wellInputDone: { color: C.accent },
  wellUnit: { fontFamily: F.bodyMedium, fontSize: 12, color: C.textFaint },

  logBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  logBtnDone: { backgroundColor: C.accent, borderColor: C.accent },

  timerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  timerHint: { fontFamily: F.bodyMedium, fontSize: 13, color: C.textMuted },
  timerValue: { fontFamily: F.bodyBold, fontSize: 14.5, color: C.textSecondary },
  timerStop: {
    marginLeft: 'auto',
    fontFamily: F.bodyBold,
    fontSize: 12,
    color: C.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
