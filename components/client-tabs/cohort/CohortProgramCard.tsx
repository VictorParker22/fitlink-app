/**
 * CohortProgramCard — the designed program header for a cohort pass.
 *
 * An evergreen pass is a subscription: you buy it, week 1 starts today. A
 * cohort is a PRODUCT WITH A DATE, and this card is that identity — a date
 * block as the visual anchor, the real run, the honest seat count, the
 * deadline WITH ITS REASON, and a three-point explainer of what a cohort is.
 *
 * Honesty rules (lib/cohort.ts owns the model; nothing here invents anything):
 *  · Every number and date comes from the coach's real plan row.
 *  · Scarcity is only ever stated, never pressed: the seat row shows a real
 *    cap, and the deadline always carries WHY it exists ("everyone starts
 *    together on Sep 8"). No countdowns, no timers, no resets, never red.
 *  · The seats row renders only when the coach set a real capacity AND the
 *    caller successfully counted enrollments. `spotsLeft = null` means
 *    "unknown" and the row is omitted entirely rather than guessed.
 *
 * Cohort-only: my-pass renders this for cohorts and nothing else, so evergreen
 * passes are untouched.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import {
  parseLocalDay, cohortEndDate, formatDay, formatRun, formatDeadline,
  type CohortFields, type EnrollmentState,
} from '../../../lib/cohort';

const C = CoachColors;
const F = CoachFonts;

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "September 8" — spoken form, for screen readers only. */
function spokenDay(date: Date | null): string | null {
  if (!date) return null;
  return `${MONTHS_LONG[date.getMonth()]} ${date.getDate()}`;
}

/** Pips stay readable up to this cap; above it the row becomes a fill bar. */
const MAX_PIPS = 20;

type Props = {
  /** The plan row — read only for its cohort fields. */
  plan: CohortFields;
  /** Real week count from the track (lib/passWeeks), used for the run + copy. */
  weeks: number;
  /** Where the cohort stands, from lib/cohort enrollmentState(). */
  state: EnrollmentState | null;
  /** Coach-set seat cap, or null when uncapped. */
  capacity?: number | null;
  /** Real seats left. null/undefined = unknown ⇒ the seats row is omitted. */
  spotsLeft?: number | null;
  /**
   * 'store' — pre-purchase: deadline line and seats show.
   * 'enrolled' — the athlete is in it: dates only, no selling.
   */
  variant?: 'store' | 'enrolled';
  reducedMotion: boolean;
  style?: StyleProp<ViewStyle>;
};

