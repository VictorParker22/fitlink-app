/**
 * Solo — "Your corner" (design canvas "FitLink Solo Mode", board 2).
 *
 * The athlete's chat with their chosen AI corner (lib/soloCharacters.ts —
 * delivery only; the guardrailed brain lives in the solo-corner edge
 * function). Every sent/received message persists to solo_messages; the last
 * 50 load on mount. Context sent with each call is REAL data only — today's
 * session, streak, steps, last check-in — every key optional, nothing
 * invented (INVARIANTS §4).
 *
 * The paid boundary is server-side: a 402 {error:'premium_required'} routes
 * to SoloPaywall. Other failures mark the athlete's bubble with a quiet
 * inline retry — no toast storm.
 *
 * No mic in v1 — voice is v2, so no dead controls.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Image,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useHealth } from '../../context/HealthContext';
import { useWorkout } from '../../context/WorkoutContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { computeStreak } from '../../lib/streak';
import { getSoloCharacter } from '../../lib/soloCharacters';
import { getWorkoutEmblem } from '../../utils/workoutEmblems';
import CardImage from '../../components/ui/CardImage';
import SoloPaywall from '../../components/paywalls/SoloPaywall';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';

interface SoloMessage {
  id: string;
  role: 'athlete' | 'corner';
  content: string;
  created_at: string;
  /** Local-only: the corner never heard this one — show the retry affordance. */
  failed?: boolean;
}

/**
 * First-open welcome, one per character register. LOCAL and never persisted:
 * it is clearly the corner speaking, references no data, and fabricates no
 * server call disguised as the athlete.
 */
const WELCOME: Record<string, string> = {
  reyes: "I'm here. Tell me how training's been going, or just say hi.",
  imani: 'Ask me anything — why a set count, why a rest day. Or just tell me how training has been.',
  dane: "You showed up. That's the hard part. Tell me what we're working with.",
  sol: 'No rush. Whenever you’re ready, tell me how training has been feeling.',
};

// ── Breathing status dot ─────────────────────────────────────────────────────
function BreathingDot({ reduced }: { reduced: boolean }) {
  const phase = useSharedValue(1);
  useEffect(() => {
    if (reduced) {
      phase.value = 1;
      return;
    }
    phase.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );
  }, [reduced, phase]);
  const style = useAnimatedStyle(() => ({ opacity: phase.value }));
  return <Animated.View style={[s.statusDot, style]} />;
}

// ── Typing indicator — three quiet dots ──────────────────────────────────────
function TypingDot({ reduced, delay }: { reduced: boolean; delay: number }) {
  const phase = useSharedValue(0.4);
  useEffect(() => {
    if (reduced) {
      phase.value = 0.6;
      return;
    }
    phase.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.9, { duration: 380, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.35, { duration: 380, easing: Easing.inOut(Easing.quad) })
        ),
        -1
      )
    );
  }, [reduced, delay, phase]);
  const style = useAnimatedStyle(() => ({ opacity: phase.value }));
  return <Animated.View style={[s.typingDot, style]} />;
}

function TypingBubble({ reduced }: { reduced: boolean }) {
  return (
    <View style={s.bubbleRow}>
      <View style={[s.bubble, s.bubbleCorner, s.typingBubble]}>
        <View style={s.typingDots}>
          <TypingDot reduced={reduced} delay={0} />
          <TypingDot reduced={reduced} delay={160} />
          <TypingDot reduced={reduced} delay={320} />
        </View>
      </View>
    </View>
  );
}

