/**
 * (client-tabs)/index.tsx — Today (design turn 22a).
 *
 * One instruction in the coach's voice, and three ways to answer it:
 *   1. Start it        → opens the session player (workouts screen, startWorkoutId)
 *   2. Ask about it    → opens the coach thread
 *   3. Can't today     → sends a real message to the coach (never a fake ack)
 *
 * Fixed dark/lime system (constants/coachDesign.ts). No useTheme here.
 * Every number on this screen is real or omitted.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { weekOfPosition, totalWeeks } from '../../lib/passWeeks';
import SquadFeed from '../../components/client-tabs/SquadFeed';
import ClientCopilot, { CoachMessagePreview } from '../../components/client-tabs/home/ClientCopilot';

const C = CoachColors;
const F = CoachFonts;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Morning';
  if (h >= 12 && h < 17) return 'Afternoon';
  if (h >= 17 && h < 22) return 'Evening';
  return 'Late night';
}

function dateLine(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function initials(name?: string): string {
  if (!name) return '';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function firstName(name?: string): string {
  return (name || '').split(' ')[0] || '';
}

/** Monday of the current week, ISO date — same week key WeeklyCheckIn writes. */
function mondayOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return d.toISOString().split('T')[0];
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type SentState =
  | null | 'moving' | 'moved' | 'beat-sending' | 'beat-sent'
  | 'hello-sending' | 'hello-sent' | 'reason-sending' | 'reason-sent' | 'failed';

// 24b — the small honest reasons. Label is the chip; message is what actually
// lands in the coach thread. No scold anywhere, including in what we send.
const LAPSE_REASONS: { label: string; message: (days: number) => string }[] = [
  { label: 'Work got heavy', message: (d) => `Been away ${d} days — honestly, work got heavy. Where do we pick back up?` },
  { label: 'I was ill', message: (d) => `Been away ${d} days — I was ill. What should the first one back look like?` },
  { label: 'The plan is too much right now', message: (d) => `Been away ${d} days — honestly, the plan is too much for my week right now. Can we thin it out?` },
  { label: 'I lost interest, honestly', message: (d) => `Been away ${d} days — I lost interest, honestly. Not sure what would get me going again.` },
];

