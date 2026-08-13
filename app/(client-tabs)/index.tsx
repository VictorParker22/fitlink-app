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

// ─── Screen ───────────────────────────────────────────────────────────────────

type SentState = null | 'moving' | 'moved' | 'beat-sending' | 'beat-sent' | 'failed';

export default function AthleteTodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    clientData,
    trainer,
    todayWorkout,
    workouts,
    enrollment,
    diets,
    mealLogs,
    conversation,
    loading,
    refreshData,
  } = useClient();

  const [refreshing, setRefreshing] = useState(false);
  const [sentState, setSentState] = useState<SentState>(null);
  const [latestCoachMsg, setLatestCoachMsg] = useState<{ content: string; created_at: string } | null>(null);
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
        .select('content, created_at')
        .eq('conversation_id', conv.id)
        .eq('sender_type', 'trainer')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive && data) setLatestCoachMsg(data);
    })();
    return () => { alive = false; };
  }, [conv?.id]);

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
        eyebrow: 'Today',
        title: 'No coach yet',
        sub: 'Once a coach takes you on, your plan shows up here — one session at a time.',
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
  }, [clientData, trainer, todayWorkout, trackNode, exerciseCount, durationMin, workoutRow, coachFirst]);

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
            <View style={st.eyebrowDot} />
            <Text style={st.eyebrow}>{instruction.eyebrow}</Text>
          </View>
          <Text style={st.heroTitle}>{instruction.title}</Text>
          <Text style={st.heroSub}>{instruction.sub}</Text>

          {/* Exercise chips — real names only */}
          {instruction.kind === 'workout' && exercises.length > 0 && (
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

          {instruction.kind === 'diet' && (
            <Pressable style={st.primaryBtn} onPress={() => router.push(ClientRoute.myDiet)} accessibilityRole="button">
              <Text style={st.primaryBtnText}>Open meal plan</Text>
            </Pressable>
          )}

          {(instruction.kind === 'milestone' || instruction.kind === 'complete' || instruction.kind === 'rest') && trainer && (
            <Pressable style={st.secondaryBtnWide} onPress={openThread} accessibilityRole="button">
              <Text style={st.secondaryBtnText}>Message {coachFirst}</Text>
            </Pressable>
          )}
        </View>

        {/* ── Latest word from the coach ── */}
        {trainer && coachPreviewText && (
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
  sentRow: {
    marginTop: 12, borderRadius: 13, backgroundColor: C.accentSofter,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.22)', padding: 12,
  },
  sentText: { fontFamily: F.bodyMedium, fontSize: 12.5, color: C.textSecondary, lineHeight: 18 },

  card: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 18, padding: 15, marginTop: 14,
  },
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