export default function SoloScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { clientData, todayWorkout, workouts, progressLogs } = useClient();
  const { isConnected: healthConnected, healthData } = useHealth();
  const { workoutHistory } = useWorkout();

  const character = getSoloCharacter((clientData as any)?.solo_character);

  const [messages, setMessages] = useState<SoloMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const listRef = useRef<FlatList>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // ── History: last 50, oldest first ─────────────────────────────────────────
  useEffect(() => {
    if (!clientData?.id) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from('solo_messages')
        .select('id, role, content, created_at')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!mounted) return;
      if (error) {
        if (__DEV__) console.warn('[Solo] history load failed:', error.message);
      } else if (data) {
        setMessages([...data].reverse() as SoloMessage[]);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [clientData?.id]);

  useEffect(() => {
    if (messages.length > 0 || waiting) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: !reducedMotion }), 100);
    }
  }, [messages.length, waiting, reducedMotion]);

  // ── Today's session (real data only) ───────────────────────────────────────
  const workoutRow = todayWorkout?.workouts || todayWorkout;
  const sessionExercises: any[] = workoutRow?.workout_exercises || [];
  const sessionName: string | null = workoutRow?.name || workoutRow?.title || null;
  const startWorkoutId = todayWorkout
    ? (todayWorkout.workout_id || todayWorkout.workouts?.id || todayWorkout.id)
    : null;
  const sessionEmblem = useMemo(() => {
    if (!startWorkoutId) return null;
    const groups: string[] = sessionExercises
      .map((ex: any) => ex?.exercises?.muscle_group || ex?.exercises?.category)
      .filter(Boolean);
    return getWorkoutEmblem(String(startWorkoutId), sessionName || undefined, groups);
  }, [startWorkoutId, sessionExercises, sessionName]);

  const startSession = useCallback(() => {
    if (!startWorkoutId) return;
    // Same start path Today uses — the workouts screen opens the player.
    router.push({ pathname: ClientRoute.workouts, params: { startWorkoutId: String(startWorkoutId) } });
  }, [router, startWorkoutId]);

  // ── Context assembly — real data or omitted, never invented ───────────────
  const buildContext = useCallback((): Record<string, string> => {
    const ctx: Record<string, string> = {};
    if (todayWorkout && sessionName) {
      ctx.todays_workout = sessionExercises.length > 0
        ? `${sessionName} (${sessionExercises.length} exercise${sessionExercises.length === 1 ? '' : 's'})`
        : sessionName;
    }
    const streak = computeStreak(workoutHistory, workouts);
    if (streak.days > 0) {
      ctx.training_streak = `${streak.days} consecutive day${streak.days === 1 ? '' : 's'}${streak.trainedToday ? ', trained today' : ''}`;
    }
    if (healthConnected && healthData && healthData.stepsToday > 0) {
      ctx.steps_today = String(healthData.stepsToday);
    }
    const lastCheckIn = progressLogs?.[0]?.date;
    if (lastCheckIn) ctx.last_check_in = String(lastCheckIn);
    return ctx;
  }, [todayWorkout, sessionName, sessionExercises, workoutHistory, workouts, healthConnected, healthData, progressLogs]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const deliver = useCallback(
    async (athleteMsg: SoloMessage, priorHistory: SoloMessage[]) => {
      if (!clientData?.id) return;
      setWaiting(true);

      const history = priorHistory
        .filter((m) => !m.failed)
        .slice(-12)
        .map((m) => ({ role: m.role, content: m.content }));

      const { data, error } = await supabase.functions.invoke('solo-corner', {
        body: {
          message: athleteMsg.content,
          history,
          context: buildContext(),
          character: character.key,
        },
      });

      setWaiting(false);

      if (error) {
        const status = (error as any)?.context?.status;
        if (status === 402) {
          setPaywallVisible(true);
        }
        // Quiet inline retry on the bubble — never a toast storm.
        setMessages((prev) =>
          prev.map((m) => (m.id === athleteMsg.id ? { ...m, failed: true } : m))
        );
        return;
      }

      const reply: string | undefined = data?.reply;
      if (!reply) {
        setMessages((prev) =>
          prev.map((m) => (m.id === athleteMsg.id ? { ...m, failed: true } : m))
        );
        return;
      }

      const cornerMsg: SoloMessage = {
        id: `local-corner-${Date.now()}`,
        role: 'corner',
        content: reply,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, cornerMsg]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // Persist the corner row — {error}-checked, quiet failure tolerable
      // (the reply already rendered; the row simply misses history).
      const { data: row, error: insertError } = await supabase
        .from('solo_messages')
        .insert({ client_id: clientData.id, role: 'corner', content: reply })
        .select('id, role, content, created_at')
        .single();
      if (insertError) {
        if (__DEV__) console.warn('[Solo] corner row not saved:', insertError.message);
      } else if (row) {
        setMessages((prev) => prev.map((m) => (m.id === cornerMsg.id ? (row as SoloMessage) : m)));
      }
    },
    [clientData?.id, buildContext, character.key]
  );

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || sendingRef.current || !clientData?.id) return;
    sendingRef.current = true;
    setInput('');

    // Optimistic append.
    const athleteMsg: SoloMessage = {
      id: `local-athlete-${Date.now()}`,
      role: 'athlete',
      content,
      created_at: new Date().toISOString(),
    };
    const prior = messages;
    setMessages((prev) => [...prev, athleteMsg]);

    // Persist the athlete row — {error}-checked, quiet failure tolerable.
    const { data: row, error: insertError } = await supabase
      .from('solo_messages')
      .insert({ client_id: clientData.id, role: 'athlete', content })
      .select('id, role, content, created_at')
      .single();
    let liveMsg = athleteMsg;
    if (insertError) {
      if (__DEV__) console.warn('[Solo] athlete row not saved:', insertError.message);
    } else if (row) {
      liveMsg = row as SoloMessage;
      setMessages((prev) => prev.map((m) => (m.id === athleteMsg.id ? liveMsg : m)));
    }

    await deliver(liveMsg, prior);
    sendingRef.current = false;
  }, [input, clientData?.id, messages, deliver]);

  // Retry a failed message: the row (when it saved) is already in
  // solo_messages — only the corner call is re-run.
  const handleRetry = useCallback(
    async (msg: SoloMessage) => {
      if (sendingRef.current) return;
      sendingRef.current = true;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, failed: false } : m)));
      const prior = messages.slice(0, messages.findIndex((m) => m.id === msg.id));
      await deliver({ ...msg, failed: false }, prior);
      sendingRef.current = false;
    },
    [messages, deliver]
  );

  // ── First-open welcome (local, never persisted) ────────────────────────────
  const showWelcome = !loading && messages.length === 0;
  const welcomeText = WELCOME[character.key] ?? WELCOME.reyes;

  const renderMessage = useCallback(
    ({ item }: { item: SoloMessage }) => {
      const isMine = item.role === 'athlete';
      return (
        <View style={[s.bubbleRow, isMine && s.bubbleRowRight]}>
          <View style={[s.bubble, isMine ? s.bubbleAthlete : s.bubbleCorner]}>
            <Text style={s.bubbleText} maxFontSizeMultiplier={1.4}>{item.content}</Text>
            {item.failed && (
              <Pressable
                onPress={() => handleRetry(item)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Couldn't reach your corner. Try again"
              >
                <Text style={s.failedText} maxFontSizeMultiplier={1.3}>
                  Couldn't reach your corner — try again
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    },
    [handleRetry]
  );

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker} maxFontSizeMultiplier={1.4}>
            SOLO · {character.name.toUpperCase()}
          </Text>
          <Text style={s.title} maxFontSizeMultiplier={1.3}>Your corner</Text>
        </View>
        <Pressable
          style={s.statusChip}
          onPress={() => router.push('/(client-tabs)/solo-setup' as any)}
          accessibilityRole="button"
          accessibilityLabel="In your corner. Change your corner"
        >
          <BreathingDot reduced={reducedMotion} />
          <Text style={s.statusChipText} maxFontSizeMultiplier={1.2}>In your corner</Text>
          <Ionicons name="chevron-forward" size={12} color={C.textFaint} />
        </Pressable>
      </View>

      {/* ── Today's session — pinned under the header for scroll sanity ── */}
      {todayWorkout && sessionName && (
        <View style={s.sessionCard}>
          <CardImage
            source={require('../../assets/images/session-bg.jpg')}
            scrim="veil"
            extraShade={0.3}
          />
          <View style={s.sessionRow}>
            {sessionEmblem && (
              <Image source={sessionEmblem} style={s.sessionEmblem} resizeMode="contain" accessible={false} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.sessionKicker} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                TODAY · {sessionName.toUpperCase()}
              </Text>
              {sessionExercises.length > 0 && (
                <Text style={s.sessionMeta} maxFontSizeMultiplier={1.3}>
                  {sessionExercises.length} exercise{sessionExercises.length === 1 ? '' : 's'}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={s.startPill}
              onPress={startSession}
              activeOpacity={0.85}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={`Start ${sessionName}`}
            >
              <Text style={s.startPillText} maxFontSizeMultiplier={1.2}>Start</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loading ? (
          <View style={s.loadingWrap}>
            <ActivityIndicator size="large" color={C.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            keyboardShouldPersistTaps="handled"
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.messageList}
            showsVerticalScrollIndicator={false}
            renderItem={renderMessage}
            ListHeaderComponent={
              showWelcome ? (
                <View style={s.bubbleRow}>
                  <View style={[s.bubble, s.bubbleCorner]}>
                    <Text style={s.bubbleText} maxFontSizeMultiplier={1.4}>{welcomeText}</Text>
                  </View>
                </View>
              ) : null
            }
            ListFooterComponent={waiting ? <TypingBubble reduced={reducedMotion} /> : null}
          />
        )}

        {/* ── Honesty footer ── */}
        <View style={s.honestyRow}>
          <Text style={s.honestyText} maxFontSizeMultiplier={1.3}>
            Solo is software, not medical advice.{' '}
            <Text
              style={s.honestyLink}
              onPress={() => router.push(ClientRoute.findCoach)}
              accessibilityRole="link"
            >
              Prefer a human? Find a coach
            </Text>
          </Text>
        </View>

        {/* ── Composer — no mic in v1 (voice is v2, no dead controls) ── */}
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            placeholder="Tell your corner anything…"
            placeholderTextColor={C.textFaint}
            value={input}
            onChangeText={setInput}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
            accessibilityLabel="Message your corner"
            accessibilityRole="text"
          />
          <TouchableOpacity
            style={[s.sendBtn, input.trim() ? s.sendBtnActive : null]}
            onPress={handleSend}
            disabled={!input.trim() || waiting}
            hitSlop={2}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Ionicons name="send" size={17} color={input.trim() ? C.onAccent : C.textFaint} />
          </TouchableOpacity>
        </View>
        {/* Clears the floating tab bar (my-messages precedent). */}
        <View
          style={{
            height: isKeyboardVisible ? 0 : Math.max(insets.bottom, 14) + 55,
            backgroundColor: C.surface,
          }}
        />
      </KeyboardAvoidingView>

      <SoloPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onSuccess={() => setPaywallVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 12,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  kicker: {
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase', color: C.accent,
  },
  title: {
    fontFamily: F.headingBold, fontSize: 28, lineHeight: 33,
    color: C.textPrimary, marginTop: 4,
  },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, minHeight: 44,
    borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted,
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent,
  },
  statusChipText: { fontFamily: F.bodySemiBold, fontSize: 12, color: C.textSecondary },

  sessionCard: {
    marginHorizontal: 20, marginBottom: 12,
    borderRadius: 16, borderCurve: 'continuous',
    overflow: 'hidden',
    borderWidth: 1, borderColor: C.borderMuted,
  },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  sessionEmblem: { width: 36, height: 36 },
  sessionKicker: {
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 1.2,
    color: C.textPrimary,
  },
  sessionMeta: {
    fontFamily: F.mono, fontSize: 11.5, color: C.textSecondary,
    fontVariant: ['tabular-nums'], marginTop: 3,
  },
  startPill: {
    paddingHorizontal: 16, height: 34,
    borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  startPillText: { fontFamily: F.bodyBold, fontSize: 13, color: C.onAccent },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageList: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, flexGrow: 1 },

  bubbleRow: { flexDirection: 'row', marginBottom: 8 },
  bubbleRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 18, borderCurve: 'continuous',
  },
  bubbleCorner: {
    backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted,
    borderTopLeftRadius: 6,
  },
  bubbleAthlete: {
    backgroundColor: C.accentSoft,
    borderTopRightRadius: 6,
  },
  bubbleText: {
    fontFamily: F.body, fontSize: 15.5, lineHeight: 23.5,
    color: C.textPrimary,
  },
  failedText: {
    fontFamily: F.bodySemiBold, fontSize: 12, color: C.danger,
    marginTop: 6,
  },

  typingBubble: { paddingVertical: 13 },
  typingDots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  typingDot: {
    width: 6, height: 6, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.textSecondary,
  },

  honestyRow: { paddingHorizontal: 20, paddingBottom: 8 },
  honestyText: {
    fontFamily: F.body, fontSize: 12, lineHeight: 17.5,
    color: C.textFaint, textAlign: 'center',
  },
  honestyLink: { fontFamily: F.bodySemiBold, color: C.accent },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  input: {
    flex: 1, backgroundColor: C.bg,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 13,
    fontFamily: F.body, fontSize: 15.5, color: C.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: C.accent },
});