export default function AthleteTodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    clientData,
    trainer,
    todayWorkout,
    workouts,
    enrollment,
    plans,
    diets,
    mealLogs,
    conversation,
    loading,
    refreshData,
  } = useClient();

  const [refreshing, setRefreshing] = useState(false);
  const [sentState, setSentState] = useState<SentState>(null);
  const [latestCoachMsg, setLatestCoachMsg] = useState<CoachMessagePreview | null>(null);
  // Coach asked for a check-in this week and no submitted row exists yet.
  const [checkinWaiting, setCheckinWaiting] = useState(false);
  // Conversation created on this screen (when context has none yet)
  const [localConversation, setLocalConversation] = useState<any>(null);

  const conv = conversation || localConversation;
  const coachFirst = firstName(trainer?.name) || 'your coach';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // ── Latest coach message preview ─────────────────────────────────────────
  useEffect(() => {
    if (!conv?.id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, content, created_at, read')
        .eq('conversation_id', conv.id)
        .eq('sender_type', 'trainer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive && data) setLatestCoachMsg(data);
    })();
    return () => { alive = false; };
  }, [conv?.id]);

  // ── Check-in waiting chip — only when cheaply derivable and true ──────────
  // Requested = a [CHECKIN_REQUEST] from the coach this week; answered = a
  // submitted client_checkins row for this week. Chip shows only for the gap.
  useEffect(() => {
    if (!conv?.id || !clientData?.id) { setCheckinWaiting(false); return; }
    let alive = true;
    (async () => {
      const monday = mondayOfWeekISO();
      const { count: requested } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .eq('sender_type', 'trainer')
        .eq('content', '[CHECKIN_REQUEST]')
        .gte('created_at', monday);
      if (!alive || !requested) { if (alive) setCheckinWaiting(false); return; }
      const { count: submitted } = await supabase
        .from('client_checkins')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientData.id)
        .eq('week_start', monday)
        .not('submitted_at', 'is', null);
      if (alive) setCheckinWaiting((submitted ?? 0) === 0);
    })();
    return () => { alive = false; };
  }, [conv?.id, clientData?.id]);

  // ── Resolve the current track node (for non-workout node phrasings) ──────
  const trackNode = useMemo(() => {
    if (!enrollment || enrollment.status !== 'active') return null;
    const track = Array.isArray(enrollment.track_snapshot)
      ? [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
      : [];
    const pos = enrollment.track_position || 0;
    if (pos >= track.length) return { type: 'complete' as const, node: null, pos, total: track.length };
    return { type: track[pos]?.type as string, node: track[pos], pos, total: track.length };
  }, [enrollment]);

  // ── Lapsed (24b) — computed from real activity, client-side ──────────────
  // "Away" means: there is evidence of past training (track progress or a
  // completed assignment), the most recent of it is 7+ days old, and there is
  // still an active plan to come back to. Athletes who never started are a
  // different problem and never see this.
  const lapse = useMemo(() => {
    const completedTimes = (workouts || [])
      .filter((w: any) => w.status === 'completed' && w.assigned_date)
      .map((w: any) => new Date(w.assigned_date).getTime())
      .filter((t: number) => !Number.isNaN(t));
    const trackActive = enrollment?.status === 'active';
    const hasTrackProgress = trackActive && (enrollment.track_position || 0) > 0;
    if (!hasTrackProgress && completedTimes.length === 0) return null;

    const candidates = [...completedTimes];
    if (hasTrackProgress && enrollment.updated_at) {
      const t = new Date(enrollment.updated_at).getTime();
      if (!Number.isNaN(t)) candidates.push(t);
    }
    if (candidates.length === 0) return null;
    const days = Math.floor((Date.now() - Math.max(...candidates)) / 86400000);
    if (days < 7) return null;

    // Which week they're parked in, if they're on a pass.
    let week: number | null = null;
    if (trackActive && Array.isArray(enrollment.track_snapshot) && enrollment.track_snapshot.length > 0) {
      const track = [...enrollment.track_snapshot].sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      const plan = (plans || []).find((p: any) => p.id === enrollment.plan_id);
      const dw = plan?.duration_weeks ?? null;
      week = Math.min(
        weekOfPosition(Math.min(enrollment.track_position || 0, track.length - 1), track, dw),
        totalWeeks(track, dw)
      );
    }
    return { days, week };
  }, [workouts, enrollment, plans]);

  // ── The one instruction — built from real data ───────────────────────────
  // Shapes: todayWorkout from context is either a client_workouts row with a
  // joined .workouts (source 'coach') or a trainer workouts row itself
  // (source 'track'). Exercises live in workout_exercises either way.
  const workoutRow = todayWorkout?.workouts || todayWorkout;
  const exercises: any[] = workoutRow?.workout_exercises || [];
  const exerciseCount = exercises.length;
  const durationMin: number | null =
    workoutRow?.duration || workoutRow?.duration_minutes || (exerciseCount > 0 ? exerciseCount * 8 : null);
  const startWorkoutId = todayWorkout
    ? (todayWorkout.workout_id || todayWorkout.workouts?.id || todayWorkout.id)
    : null;

  const instruction = useMemo(() => {
    if (!clientData || !trainer) {
      return {
        kind: 'no-coach' as const,
        eyebrow: 'Waiting on a coach',
        title: 'No coach yet',
        sub: 'Once a coach takes you on, this screen becomes your plan — one session at a time, with a direct line to whoever set it.',
      };
    }
    // 24a: the season is finished and nothing new is assigned — the receipt
    // lives in Train's completion moment; Today states the fact and the question.
    if (enrollment?.status === 'completed' && !todayWorkout) {
      const planName = (plans || []).find((p: any) => p.id === enrollment.plan_id)?.name;
      return {
        kind: 'complete' as const,
        eyebrow: 'Season complete',
        title: planName ? `You finished ${planName}` : 'You finished the whole plan',
        sub: `Every session you logged is in your history, and ${coachFirst} can see all of it. What comes next is a conversation, not a countdown.`,
      };
    }
    // 24b: quietly stopped — the screen that doesn't scold.
    if (todayWorkout && lapse) {
      return {
        kind: 'lapsed' as const,
        eyebrow: 'Welcome back',
        title: `You've been away ${lapse.days} days`,
        sub:
          lapse.week != null
            ? `Nothing expired and nothing's overdue. Week ${lapse.week} is exactly where you left it.`
            : `Nothing expired and nothing's overdue. Your plan is exactly where you left it.`,
      };
    }
    // 25c: signed up, connected to a coach, but nothing assigned yet.
    const hasAnyPlan =
      !!todayWorkout ||
      (enrollment && enrollment.status === 'active') ||
      (workouts || []).length > 0;
    if (!hasAnyPlan) {
      return {
        kind: 'waiting' as const,
        eyebrow: `Waiting on ${coachFirst}`,
        title: `${firstName(trainer?.name) || 'Your coach'} is setting you up`,
        sub: `Your plan lands right here — each day's session, what to lift, and a line to ${coachFirst} when something doesn't fit.`,
      };
    }
    if (todayWorkout) {
      const parts: string[] = [];
      if (exerciseCount > 0) parts.push(`${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`);
      if (durationMin) parts.push(`about ${durationMin} min`);
      return {
        kind: 'workout' as const,
        eyebrow:
          todayWorkout.source === 'track' && todayWorkout.trackTotal
            ? `Today · session ${(todayWorkout.trackPosition ?? 0) + 1} of ${todayWorkout.trackTotal}`
            : 'Today',
        title: workoutRow?.name || workoutRow?.title || 'Your session',
        sub: parts.length > 0 ? parts.join(' · ') : `${coachFirst} put this one on your plan for today.`,
      };
    }
    if (trackNode?.type === 'diet') {
      return {
        kind: 'diet' as const,
        eyebrow: `Today · step ${trackNode.pos + 1} of ${trackNode.total}`,
        title: 'Today is about food',
        sub: `No lifting today — ${coachFirst} wants you focused on the plate. Your meal plan has the details.`,
      };
    }
    if (trackNode?.type === 'milestone') {
      return {
        kind: 'milestone' as const,
        eyebrow: `Today · step ${trackNode.pos + 1} of ${trackNode.total}`,
        title: 'You hit a marker in your plan',
        sub: `${coachFirst} set this point on purpose. Nothing to lift today — the next block starts from here.`,
      };
    }
    if (trackNode?.type === 'complete') {
      return {
        kind: 'complete' as const,
        eyebrow: 'Plan finished',
        title: 'You finished the whole plan',
        sub: `Every step, done. ${coachFirst} will be in touch about what comes next.`,
      };
    }
    return {
      kind: 'rest' as const,
      eyebrow: 'Today',
      title: 'Nothing on the plan today',
      sub: 'Rest is part of the programme, not a gap in it.',
    };
  }, [clientData, trainer, todayWorkout, trackNode, exerciseCount, durationMin, workoutRow, coachFirst, enrollment, workouts, lapse, plans]);

  // ── The three answers ─────────────────────────────────────────────────────

  const startSession = useCallback(() => {
    if (!startWorkoutId) return;
    router.push({ pathname: ClientRoute.workouts, params: { startWorkoutId: String(startWorkoutId) } });
  }, [router, startWorkoutId]);

  const openThread = useCallback(() => {
    router.push(ClientRoute.myMessages);
  }, [router]);

  // Real message to the coach — find-or-create conversation, insert, bump unread.
  const sendToCoach = useCallback(
    async (content: string): Promise<boolean> => {
      if (!clientData) return false;
      try {
        let target = conv;
        if (!target) {
          const { data, error } = await supabase
            .from('conversations')
            .insert({ client_id: clientData.id, trainer_id: clientData.trainer_id })
            .select()
            .single();
          if (error || !data) return false;
          target = data;
          setLocalConversation(data);
        }
        const { error: msgError } = await supabase
          .from('messages')
          .insert({ conversation_id: target.id, sender_type: 'client', content });
        if (msgError) return false;
        await supabase.rpc('increment_conversation_unread', {
          conv_id: target.id,
          new_last_message: content,
        });
        if (trainer?.expo_push_token) {
          supabase.functions
            .invoke('send-push-notification', {
              body: {
                pushToken: trainer.expo_push_token,
                title: `Message from ${clientData.name || 'Client'}`,
                body: content,
                data: { url: '/messages' },
              },
            })
            .catch(() => {});
        }
        return true;
      } catch {
        return false;
      }
    },
    [clientData, conv, trainer]
  );

  const sessionName = workoutRow?.name || workoutRow?.title || 'today’s session';

  const handleMoveIt = useCallback(async () => {
    if (sentState === 'moving' || sentState === 'beat-sending') return;
    setSentState('moving');
    const ok = await sendToCoach(
      `I can't get to ${sessionName} today — can we move it to another day this week?`
    );
    setSentState(ok ? 'moved' : 'failed');
  }, [sendToCoach, sessionName, sentState]);

  const handleBeat = useCallback(async () => {
    if (sentState === 'moving' || sentState === 'beat-sending') return;
    setSentState('beat-sending');
    const ok = await sendToCoach(
      `I'm running on empty today. Not sure I can do ${sessionName} as written — what do you want me to do?`
    );
    setSentState(ok ? 'beat-sent' : 'failed');
  }, [sendToCoach, sessionName, sentState]);

  // 24b: one tap tells the coach why — a real message, never a fake ack.
  const [pendingReason, setPendingReason] = useState<string | null>(null);
  const handleLapseReason = useCallback(
    async (label: string, message: string) => {
      if (sentState === 'reason-sending') return;
      setPendingReason(label);
      setSentState('reason-sending');
      const ok = await sendToCoach(message);
      setSentState(ok ? 'reason-sent' : 'failed');
      if (!ok) setPendingReason(null);
    },
    [sendToCoach, sentState]
  );

  // 25c: real message while waiting for the first plan.
  const handleWaitingHello = useCallback(async () => {
    if (sentState === 'hello-sending') return;
    setSentState('hello-sending');
    const ok = await sendToCoach(
      "I'm all set up on my side — ready whenever my plan is."
    );
    setSentState(ok ? 'hello-sent' : 'failed');
  }, [sendToCoach, sentState]);

  // ── This week — real completed sessions per day ───────────────────────────
  const weekDays = useMemo(() => {
    const days: { done: boolean; isToday: boolean }[] = [];
    const now = new Date();
    const monday = new Date(now);
    const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
    monday.setDate(now.getDate() - dow);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const ds = d.toDateString();
      const done = workouts.some(
        (w: any) => w.status === 'completed' && new Date(w.assigned_date).toDateString() === ds
      );
      days.push({ done, isToday: i === dow });
    }
    return days;
  }, [workouts]);
  const doneThisWeek = weekDays.filter((d) => d.done).length;

  // ── Food today — real calories or omitted ─────────────────────────────────
  const food = useMemo(() => {
    const activeDiet = (diets || [])[0];
    const meals: any[] = activeDiet?.diet_plans?.diet_plan_meals || [];
    if (meals.length === 0) return null;
    let target = 0;
    let eaten = 0;
    meals.forEach((m: any) => {
      const kcal = Number(m.meals?.calories) || 0;
      target += kcal;
      if (mealLogs[m.id]) eaten += kcal;
    });
    if (target <= 0) return null;
    return { eaten, target, pct: Math.min(100, Math.round((eaten / target) * 100)) };
  }, [diets, mealLogs]);

  // ── Rest of the week — real upcoming assignments only ─────────────────────
  const upcoming = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (workouts || [])
      .filter((w: any) => {
        if (w.status !== 'assigned') return false;
        const d = new Date(w.assigned_date);
        d.setHours(0, 0, 0, 0);
        const diff = (d.getTime() - today.getTime()) / 86400000;
        return diff >= 1 && diff <= 6;
      })
      .sort((a: any, b: any) => new Date(a.assigned_date).getTime() - new Date(b.assigned_date).getTime())
      .slice(0, 3)
      .map((w: any) => ({
        id: w.id,
        day: new Date(w.assigned_date).toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
        name: w.workouts?.name || 'Session',
        mins: w.workouts?.duration || w.workouts?.duration_minutes || null,
      }));
  }, [workouts]);

  const coachPreviewText = useMemo(() => {
    if (!latestCoachMsg) return null;
    const c = latestCoachMsg.content;
    if (c === '[IMAGE]') return 'Sent you an image';
    if (c.startsWith('[WORKOUT_CARD:')) return 'Sent you a workout';
    return c;
  }, [latestCoachMsg]);

  if (loading && !clientData) {
    return (
      <View style={[st.container, st.center]}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  return (
    <View style={st.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 130, paddingHorizontal: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.textMuted} />
        }
      >
        {/* Header */}
        <View style={st.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.dateLine}>{dateLine()}</Text>
            <Text style={st.greeting}>
              {greeting()}{firstName(clientData?.name) ? `, ${firstName(clientData?.name)}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push(ClientRoute.myProfile)}
            accessibilityRole="button"
            accessibilityLabel="Your profile"
          >
            <View style={st.avatar}>
              <Text style={st.avatarText}>{initials(clientData?.name) || '·'}</Text>
            </View>
            {!!trainer?.is_online && <View style={st.onlineDot} />}
          </Pressable>
        </View>

        {/* ── The instruction ── */}
        <View style={[st.hero, instruction.kind === 'workout' && st.heroActive]}>
          <View style={st.eyebrowRow}>
            <View
              style={[
                st.eyebrowDot,
                (instruction.kind === 'waiting' || instruction.kind === 'no-coach') && { backgroundColor: C.warning },
              ]}
            />
            <Text
              style={[
                st.eyebrow,
                (instruction.kind === 'waiting' || instruction.kind === 'no-coach') && { color: C.warning },
              ]}
            >
              {instruction.eyebrow}
            </Text>
          </View>
          <Text style={st.heroTitle}>{instruction.title}</Text>
          <Text style={st.heroSub}>{instruction.sub}</Text>

          {/* Exercise chips — real names only */}
          {(instruction.kind === 'workout' || instruction.kind === 'lapsed') && exercises.length > 0 && (
            <View style={st.chipRow}>
              {exercises.slice(0, 2).map((ex: any, i: number) => (
                <View key={ex.id || i} style={st.chip}>
                  <Text style={st.chipText}>
                    {ex.exercises?.name || 'Exercise'}
                    {ex.sets && ex.reps ? ` ${ex.sets}×${ex.reps}` : ''}
                  </Text>
                </View>
              ))}
              {exercises.length > 2 && (
                <View style={st.chip}>
                  <Text style={[st.chipText, { color: C.textMuted }]}>+{exercises.length - 2} more</Text>
                </View>
              )}
            </View>
          )}

          {/* 26a: no coach yet — the self-serve path */}
          {instruction.kind === 'no-coach' && (
            <Pressable style={st.primaryBtn} onPress={() => router.push(ClientRoute.findCoach)} accessibilityRole="button">
              <Text style={st.primaryBtnText}>Find a coach</Text>
            </Pressable>
          )}

          {/* The three answers */}
          {instruction.kind === 'workout' && (
            <>
              <Pressable style={st.primaryBtn} onPress={startSession} accessibilityRole="button">
                <Text style={st.primaryBtnText}>Start session</Text>
              </Pressable>

              {sentState === 'moved' || sentState === 'beat-sent' ? (
                <Pressable style={st.sentRow} onPress={openThread} accessibilityRole="button">
                  <Text style={st.sentText}>
                    Told {coachFirst}. He can see it now — open the thread if you want to add anything.
                  </Text>
                </Pressable>
              ) : (
                <>
                  <View style={st.secondaryRow}>
                    <Pressable
                      style={st.secondaryBtn}
                      onPress={handleMoveIt}
                      disabled={sentState === 'moving' || sentState === 'beat-sending'}
                      accessibilityRole="button"
                    >
                      {sentState === 'moving' ? (
                        <ActivityIndicator size="small" color={C.textSecondary} />
                      ) : (
                        <Text style={st.secondaryBtnText}>Can't make today</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={st.secondaryBtn}
                      onPress={handleBeat}
                      disabled={sentState === 'moving' || sentState === 'beat-sending'}
                      accessibilityRole="button"
                    >
                      {sentState === 'beat-sending' ? (
                        <ActivityIndicator size="small" color={C.textSecondary} />
                      ) : (
                        <Text style={st.secondaryBtnText}>I'm beat today</Text>
                      )}
                    </Pressable>
                  </View>
                  <Text style={st.footnote}>
                    {sentState === 'failed'
                      ? 'That message didn’t send — try again, or open the thread.'
                      : `Either one tells ${coachFirst} why, so he can adjust`}
                  </Text>
                </>
              )}
            </>
          )}

          {/* 24b: lapsed — the easy restart, then the honest reasons */}
          {instruction.kind === 'lapsed' && (
            <>
              {startWorkoutId && (
                <Pressable style={st.primaryBtn} onPress={startSession} accessibilityRole="button">
                  <Text style={st.primaryBtnText}>Pick it back up</Text>
                </Pressable>
              )}

              {sentState === 'reason-sent' ? (
                <Pressable style={st.sentRow} onPress={openThread} accessibilityRole="button">
                  <Text style={st.sentText}>
                    Told {coachFirst}. No lecture coming — open the thread if you want to say more.
                  </Text>
                </Pressable>
              ) : (
                <>
                  <View style={st.reasonGroup}>
                    {LAPSE_REASONS.map((r) => (
                      <Pressable
                        key={r.label}
                        style={st.reasonChip}
                        onPress={() => handleLapseReason(r.label, r.message(lapse?.days ?? 7))}
                        disabled={sentState === 'reason-sending'}
                        accessibilityRole="button"
                      >
                        {sentState === 'reason-sending' && pendingReason === r.label ? (
                          <ActivityIndicator size="small" color={C.textSecondary} />
                        ) : (
                          <Text style={st.reasonChipText}>{r.label}</Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                  <Text style={st.footnote}>
                    {sentState === 'failed'
                      ? 'That message didn’t send — try again, or open the thread.'
                      : `One tap tells ${coachFirst} what happened, so the plan can bend around it`}
                  </Text>
                </>
              )}
            </>
          )}

          {instruction.kind === 'diet' && (
            <Pressable style={st.primaryBtn} onPress={() => router.push(ClientRoute.myDiet)} accessibilityRole="button">
              <Text style={st.primaryBtnText}>Open meal plan</Text>
            </Pressable>
          )}

          {/* 24a: finished season — the question, both real answers */}
          {instruction.kind === 'complete' &&
            (plans || []).some((p: any) => p.id !== enrollment?.plan_id) && (
              <Pressable
                style={st.primaryBtn}
                onPress={() => router.push(ClientRoute.myPass)}
                accessibilityRole="button"
              >
                <Text style={st.primaryBtnText}>See {coachFirst}'s other plans</Text>
              </Pressable>
            )}

          {(instruction.kind === 'milestone' || instruction.kind === 'complete' || instruction.kind === 'rest') && trainer && (
            <Pressable style={st.secondaryBtnWide} onPress={openThread} accessibilityRole="button">
              <Text style={st.secondaryBtnText}>Message {coachFirst}</Text>
            </Pressable>
          )}

          {/* 25c: waiting on the coach — one real action */}
          {instruction.kind === 'waiting' && (
            sentState === 'hello-sent' ? (
              <Pressable style={st.sentRow} onPress={openThread} accessibilityRole="button">
                <Text style={st.sentText}>
                  Sent. {coachFirst} can see you're ready — open the thread if you want to add anything.
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={st.primaryBtn}
                  onPress={handleWaitingHello}
                  disabled={sentState === 'hello-sending'}
                  accessibilityRole="button"
                >
                  {sentState === 'hello-sending' ? (
                    <ActivityIndicator size="small" color={C.onAccent} />
                  ) : (
                    <Text style={st.primaryBtnText}>Tell {coachFirst} you're ready</Text>
                  )}
                </Pressable>
                <Pressable style={st.secondaryBtnWide} onPress={openThread} accessibilityRole="button">
                  <Text style={st.secondaryBtnText}>Open the thread</Text>
                </Pressable>
                {sentState === 'failed' && (
                  <Text style={st.footnote}>That message didn't send — try again, or open the thread.</Text>
                )}
              </>
            )
          )}
        </View>

        {/* ── Client copilot — up to 4 real "what's next" rows ── */}
        <ClientCopilot latestCoachMessage={latestCoachMsg} />

        <SquadFeed />

        {/* ── Check-in waiting — coach asked this week, not answered yet ── */}
        {trainer && checkinWaiting && (
          <Pressable
            style={st.checkinChip}
            onPress={() => router.push(ClientRoute.myProgress)}
            accessibilityRole="button"
            accessibilityLabel="Answer this week's check-in"
          >
            <View style={st.checkinDot} />
            <Text style={st.checkinChipText}>
              {coachFirst} asked for your check-in this week
            </Text>
            <Text style={st.checkinChipCta}>Answer</Text>
          </Pressable>
        )}

        {/* ── Latest word from the coach ──
            Suppressed while the message is unread — the copilot's top row is
            already surfacing it; two coach cards for one message is noise. */}
        {trainer && coachPreviewText && latestCoachMsg?.read !== false && (
          <Pressable style={st.card} onPress={openThread} accessibilityRole="button" accessibilityLabel="Open coach thread">
            <View style={st.coachRow}>
              <View style={st.coachAvatar}>
                <Text style={st.coachAvatarText}>{initials(trainer?.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.coachName}>{trainer?.name}</Text>
                <Text style={st.coachMsg} numberOfLines={2}>{coachPreviewText}</Text>
              </View>
            </View>
            <View style={st.replyPill}>
              <Text style={st.replyPillText}>Reply</Text>
            </View>
          </Pressable>
        )}

        {/* ── Real numbers: food + week ── */}
        {(food || trainer) && (
          <View style={st.statRow}>
            {food && (
              <View style={st.statCard}>
                <Text style={st.statLabel}>Eaten</Text>
                <Text style={st.statValue}>
                  {food.eaten.toLocaleString()}
                  <Text style={st.statValueMuted}> / {food.target.toLocaleString()}</Text>
                </Text>
                <View style={st.statBarTrack}>
                  <View style={[st.statBarFill, { width: `${food.pct}%` }]} />
                </View>
              </View>
            )}
            {trainer && (
              <View style={st.statCard}>
                <Text style={st.statLabel}>This week</Text>
                <Text style={st.statValue}>
                  {doneThisWeek}
                  <Text style={st.statValueMuted}> session{doneThisWeek === 1 ? '' : 's'}</Text>
                </Text>
                <View style={st.weekRow}>
                  {weekDays.map((d, i) => (
                    <View
                      key={i}
                      style={[
                        st.weekBar,
                        d.done && { backgroundColor: C.accent },
                        d.isToday && !d.done && { backgroundColor: C.border },
                      ]}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── Rest of the week — only real assignments ── */}
        {upcoming.length > 0 && (
          <>
            <Text style={st.sectionLabel}>Rest of the week</Text>
            <View style={{ gap: 8 }}>
              {upcoming.map((u) => (
                <View key={u.id} style={st.upcomingRow}>
                  <Text style={st.upcomingDay}>{u.day}</Text>
                  <Text style={st.upcomingName}>{u.name}</Text>
                  {u.mins ? <Text style={st.upcomingMins}>{u.mins} min</Text> : null}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center' },
  dateLine: { fontFamily: F.body, fontSize: 12, color: C.textMuted },
  greeting: { fontFamily: F.headingBold, fontSize: 25, color: C.textPrimary, marginTop: 3, lineHeight: 29 },
  avatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontFamily: F.bodyBold, fontSize: 13, color: C.textSecondary },
  onlineDot: {
    position: 'absolute', top: -2, right: -2, width: 12, height: 12, borderRadius: 6,
    backgroundColor: C.accent, borderWidth: 2.5, borderColor: C.bg,
  },

  hero: {
    marginTop: 22, borderRadius: 20, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted, padding: 20,
  },
  heroActive: { backgroundColor: '#1A2213', borderColor: 'rgba(198,242,78,0.22)' },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  eyebrow: {
    fontFamily: F.bodyBold, fontSize: 11, color: C.accent,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  heroTitle: { fontFamily: F.headingBold, fontSize: 24, color: C.textPrimary, marginTop: 11, lineHeight: 28 },
  heroSub: { fontFamily: F.body, fontSize: 13, color: C.textSecondary, marginTop: 6, lineHeight: 19 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 15 },
  chip: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: 11,
  },
  chipText: { fontFamily: F.bodyMedium, fontSize: 11.5, color: C.textSecondary },

  primaryBtn: {
    backgroundColor: C.accent, borderRadius: 999, paddingVertical: 15,
    alignItems: 'center', marginTop: 17,
  },
  primaryBtnText: { fontFamily: F.bodyBold, fontSize: 15, color: C.onAccent },
  secondaryRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  secondaryBtn: {
    flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center', minHeight: 40,
  },
  secondaryBtnWide: {
    borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingVertical: 12, alignItems: 'center', marginTop: 15,
  },
  secondaryBtnText: { fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textSecondary },
  footnote: {
    fontFamily: F.body, fontSize: 11, color: C.textFaint,
    textAlign: 'center', marginTop: 9, lineHeight: 15,
  },
  reasonGroup: { gap: 8, marginTop: 14 },
  reasonChip: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center',
  },
  reasonChipText: { fontFamily: F.bodySemiBold, fontSize: 13, color: '#C9CEC2' },
  sentRow: {
    marginTop: 12, borderRadius: 13, backgroundColor: C.accentSofter,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.22)', padding: 12,
  },
  sentText: { fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textSecondary, lineHeight: 18 },

  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 18, padding: 15, marginTop: 14,
  },
  checkinChip: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.surface, borderWidth: 1, borderColor: 'rgba(198,242,78,0.22)',
    borderRadius: 13, paddingVertical: 11, paddingHorizontal: 13, marginTop: 14,
  },
  checkinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent },
  checkinChipText: { flex: 1, fontFamily: F.bodySemiBold, fontSize: 12.5, color: C.textPrimary },
  checkinChipCta: { fontFamily: F.bodyBold, fontSize: 12, color: C.accent },
  coachRow: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  coachAvatar: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#2A3320',
    alignItems: 'center', justifyContent: 'center',
  },
  coachAvatarText: { fontFamily: F.bodyBold, fontSize: 12.5, color: C.accent },
  coachName: { fontFamily: F.bodySemiBold, fontSize: 13, color: C.textPrimary },
  coachMsg: { fontFamily: F.body, fontSize: 13, color: C.textSecondary, marginTop: 3, lineHeight: 19 },
  replyPill: {
    alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border, borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 14, marginTop: 12,
  },
  replyPillText: { fontFamily: F.bodySemiBold, fontSize: 12, color: C.textSecondary },

  statRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statCard: {
    flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, padding: 14,
  },
  statLabel: {
    fontFamily: F.bodyBold, fontSize: 11, color: C.textFaint,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  statValue: { fontFamily: F.headingBold, fontSize: 15, color: C.textPrimary, marginTop: 7 },
  statValueMuted: { fontFamily: F.body, fontSize: 12, color: C.textMuted },
  statBarTrack: { height: 4, borderRadius: 999, backgroundColor: C.borderMuted, marginTop: 9, overflow: 'hidden' },
  statBarFill: { height: '100%', backgroundColor: C.accent },
  weekRow: { flexDirection: 'row', gap: 3, marginTop: 10 },
  weekBar: { flex: 1, height: 4, borderRadius: 999, backgroundColor: C.borderMuted },

  sectionLabel: {
    fontFamily: F.bodyBold, fontSize: 11, color: C.textFaint,
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 26, marginBottom: 11,
  },
  upcomingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, borderRadius: 13,
  },
  upcomingDay: { width: 30, textAlign: 'center', fontFamily: F.bodyBold, fontSize: 11, color: C.textFaint },
  upcomingName: { flex: 1, fontFamily: F.bodySemiBold, fontSize: 13.5, color: C.textPrimary },
  upcomingMins: { fontFamily: F.body, fontSize: 11.5, color: C.textMuted },
});
