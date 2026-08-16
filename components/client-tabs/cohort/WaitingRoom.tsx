/**
 * WaitingRoom — the Train tab for a cohort athlete who has bought in but
 * whose season has not started yet.
 *
 * The gap this closes: buying a dated programme three weeks early used to
 * land on a track of untouchable future nodes under a one-line "starts
 * Tuesday". That reads as nothing bought. This screen is the receipt and the
 * reassurance: you're in, here is the run, here is exactly what week one
 * holds, here is what to have ready, and here is your coach.
 *
 * Honesty rules (same as everywhere else in the season surface):
 *  · The countdown is a stated fact from the coach's real starts_on
 *    (lib/cohortPreStart preStartLine). No ticking timer, no theatrics.
 *  · Week one is read from the enrollment's own track snapshot, dated with
 *    lib/cohort dateForNode + formatNodeDay — the same labels the running
 *    season will use, so nothing changes shape on day one.
 *  · Every GET READY item is derived from real data (equipment actually
 *    required by week-one exercises, a real trainer, a genuinely empty
 *    intake goal). An item that cannot be grounded is omitted, not invented.
 *  · Cohort size comes from a real RPC and appears only when it returns more
 *    than one athlete. Any error, or a count of one, and the line is gone.
 *
 * Evergreen passes never reach this component — workouts.tsx gates it behind
 * isPreStart(), which is false without a real start date.
 *
 * Fixed dark/lime system (constants/coachDesign.ts).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../../lib/supabase';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { dateForNode, formatNodeDay, formatRun, type CohortFields } from '../../../lib/cohort';
import { preStartLine } from '../../../lib/cohortPreStart';
import { weekOfPosition, weekStartIndices } from '../../../lib/passWeeks';
import type { TrackNode } from '../../../context/AppContext';
import Avatar from '../../Avatar';

const C = CoachColors;
const F = CoachFonts;

const WEEK_LABEL_RE = /^Week (\d+):\s*/;

/** exercises.equipment tokens that are not gear to have ready. */
const NON_GEAR = new Set(['', 'none', 'other', 'bodyweight', 'body weight', 'body_weight']);

/** Token → the words an athlete would actually use. Unknown tokens are
 *  title-cased rather than dropped — the coach's own value is still real. */
const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  dumbbells: 'Dumbbells',
  kettlebell: 'Kettlebell',
  cable: 'Cable machine',
  machine: 'Machines',
  bands: 'Resistance bands',
  band: 'Resistance bands',
  'resistance band': 'Resistance bands',
  bench: 'Bench',
  'pull up bar': 'Pull-up bar',
  mat: 'Mat',
};