export default function CohortProgramCard({
  plan,
  weeks,
  state,
  capacity,
  spotsLeft,
  variant = 'store',
  reducedMotion,
  style,
}: Props) {
  // ── Real dates ────────────────────────────────────────────────────────────
  const start = parseLocalDay(plan?.starts_on);
  // cohortEndDate needs duration_weeks or a track; fall back to the caller's
  // real week count, which is the same math on the same track.
  const end = cohortEndDate(plan) ?? (start && weeks > 0
    ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + weeks * 7 - 1)
    : null);

  const startLabel = formatDay(start);
  const runLine = start && end ? `${startLabel} – ${formatDay(end)}` : formatRun(plan);
  const finished = state === 'finished';
  const weekLabel = weeks > 0 ? `${weeks} week${weeks === 1 ? '' : 's'}` : null;

  // ── Deadline, always with its reason (the research: state the limit and WHY)
  const deadlineBase = variant === 'store' ? formatDeadline(plan) : null;
  const closingSoon = state === 'closing-soon';
  const stillOpen = state === 'open' || state === 'closing-soon';
  const deadlineLine = deadlineBase
    ? (stillOpen && startLabel
        ? `${deadlineBase} — everyone starts together on ${startLabel}`
        : deadlineBase)
    : null;

  // ── Seats — only with a real cap AND a successful count ───────────────────
  const cap = typeof capacity === 'number' && capacity > 0 ? capacity : null;
  const left = typeof spotsLeft === 'number' ? Math.max(0, Math.min(spotsLeft, cap ?? spotsLeft)) : null;
  const showSeats = variant === 'store' && cap !== null && left !== null;
  const taken = showSeats ? (cap as number) - (left as number) : 0;
  const seatsLabel = showSeats
    ? ((left as number) > 0 ? `${left} of ${cap} spots left` : `All ${cap} spots taken`)
    : null;

  // ── The explainer — three points, each built from real plan data ──────────
  const points = [
    startLabel ? { icon: 'calendar-outline' as const, text: `Starts ${startLabel} for everyone` } : null,
    weekLabel ? { icon: 'layers-outline' as const, text: `${weekLabel}, week by week` } : null,
    { icon: 'people-outline' as const, text: 'You move with the group' },
  ].filter(Boolean) as { icon: 'calendar-outline' | 'layers-outline' | 'people-outline'; text: string }[];
  const showPoints = variant === 'store' && points.length > 0;

  // ── Entrance: date block, then seats. Reduce Motion jumps to final values.
  const dateIn = useSharedValue(reducedMotion ? 1 : 0);
  const seatsIn = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      dateIn.value = 1;
      seatsIn.value = 1;
      return;
    }
    const ease = { duration: 380, easing: Easing.out(Easing.cubic) };
    dateIn.value = withTiming(1, ease);
    seatsIn.value = withDelay(140, withTiming(1, ease));
  }, [reducedMotion, dateIn, seatsIn]);

  const dateStyle = useAnimatedStyle(() => ({
    opacity: dateIn.value,
    transform: [{ translateY: (1 - dateIn.value) * 8 }],
  }));
  const seatsStyle = useAnimatedStyle(() => ({
    opacity: seatsIn.value,
    transform: [{ translateY: (1 - seatsIn.value) * 6 }],
  }));

  const spokenStart = spokenDay(start);
  const spokenEnd = spokenDay(end);
  const dateA11y = spokenStart
    ? (spokenEnd && weekLabel
        ? `Starts ${spokenStart}, runs ${weekLabel} to ${spokenEnd}`
        : `Starts ${spokenStart}`)
    : (runLine ?? 'Program dates');

  if (!start) return null; // not a cohort — caller shouldn't have rendered us

  return (
    <View style={[s.card, style]}>
      {/* Date block — the anchor. A program with a date, not a subscription. */}
      <Animated.View style={[s.dateRow, dateStyle]} accessible accessibilityLabel={dateA11y}>
        <View style={s.dateTile}>
          <Text style={s.dateDay}>{start.getDate()}</Text>
          <Text style={s.dateMonth}>{MONTHS_SHORT[start.getMonth()]}</Text>
        </View>
        <View style={s.dateMeta}>
          <Text style={s.dateEyebrow}>{finished ? 'Program ran' : 'Program dates'}</Text>
          {runLine ? <Text style={s.dateRun}>{runLine}</Text> : null}
          {weekLabel ? <Text style={s.dateWeeks}>{weekLabel}</Text> : null}
        </View>
      </Animated.View>

      {/* Deadline — the fact, and the reason it exists. Never red. */}
      {deadlineLine ? (
        <View style={s.deadlineRow} accessible accessibilityLabel={deadlineLine}>
          <Ionicons
            name="time-outline"
            size={13}
            color={closingSoon ? C.warning : C.textMuted}
            style={s.deadlineIcon}
          />
          <Text style={[s.deadlineText, closingSoon && s.deadlineWarning]}>{deadlineLine}</Text>
        </View>
      ) : null}

      {/* Seats — a real cap, counted. Omitted entirely when unknown. */}
      {showSeats ? (
        <Animated.View style={seatsStyle} accessible accessibilityLabel={seatsLabel ?? undefined}>
          {(cap as number) <= MAX_PIPS ? (
            <View style={s.pipRow}>
              {Array.from({ length: cap as number }, (_, i) => (
                <View key={i} style={[s.pip, i < taken ? s.pipTaken : s.pipOpen]} />
              ))}
            </View>
          ) : (
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${Math.round((taken / (cap as number)) * 100)}%` }]} />
            </View>
          )}
          <Text style={s.seatsLabel}>{seatsLabel}</Text>
        </Animated.View>
      ) : null}

      {/* How a cohort works — three true points, one grouped label. */}
      {showPoints ? (
        <View
          style={s.points}
          accessible
          accessibilityLabel={`How a cohort works. ${points.map(p => p.text).join('. ')}.`}
        >
          <Text style={s.pointsTitle}>How a cohort works</Text>
          {points.map(p => (
            <View key={p.text} style={s.pointRow}>
              <Ionicons name={p.icon} size={13} color={C.accent} />
              <Text style={s.pointText}>{p.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderMuted,
    padding: 14,
    gap: 13,
  },

  // Date block
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  dateTile: {
    width: 58,
    paddingVertical: 9,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accentSoft,
    borderWidth: 1,
    borderColor: C.accentSofter,
  },
  dateDay: { fontFamily: F.headingBold, fontSize: 29, lineHeight: 33.5, color: C.accent },
  dateMonth: {
    fontFamily: F.bodyBold, fontSize: 11, color: C.accent,
    letterSpacing: 1.4, marginTop: 1,
  },
  dateMeta: { flex: 1 },
  dateEyebrow: {
    fontFamily: F.bodyBold, fontSize: 10.5, color: C.textFaint,
    letterSpacing: 1.1, textTransform: 'uppercase',
  },
  dateRun: { fontFamily: F.headingSemiBold, fontSize: 18, color: C.textPrimary, marginTop: 4 },
  dateWeeks: { fontFamily: F.body, fontSize: 13.5, color: C.textMuted, marginTop: 2 },

  // Deadline
  deadlineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  deadlineIcon: { marginTop: 2 },
  deadlineText: {
    flex: 1, fontFamily: F.bodySemiBold, fontSize: 14,
    color: C.textSecondary, lineHeight: 20,
  },
  deadlineWarning: { color: C.warning },

  // Seats
  pipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  pip: { width: 11, height: 11, borderRadius: 6 },
  pipTaken: { backgroundColor: C.accent },
  pipOpen: { borderWidth: 1, borderColor: C.border },
  barTrack: { height: 5, borderRadius: 3, backgroundColor: C.borderMuted, overflow: 'hidden' },
  barFill: { height: 5, borderRadius: 3, backgroundColor: C.accent },
  seatsLabel: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textSecondary, marginTop: 7 },

  // How a cohort works
  points: {
    borderTopWidth: 1, borderTopColor: C.borderMuted,
    paddingTop: 12, gap: 7,
  },
  pointsTitle: {
    fontFamily: F.bodyBold, fontSize: 10.5, color: C.textFaint,
    letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 1,
  },
  pointRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pointText: { fontFamily: F.body, fontSize: 14, color: C.textSecondary, flex: 1 },
});
