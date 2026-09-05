/**
 * SessionSetRow — one set, mid-workout.
 *
 * THE KEYBOARD IS THE SECOND OPTION, NOT THE FIRST. Logging a set used to mean
 * tapping a small field, waiting for the keyboard, typing, dismissing it, and
 * repeating that for every set of every exercise — with the keyboard covering
 * the row you were typing into. Between sets, out of breath, that is the most
 * expensive interaction in the app and it is the one people do most.
 *
 * So the primary path has no keyboard in it at all:
 *   · weight and reps are steppers — a −/+ pair either side of a large number
 *   · the number itself is still a text field, so anyone who prefers typing
 *     just taps it (2.5s, 47.5, whatever the plates actually are)
 *   · a full-width "Log set" button, not a 24pt circle to hit with a thumb
 *   · a logged set collapses to one compact line, so the list stays short and
 *     the set you are on stays on screen
 *
 * The values that make this work are upstream: reps arrive prefilled from the
 * coach's target, and weight carries forward from the set you just logged. The
 * common case for sets 2 and 3 is one tap on "Log set" and nothing else.
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
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { WeightUnit, unitLabel, unitLongName, weightStep } from '../../../lib/units';

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
  /**
   * The athlete's lifting unit (lib/units.ts). Decides the plate-sized step,
   * the suffix under the number, the logged summary and the spoken labels.
   */
  unit: WeightUnit;

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

/** Steppers work on numbers; the fields hold strings and may be empty. */
const toNum = (v: string): number => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** 137.5 -> "137.5", 140.0 -> "140". No trailing ".0" on a plate number. */
const fromNum = (n: number): string => String(Math.round(n * 100) / 100);