function equipmentLabel(token: string): string {
  const key = token.toLowerCase().trim();
  return EQUIPMENT_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

export type WaitingRoomNode = {
  index: number;
  node: TrackNode;
  name: string;
  kind: 'workout' | 'diet' | 'class' | 'milestone';
  dayLabel: string | null;
};

type Props = {
  planName: string;
  /** The enrolled plan — read for its cohort fields and its id (RPC). */
  plan: (CohortFields & { id?: string }) | null;
  track: TrackNode[];
  durationWeeks: number | null;
  /** Resolves a track node's workout id into the trainer's real workout row. */
  workoutById: (id?: string) => any;
  trainerName: string | null;
  trainerAvatarUrl: string | null;
  coachFirst: string;
  /** True when the athlete's intake goal is genuinely absent. */
  goalMissing: boolean;
  onMessageCoach: () => void;
  /** Toggles the full track below this component (owned by the Train tab). */
  fullPlanShown: boolean;
  onToggleFullPlan: () => void;
};

export default function WaitingRoom({
  planName,
  plan,
  track,
  durationWeeks,
  workoutById,
  trainerName,
  trainerAvatarUrl,
  coachFirst,
  goalMissing,
  onMessageCoach,
  fullPlanShown,
  onToggleFullPlan,
}: Props) {
  const runLine = formatRun(plan);
  const startLine = preStartLine(plan);

  // ── Week one, from the real snapshot ──────────────────────────────────────
  // Same convention as SeasonTrack: the week-start "Week 1: …" milestone
  // names the week instead of rendering as a row.
  const weekOne = useMemo(() => {
    const starts = new Set(weekStartIndices(track, durationWeeks));
    let title: string | null = null;
    let isRestWeek = false;
    const rows: WaitingRoomNode[] = [];

    track.forEach((node, i) => {
      if (weekOfPosition(i, track, durationWeeks) !== 1) return;

      if (node.type === 'milestone' && node.label && WEEK_LABEL_RE.test(node.label) && starts.has(i)) {
        const text = node.label.replace(WEEK_LABEL_RE, '').trim();
        if (/^rest week$/i.test(text)) isRestWeek = true;
        else if (text) title = text;
        return;
      }

      const dayLabel = formatNodeDay(dateForNode(plan, track, i));

      if (node.type === 'workout') {
        const w = workoutById(node.id);
        rows.push({
          index: i,
          node,
          kind: 'workout',
          name: w?.name || node.label || 'Session',
          dayLabel,
        });
        return;
      }
      if (node.type === 'diet') {
        rows.push({ index: i, node, kind: 'diet', name: 'Meal plan', dayLabel });
        return;
      }
      if (node.type === 'class') {
        rows.push({ index: i, node, kind: 'class', name: node.label || 'Class session', dayLabel });
        return;
      }
      const label = (node.label || '').trim();
      if (label) rows.push({ index: i, node, kind: 'milestone', name: label, dayLabel });
    });

    return { title, isRestWeek, rows };
  }, [track, durationWeeks, plan, workoutById]);

  const sessionCount = weekOne.rows.filter((r) => r.kind === 'workout').length;

  // ── Equipment, aggregated from week one's real exercises ──────────────────
  // Distinct exercises.equipment across every week-one workout, bodyweight
  // and unresolvable rows dropped. Empty ⇒ the whole item is omitted.
  const equipment = useMemo(() => {
    const seen = new Set<string>();
    weekOne.rows.forEach((row) => {
      if (row.kind !== 'workout') return;
      const w = workoutById(row.node.id);
      const exercises: any[] = w?.workout_exercises || [];
      exercises.forEach((we) => {
        const raw = we?.exercises?.equipment;
        if (typeof raw !== 'string') return;
        const key = raw.toLowerCase().trim();
        if (NON_GEAR.has(key)) return;
        seen.add(key);
      });
    });
    return Array.from(seen).map(equipmentLabel).sort();
  }, [weekOne.rows, workoutById]);

  // ── Cohort size — real RPC only, never a fabricated number ────────────────
  const planId = plan?.id || null;
  const [cohortSize, setCohortSize] = useState<number | null>(null);

  useEffect(() => {
    setCohortSize(null);
    if (!planId) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('cohort_member_count', { p_plan_id: planId });
        if (!alive || error) return;
        const n = typeof data === 'number' ? data : Number(data);
        if (Number.isFinite(n) && n > 1) setCohortSize(n);
      } catch {
        // The RPC may not exist yet — silence is correct, a guess is not.
      }
    })();
    return () => {
      alive = false;
    };
  }, [planId]);

  // ── GET READY — every item grounded, or absent ────────────────────────────
  const prep: { key: string; icon: any; title: string; body: string; action?: () => void; actionLabel?: string }[] = [];

  if (equipment.length > 0) {
    prep.push({
      key: 'equipment',
      icon: 'barbell-outline',
      title: 'What week one needs',
      body: `${equipment.join(', ')} — that is everything the first week's exercises call for.`,
    });
  }
  if (trainerName) {
    prep.push({
      key: 'coach-message',
      icon: 'chatbubble-outline',
      title: `${coachFirst} will message you here`,
      body: 'Your thread is already open, so anything before day one lands in the app.',
    });
  }
  if (goalMissing) {
    prep.push({
      key: 'goal',
      icon: 'flag-outline',
      title: 'Your goal is not on file',
      body: `${coachFirst} has no training goal saved for you. Send it over before week one and the coaching starts informed.`,
      action: onMessageCoach,
      actionLabel: `Tell ${coachFirst}`,
    });
  }

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  const iconFor = (kind: WaitingRoomNode['kind']) =>
    kind === 'workout'
      ? 'barbell-outline'
      : kind === 'diet'
        ? 'nutrition-outline'
        : kind === 'class'
          ? 'people-outline'
          : 'flag-outline';

  return (
    <View>
      {/* ── You're in ─────────────────────────────────────────────────────── */}
      <View
        accessible={true}
        accessibilityLabel={`You're in. ${planName}.${runLine ? ` Runs ${runLine}.` : ''}${startLine ? ` ${startLine}.` : ''}${cohortSize ? ` ${cohortSize} athletes start with you.` : ''}`}
      >
        <View style={s.confirmRow}>
          <View style={s.checkCircle}>
            <Ionicons name="checkmark" size={15} color={C.onAccent} />
          </View>
          <Text style={s.eyebrow}>{"You're in"}</Text>
        </View>
        <Text style={s.title}>{planName}</Text>
        {runLine ? <Text style={s.runLine}>{runLine}</Text> : null}
        {startLine ? <Text style={s.startLine}>{startLine}</Text> : null}
        {cohortSize ? (
          <Text style={s.sizeLine}>{cohortSize} athletes start with you</Text>
        ) : null}
      </View>

      {/* ── Week one ──────────────────────────────────────────────────────── */}
      {weekOne.rows.length > 0 || weekOne.isRestWeek ? (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Week one</Text>
          <Text style={s.sectionSub}>
            {weekOne.title
              ? `${weekOne.title} — ${sessionCount > 0 ? `${sessionCount} session${sessionCount === 1 ? '' : 's'}, on these days.` : 'on these days.'}`
              : sessionCount > 0
                ? `${sessionCount} session${sessionCount === 1 ? '' : 's'} on these days. This is what the first week holds.`
                : 'This is what the first week holds.'}
          </Text>

          <View
            style={s.weekList}
            accessible={true}
            accessibilityLabel={`Week one: ${weekOne.rows
              .map((r) => `${r.name}${r.dayLabel ? `, ${r.dayLabel}` : ''}`)
              .join('. ')}`}
          >
            {weekOne.isRestWeek && weekOne.rows.length === 0 ? (
              <View style={s.weekRow}>
                <View style={s.rowIcon}>
                  <Ionicons name="moon-outline" size={14} color={C.textFaint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName}>Rest week</Text>
                  <Text style={s.rowDay}>Recovery is part of the plan</Text>
                </View>
              </View>
            ) : (
              weekOne.rows.map((row) => (
                <View key={row.index} style={s.weekRow}>
                  <View style={s.rowIcon}>
                    <Ionicons name={iconFor(row.kind)} size={14} color={C.textFaint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName} numberOfLines={1}>
                      {row.name}
                    </Text>
                    {row.dayLabel ? <Text style={s.rowDay}>{row.dayLabel}</Text> : null}
                  </View>
                </View>
              ))
            )}
          </View>

          <Pressable hitSlop={{ top: 3, bottom: 3 }}
            style={s.ghostBtn}
            onPress={() => {
              tap();
              onToggleFullPlan();
            }}
            accessibilityRole="button"
            accessibilityLabel={fullPlanShown ? 'Hide the full plan' : 'See the full plan'}
            accessibilityState={{ expanded: fullPlanShown }}
            accessibilityHint={
              fullPlanShown ? 'Collapses every week back down' : 'Shows every week of the season below'
            }
          >
            <Text style={s.ghostBtnText}>{fullPlanShown ? 'Hide the full plan' : 'See the full plan'}</Text>
            <Ionicons name={fullPlanShown ? 'chevron-up' : 'chevron-down'} size={14} color={C.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* ── Get ready ─────────────────────────────────────────────────────── */}
      {prep.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Get ready</Text>
          <View style={{ gap: 9, marginTop: 11 }}>
            {prep.map((item) => (
              <View
                key={item.key}
                style={s.prepCard}
                accessible={!item.action}
                accessibilityLabel={!item.action ? `${item.title}. ${item.body}` : undefined}
              >
                <View style={s.rowIcon}>
                  <Ionicons name={item.icon} size={14} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.prepTitle}>{item.title}</Text>
                  <Text style={s.prepBody}>{item.body}</Text>
                  {item.action && item.actionLabel ? (
                    <Pressable hitSlop={{ top: 7, bottom: 7 }}
                      style={s.prepAction}
                      onPress={() => {
                        tap();
                        item.action?.();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.title}. ${item.body}. ${item.actionLabel}`}
                    >
                      <Text style={s.prepActionText}>{item.actionLabel}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Your coach ────────────────────────────────────────────────────── */}
      {trainerName ? (
        <View style={s.section}>
          <Text style={s.sectionLabel}>Your coach</Text>
          <View style={s.coachRow}>
            <Avatar name={trainerName} imageUrl={trainerAvatarUrl} size="md" />
            <View style={{ flex: 1 }}>
              <Text style={s.coachName} numberOfLines={1}>
                {trainerName}
              </Text>
              <Text style={s.coachSub} numberOfLines={1}>
                Running {planName}
              </Text>
            </View>
            <Pressable hitSlop={{ top: 5, bottom: 5 }}
              style={s.coachBtn}
              onPress={() => {
                tap();
                onMessageCoach();
              }}
              accessibilityRole="button"
              accessibilityLabel={`Message ${trainerName}`}
              accessibilityHint="Opens your thread with your coach"
            >
              <Text style={s.coachBtnText}>Message {coachFirst}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: F.headingBold,
    fontSize: 28,
    lineHeight: 33,
    color: C.textPrimary,
    marginTop: 12,
  },
  runLine: { fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textMuted, marginTop: 6 },
  startLine: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary, marginTop: 10 },
  sizeLine: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 5 },

  section: {
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
    marginTop: 28,
    paddingTop: 18,
  },
  sectionLabel: {
    fontFamily: F.bodyBold,
    fontSize: 11,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionSub: { fontFamily: F.body, fontSize: 12, color: C.textMuted, lineHeight: 17, marginTop: 4 },

  weekList: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
  },
  rowIcon: { width: 22, alignItems: 'center' },
  rowName: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },
  rowDay: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 2 },

  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 11,
    marginTop: 12,
  },
  ghostBtnText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },

  prepCard: {
    flexDirection: 'row',
    gap: 11,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  prepTitle: { fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },
  prepBody: { fontFamily: F.body, fontSize: 12, color: C.textMuted, marginTop: 3, lineHeight: 17 },
  prepAction: {
    alignSelf: 'flex-start',
    backgroundColor: C.accentSoft,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    marginTop: 10,
  },
  prepActionText: { fontFamily: F.bodySemiBold, fontSize: 11.5, color: C.accent },

  coachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  coachName: { fontFamily: F.bodySemiBold, fontSize: 14, color: C.textPrimary },
  coachSub: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted, marginTop: 2 },
  coachBtn: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  coachBtnText: { fontFamily: F.bodySemiBold, fontSize: 12, color: C.textSecondary },
});
