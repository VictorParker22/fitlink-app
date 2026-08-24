/**
 * ClientCopilot — the athlete's "what's next" stack on the Today screen.
 *
 * A single card ("From your coach") with up to 4 prioritized rows, each one
 * derived from real context/Supabase data — a row with no real data behind it
 * is omitted, and if every row is empty the card renders nothing.
 *
 * Priority order:
 *   1. Unread coach message (passed in from the Today screen's existing fetch)
 *   2. Slip recovery — a missed assigned workout gets a warm one-tap "move it
 *      to today" (never shame; after the move it becomes a normal up-next row)
 *   3. New assignment — latest unseen client_workouts row (last 7 days)
 *   4. Next session — soonest upcoming booked session
 *   5. Training streak — consecutive days from real history (≥2 only); when
 *      it's ≥3 and today is still open, the row flips to "on the line"
 *   6. Hydration — remaining to goal, only if water was logged today
 *      (reads the same AsyncStorage keys HydrationCell writes)
 *
 * Rows are individually dismissible for the day (ids + date in AsyncStorage).
 * Tapping the assignment row marks that assignment permanently seen.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../../context/ClientContext';
import { useAlert } from '../../../context/AlertContext';
import { useWorkout } from '../../../context/WorkoutContext';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';
import { useReducedMotion } from '../../../lib/useReducedMotion';
import { computeStreak, overdueAssigned } from '../../../lib/streak';

const C = CoachColors;
const F = CoachFonts;

// ─── Storage keys ─────────────────────────────────────────────────────────────

const DISMISS_KEY = 'fitlink_copilot_dismissed_v1';
const SEEN_ASSIGNMENTS_KEY = 'fitlink_copilot_seen_assignments_v1';

// Mirror HydrationCell exactly — same key prefix, same daily goal.
const HYDRATION_PREFIX = 'fitlink_hydration_';
const HYDRATION_GOAL_OZ = 96;

// An assignment only counts as "new" for this long after it was created.
const NEW_ASSIGNMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CoachMessagePreview {
  id: string;
  content: string;
  created_at: string;
  read?: boolean | null;
}

interface ClientCopilotProps {
  /** Latest trainer message, if the parent already fetched one (with `read`). */
  latestCoachMessage?: CoachMessagePreview | null;
}