function Stepper({
  label,
  unit,
  value,
  onChange,
  step,
  min,
  fieldLabel,
  editable,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  min: number;
  fieldLabel: string;
  editable: boolean;
}) {
  const bump = (delta: number) => {
    const next = Math.max(min, toNum(value) + delta);
    Haptics.selectionAsync();
    onChange(fromNum(next));
  };

  return (
    <View style={st.stepper}>
      <Text style={st.stepperLabel}>{label}</Text>
      <View style={st.stepperControls}>
        <Pressable
          style={st.stepBtn}
          onPress={() => bump(-step)}
          hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${fieldLabel} by ${step}`}
          accessibilityState={{ disabled: !editable }}
        >
          <Ionicons name="remove" size={22} color={editable ? C.textPrimary : C.textFaint} />
        </Pressable>

        <View style={st.valueWrap}>
          {/* Still a real field: tap it and type. The steppers are the fast
              path, not the only path — 2.5lb jumps and odd dumbbells exist. */}
          <TextInput
            style={[st.value, !editable && st.valueDone]}
            value={value}
            onChangeText={onChange}
            placeholder="0"
            placeholderTextColor={C.textFaint}
            keyboardType="decimal-pad"
            editable={editable}
            selectTextOnFocus
            textAlign="center"
            accessibilityLabel={fieldLabel}
            accessibilityHint={editable ? 'Double tap to type an exact value' : undefined}
            accessibilityState={{ disabled: !editable }}
          />
          {unit ? <Text style={st.unit}>{unit}</Text> : null}
        </View>

        <Pressable
          style={st.stepBtn}
          onPress={() => bump(step)}
          hitSlop={{ top: 2, bottom: 2, left: 4, right: 4 }}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${fieldLabel} by ${step}`}
          accessibilityState={{ disabled: !editable }}
        >
          <Ionicons name="add" size={22} color={editable ? C.textPrimary : C.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}

export default function SessionSetRow({
  setNumber,
  exerciseName,
  weight,
  reps,
  completed,
  unit,
  seconds,
  timerRunning,
  timerElapsed,
  onChange,
  onLog,
  onToggleTimer,
}: SessionSetRowProps) {
  const shownSeconds = timerRunning ? timerElapsed : seconds ?? 0;
  const hasTime = timerRunning || (seconds ?? 0) > 0;
  /** Plate-sized jump in the athlete's unit; anything finer is a tap on the number. */
  const step = weightStep(unit);

  // ── Logged: one compact line ──────────────────────────────────────────────
  // A finished set has nothing left to adjust, and three expanded sets push the
  // one you are actually on below the fold. It stays tappable to correct a
  // mistake.
  if (completed) {
    const summary = [
      toNum(weight) > 0 ? `${weight} ${unitLabel(unit)}` : 'Bodyweight',
      `${reps || 0} reps`,
      (seconds ?? 0) > 0 ? formatClock(seconds!) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return (
      <Pressable
        style={st.doneRow}
        onPress={onLog}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: true }}
        accessibilityLabel={`Set ${setNumber} of ${exerciseName} logged. ${summary}`}
        accessibilityHint="Unlogs this set so you can change it"
      >
        <View style={st.doneBadge}>
          <Ionicons name="checkmark" size={19} color={C.onAccent} />
        </View>
        <Text style={st.doneLabel}>Set {setNumber}</Text>
        <Text style={st.doneSummary} numberOfLines={1}>{summary}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[st.row, timerRunning && st.rowTiming]}>
      <View style={st.head}>
        <Text style={st.setLabel}>Set {setNumber}</Text>

        {/* The stopwatch. Quiet until it has something to say. */}
        <Pressable
          style={[st.timerChip, timerRunning && st.timerChipOn]}
          onPress={onToggleTimer}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
            size={16}
            color={timerRunning ? C.accent : C.textMuted}
          />
          <Text style={[st.timerText, timerRunning && { color: C.accent }]}>
            {hasTime ? formatClock(shownSeconds) : 'Time this set'}
          </Text>
        </Pressable>
      </View>

      <View style={st.steppers}>
        <Stepper
          label="Weight"
          unit={unitLabel(unit)}
          value={weight}
          onChange={(v) => onChange('weight', v)}
          step={step}
          min={0}
          fieldLabel={`${exerciseName}, set ${setNumber}, weight in ${unitLongName(unit)}`}
          editable
        />
        <Stepper
          label="Reps"
          value={reps}
          onChange={(v) => onChange('reps', v)}
          step={1}
          min={0}
          fieldLabel={`${exerciseName}, set ${setNumber}, reps`}
          editable
        />
      </View>

      {/* The commit. Full width because it is the thing you press most, with a
          bar's worth of adrenaline and no patience for a 24pt circle. */}
      <Pressable
        style={st.logBtn}
        onPress={onLog}
        accessibilityRole="button"
        accessibilityLabel={`Log set ${setNumber} of ${exerciseName}`}
      >
        <Ionicons name="checkmark" size={19} color={C.onAccent} />
        <Text style={st.logText}>Log set</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  row: {
    backgroundColor: C.bg,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: C.borderMuted,
    padding: 12,
    gap: 12,
  },
  rowTiming: { borderColor: C.accent },

  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setLabel: {
    fontFamily: F.bodyBold,
    fontSize: 12,
    color: C.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: C.borderMuted,
  },
  timerChipOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
  timerText: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textMuted, fontVariant: ['tabular-nums'] },

  steppers: { flexDirection: 'row', gap: 10 },
  stepper: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    borderCurve: 'continuous',
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  stepperLabel: {
    textAlign: 'center',
    fontFamily: F.bodyBold,
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stepperControls: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: {
    // 40 wide rather than 44: the two of them plus the number have to fit a
    // 375pt screen inside a 20pt card inside a 12pt row. Height stays 44 and
    // hitSlop restores the missing 4pt horizontally, so the touch target is
    // still 48 x 44 even though the ink is narrower.
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  value: {
    width: '100%',
    padding: 0,
    fontFamily: F.headingBold,
    fontSize: 21,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  valueDone: { color: C.accent },
  unit: { fontFamily: F.bodyMedium, fontSize: 11, color: C.textFaint, marginTop: -2 },

  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 48,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: C.accent,
  },
  logText: { fontFamily: F.bodyBold, fontSize: 15.5, color: C.onAccent },

  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: C.accentSoft,
    backgroundColor: C.bg,
  },
  doneBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: {
    fontFamily: F.bodyBold,
    fontSize: 12,
    color: C.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  doneSummary: {
    flex: 1,
    textAlign: 'right',
    fontFamily: F.bodySemiBold,
    fontSize: 14.5,
    color: C.textSecondary,
  },
});