interface CopilotRow {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Real coach photo for coach-authored rows; the icon circle is the honest fallback. */
  avatarUrl?: string;
  title: string;
  sub: string;
  onPress?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

/** Human-readable snippet for special message payloads. */
function messageSnippet(content: string): string {
  if (content === '[IMAGE]') return 'Sent you an image';
  if (content.startsWith('[WORKOUT_CARD:')) return 'Sent you a workout';
  if (content === '[CHECKIN_REQUEST]') return 'Asked for your weekly check-in';
  return content;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientCopilot({ latestCoachMessage }: ClientCopilotProps) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { showAlert } = useAlert();
  const { trainer, workouts, upcomingSessions, rescheduleWorkoutToToday } = useClient();
  const { workoutHistory } = useWorkout();

  // null = storage not loaded yet; render nothing until then to avoid a flash
  // of rows that were already dismissed today.
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  const [seenAssignments, setSeenAssignments] = useState<string[]>([]);
  const [hydrationOz, setHydrationOz] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const today = new Date().toDateString();
        const [dRaw, sRaw, hRaw] = await Promise.all([
          AsyncStorage.getItem(DISMISS_KEY),
          AsyncStorage.getItem(SEEN_ASSIGNMENTS_KEY),
          AsyncStorage.getItem(HYDRATION_PREFIX + today),
        ]);
        if (!alive) return;
        if (dRaw) {
          const parsed: { date?: string; ids?: string[] } = JSON.parse(dRaw);
          setDismissed(new Set(parsed.date === today ? parsed.ids || [] : []));
        } else {
          setDismissed(new Set());
        }
        if (sRaw) setSeenAssignments(JSON.parse(sRaw) || []);
        if (hRaw) setHydrationOz(parseInt(hRaw, 10) || 0);
      } catch {
        if (alive) setDismissed(new Set());
      }
    })();
    return () => { alive = false; };
  }, []);

  const dismissRow = useCallback((id: string) => {
    Haptics.selectionAsync();
    setDismissed((prev) => {
      const next = new Set(prev ?? []);
      next.add(id);
      AsyncStorage.setItem(
        DISMISS_KEY,
        JSON.stringify({ date: new Date().toDateString(), ids: [...next] })
      ).catch(() => {});
      return next;
    });
  }, []);

  const markAssignmentSeen = useCallback((rowId: string) => {
    setSeenAssignments((prev) => {
      if (prev.includes(rowId)) return prev;
      const next = [...prev, rowId].slice(-50); // keep the list bounded
      AsyncStorage.setItem(SEEN_ASSIGNMENTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── Streak — shared computation, extracted to lib/streak.ts ──────────────
  const streak = useMemo(() => computeStreak(workoutHistory, workouts), [workoutHistory, workouts]);

  // ── Slip recovery — the most recently missed assigned workout ────────────
  // A client_workouts row still 'assigned' with a date before today. One tap
  // moves it to today (optimistic; the context reverts on failure). Only rows
  // with a real workout name qualify — the copy needs something to say.
  const slipped = useMemo(
    () => overdueAssigned(workouts).find((w: any) => w.workouts?.name) || null,
    [workouts]
  );

  // The workout just moved to today this session — its row becomes the normal
  // "up next" state instead of the recovery ask.
  const [recovered, setRecovered] = useState<any | null>(null);

  const recoverSlip = useCallback(async (w: any) => {
    Haptics.selectionAsync();
    setRecovered(w); // optimistic — flips the row to "up next" immediately
    const ok = await rescheduleWorkoutToToday(w.id);
    if (!ok) {
      setRecovered(null);
      showAlert({ type: 'error', title: 'Could not move it', message: 'Something went wrong on our end. Give it another try in a moment.' });
    }
  }, [rescheduleWorkoutToToday, showAlert]);

  // ── Rows — every line built from real data or skipped ────────────────────
  const rows = useMemo<CopilotRow[]>(() => {
    if (!trainer) return [];
    const out: CopilotRow[] = [];
    const coachFirst = firstName(trainer.name) || 'Your coach';

    // 1. Unread coach message — the coach-attention echo, always the top row.
    if (latestCoachMessage && latestCoachMessage.read === false) {
      out.push({
        id: `msg-${latestCoachMessage.id}`,
        icon: 'chatbubble-ellipses',
        avatarUrl: trainer.avatar_url || undefined,
        title: `Coach ${coachFirst} messaged you`,
        sub: messageSnippet(latestCoachMessage.content),
        onPress: () => router.push(ClientRoute.myMessages),
      });
    }

    // 2. Slip recovery — the top non-message row when a workout was missed.
    //    Warm and forward-looking, never shame; one tap moves it to today.
    //    Once moved (this session), the same slot is the normal up-next row.
    if (recovered) {
      const workoutId = recovered.workout_id || recovered.workouts?.id;
      out.push({
        id: `recovered-${recovered.id}`,
        icon: 'barbell',
        title: `${recovered.workouts?.name || 'Your workout'} is on for today`,
        sub: 'Back on the plan — start whenever you’re ready',
        onPress: () => {
          if (workoutId) {
            router.push({ pathname: ClientRoute.workouts, params: { startWorkoutId: String(workoutId) } });
          } else {
            router.push(ClientRoute.workouts);
          }
        },
      });
    } else if (slipped) {
      out.push({
        id: `slip-${slipped.id}`,
        icon: 'refresh',
        title: `You missed ${slipped.workouts.name} — move it to today?`,
        sub: 'Life happens. Pick up where you left off.',
        onPress: () => recoverSlip(slipped),
      });
    }

    // 3. New assignment — latest unseen client_workouts row from the last week.
    const assignment = (workouts || [])
      .filter((w: any) => {
        if (w.status !== 'assigned' || !w.workouts?.name) return false;
        // The slip/recovery slot already owns this workout — don't repeat it.
        if (w.id === slipped?.id || w.id === recovered?.id) return false;
        if (seenAssignments.includes(`assign-${w.id}`)) return false;
        const created = new Date(w.created_at || w.assigned_date);
        if (Number.isNaN(created.getTime())) return false;
        return Date.now() - created.getTime() <= NEW_ASSIGNMENT_WINDOW_MS;
      })
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at || b.assigned_date).getTime() -
          new Date(a.created_at || a.assigned_date).getTime()
      )[0];
    if (assignment) {
      const rowId = `assign-${assignment.id}`;
      const workoutId = assignment.workout_id || assignment.workouts?.id;
      const assignedDate = new Date(assignment.assigned_date);
      const exCount: number = assignment.workouts?.workout_exercises?.length || 0;
      const subParts: string[] = [];
      if (!Number.isNaN(assignedDate.getTime())) {
        subParts.push(
          `For ${assignedDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`
        );
      }
      if (exCount > 0) subParts.push(`${exCount} exercise${exCount === 1 ? '' : 's'}`);
      out.push({
        id: rowId,
        icon: 'barbell',
        title: `Coach ${coachFirst} sent you ${assignment.workouts.name}`,
        sub: subParts.join(' · ') || 'On your plan',
        onPress: () => {
          markAssignmentSeen(rowId);
          if (workoutId) {
            router.push({ pathname: ClientRoute.workouts, params: { startWorkoutId: String(workoutId) } });
          } else {
            router.push(ClientRoute.workouts);
          }
        },
      });
    }

    // 4. Next session — soonest upcoming booked session with a real date/time.
    const nextSession = [...(upcomingSessions || [])]
      .filter((s: any) => s?.date && !Number.isNaN(new Date(s.date).getTime()))
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
    if (nextSession) {
      const d = new Date(nextSession.date);
      const subParts = [
        d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      ];
      if (nextSession.duration) subParts.push(`${nextSession.duration} min`);
      out.push({
        id: `session-${nextSession.id}`,
        icon: 'calendar',
        title: `Next session with ${coachFirst}`,
        sub: subParts.join(' · '),
        onPress: () => router.push(ClientRoute.mySessions),
      });
    }

    // 5. Streak — only when it's a real streak (2+ consecutive days). At ≥3
    //    with today still open, honest loss-aversion: the streak is on the
    //    line. A broken streak never gets a row — recovery (above) does the
    //    talking instead of the loss.
    if (streak.days >= 3 && !streak.trainedToday) {
      out.push({
        id: 'streak',
        icon: 'flame',
        title: `${streak.days}-day streak on the line`,
        sub: 'Train today to keep it going',
        onPress: () => router.push(ClientRoute.myProgress),
      });
    } else if (streak.days >= 2) {
      out.push({
        id: 'streak',
        icon: 'flame',
        title: `${streak.days}-day training streak`,
        sub: streak.trainedToday
          ? 'Trained today — streak is safe'
          : 'Trained yesterday — today keeps it alive',
        onPress: () => router.push(ClientRoute.myProgress),
      });
    }

    // 6. Hydration — only if water was actually logged today and the goal
    //    isn't hit yet. No route: logging lives in the hydration widget.
    if (hydrationOz > 0 && hydrationOz < HYDRATION_GOAL_OZ) {
      out.push({
        id: 'hydration',
        icon: 'water',
        title: `${HYDRATION_GOAL_OZ - hydrationOz} oz of water to go`,
        sub: `${hydrationOz} oz logged today`,
      });
    }

    return out.filter((r) => !dismissed?.has(r.id)).slice(0, 4);
  }, [
    trainer, latestCoachMessage, workouts, seenAssignments, upcomingSessions,
    streak, hydrationOz, dismissed, router, markAssignmentSeen,
    slipped, recovered, recoverSlip,
  ]);

  // Storage not loaded yet, or nothing real to say — render nothing.
  if (!dismissed || rows.length === 0) return null;

  return (
    <View style={st.card}>
      <Text style={st.eyebrow}>From your coach</Text>
      {rows.map((row, i) => (
        <Animated.View
          key={row.id}
          entering={reduced ? undefined : FadeInDown.delay(i * 80).duration(320)}
          exiting={reduced ? undefined : FadeOut.duration(160)}
          layout={LinearTransition.duration(200)}
        >
          <Pressable
            style={({ pressed }) => [
              st.row,
              i > 0 && st.rowBorder,
              pressed && !!row.onPress && { opacity: 0.7 },
            ]}
            onPress={row.onPress}
            disabled={!row.onPress}
            accessibilityRole={row.onPress ? 'button' : undefined}
            accessibilityLabel={`${row.title}. ${row.sub}`}
          >
            {row.avatarUrl ? (
              <Image source={{ uri: row.avatarUrl }} style={st.avatarCircle} />
            ) : (
              <View style={st.iconCircle}>
                <Ionicons name={row.icon} size={18} color={C.accent} />
              </View>
            )}
            <View style={st.rowTextCol}>
              <Text style={st.rowTitle} numberOfLines={1}>{row.title}</Text>
              <Text style={st.rowSub} numberOfLines={2}>{row.sub}</Text>
            </View>
            <Pressable
              onPress={() => dismissRow(row.id)}
              hitSlop={12}
              style={st.dismissBtn}
              accessibilityRole="button"
              accessibilityLabel={`Dismiss for today: ${row.title}`}
            >
              <Ionicons name="close" size={16} color={C.textFaint} />
            </Pressable>
            {!!row.onPress && (
              <Ionicons name="chevron-forward" size={17} color={C.textMuted} />
            )}
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  card: {
    marginTop: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderMuted,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 15,
    paddingTop: 14,
    paddingBottom: 4,
  },
  eyebrow: {
    fontFamily: F.bodyBold,
    fontSize: 12.5,
    color: C.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: C.borderMuted,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderCurve: 'continuous',
    backgroundColor: C.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same footprint as iconCircle — the coach's real photo replaces the icon,
  // never resizes the row. Background shows while the image loads.
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderCurve: 'continuous',
    backgroundColor: C.accentSoft,
  },
  rowTextCol: { flex: 1 },
  rowTitle: {
    fontFamily: F.bodySemiBold,
    fontSize: 15,
    color: C.textPrimary,
  },
  rowSub: {
    fontFamily: F.body,
    fontSize: 13.5,
    color: C.textMuted,
    marginTop: 2,
    lineHeight: 18,
  },
  dismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
