/**
 * Solo — "The corner" (design canvas "FitLink Solo Corner", board "The
 * corner"). Presence-first, not a chat wall: the persona speaks ONE thing
 * at a time — orb breathes at rest, bar-meter while audio plays, transcript
 * one tap away behind the history icon.
 *
 * Data mechanics kept from the previous chat build: messages persist to
 * solo_messages (last 50 load on mount), buildContext sends only real data
 * (INVARIANTS §4), a 402 routes to SoloPaywall with the same 90s
 * post-purchase "activating" grace window, and failures get a quiet retry —
 * never a toast storm.
 *
 * No mic in v1 — voice input is v2, so no dead control ships.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../context/ClientContext';
import { useHealth } from '../../context/HealthContext';
import { useWorkout } from '../../context/WorkoutContext';
import { useAlert } from '../../context/AlertContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { computeStreak } from '../../lib/streak';
import { getSoloCharacter } from '../../lib/soloCharacters';
import { ensureSoloClient } from '../../lib/soloClient';
import { useSoloVoice, getAutoPlay, setAutoPlay as persistAutoPlay } from '../../lib/soloVoice';
import { Orb, SpokenLine, SOLO_TINT } from '../../components/solo/Presence';
import SoloPaywall from '../../components/paywalls/SoloPaywall';
import { CoachColors as C, CoachFonts as F } from '../../constants/coachDesign';

interface SoloMessage {
  id: string;
  role: 'athlete' | 'corner';
  content: string;
  created_at: string;
}

/** First-open brief fallback if the server call fails before anything else has spoken. */
const WELCOME: Record<string, string> = {
  reyes: "I'm here. Tell me how training's been going, or just say hi.",
  imani: 'Ask me anything — why a set count, why a rest day. Or just tell me how training has been.',
  dane: "You showed up. That's the hard part. Tell me what we're working with.",
  sol: "No rush. Whenever you're ready, tell me how training has been feeling.",
};

const QUICK_ASKS = ['Plan today', 'I slept badly', 'Log a PR', 'Swap an exercise'];

function dayHeader(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function SoloScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { showAlert } = useAlert();
  const { clientData, todayWorkout, workouts, progressLogs, healthSharingEnabled, refreshData } = useClient();
  const { isConnected: healthConnected, healthData } = useHealth();
  const { workoutHistory } = useWorkout();
  const voice = useSoloVoice();

  const character = getSoloCharacter((clientData as any)?.solo_character);
  const tint = SOLO_TINT[character.key];

  const [messages, setMessages] = useState<SoloMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [ensuring, setEnsuring] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const ensureAttemptedRef = useRef(false);

  const [currentLine, setCurrentLine] = useState<string>('');
  const [basedOn, setBasedOn] = useState<string[]>([]);
  const [waitingReply, setWaitingReply] = useState(false);
  const [athleteEcho, setAthleteEcho] = useState<string | null>(null);
  const echoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [input, setInput] = useState('');
  const [autoPlay, setAutoPlayState] = useState(true);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<{ content: string; prior: SoloMessage[] } | null>(null);

  const [paywallVisible, setPaywallVisible] = useState(false);
  // A 402 in the seconds after a local purchase is RevenueCat's webhook still
  // landing, not a missing subscription — show a quiet "activating" line
  // instead of bouncing the athlete back to the paywall they just paid on.
  const [activating, setActivating] = useState(false);
  const lastPurchaseAtRef = useRef(0);

  const sendingRef = useRef(false);
  const briefRequestedRef = useRef(false);

  useEffect(() => {
    getAutoPlay().then(setAutoPlayState);
  }, []);

  useEffect(() => () => { if (echoTimerRef.current) clearTimeout(echoTimerRef.current); }, []);

  // ── Solo client existence: coachless athletes may have no row yet ─────────
  useEffect(() => {
    if (clientData?.id || ensureAttemptedRef.current) return;
    ensureAttemptedRef.current = true;
    setEnsuring(true);
    (async () => {
      const ensured = await ensureSoloClient();
      if (ensured?.clientId) {
        await refreshData();
      } else {
        setSetupNeeded(true);
      }
      setEnsuring(false);
    })();
  }, [clientData?.id, refreshData]);

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
        const ordered = [...data].reverse() as SoloMessage[];
        setMessages(ordered);
        const lastCorner = [...ordered].reverse().find((m) => m.role === 'corner');
        if (lastCorner) setCurrentLine(lastCorner.content);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [clientData?.id]);

  // ── Today's session (real data only) ───────────────────────────────────────
  const workoutRow = todayWorkout?.workouts || todayWorkout;
  const sessionExercises: any[] = workoutRow?.workout_exercises || [];
  const sessionName: string | null = workoutRow?.name || workoutRow?.title || null;

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
    // Steps leave the device only under the same consent that gates the
    // coach's view — health sharing off means the corner never sees them.
    if (healthSharingEnabled && healthConnected && healthData && healthData.stepsToday > 0) {
      ctx.steps_today = String(healthData.stepsToday);
    }
    const lastCheckIn = progressLogs?.[0]?.date;
    if (lastCheckIn) ctx.last_check_in = String(lastCheckIn);
    return ctx;
  }, [todayWorkout, sessionName, sessionExercises, workoutHistory, workouts, healthSharingEnabled, healthConnected, healthData, progressLogs]);

  // The activating line has a lifetime — the same 90s grace window. Past it,
  // a 402 is a real paywall again.
  useEffect(() => {
    if (!activating) return;
    const remaining = Math.max(0, 90_000 - (Date.now() - lastPurchaseAtRef.current));
    const t = setTimeout(() => setActivating(false), remaining);
    return () => clearTimeout(t);
  }, [activating]);

  // ── Core call to the corner ─────────────────────────────────────────────────
  const callCorner = useCallback(
    async (body: Record<string, unknown>) => {
      return supabase.functions.invoke('solo-corner', {
        body: { ...body, character: character.key },
      });
    },
    [character.key]
  );

  const speakReply = useCallback((text: string) => {
    if (autoPlay) voice.speak(text, character.key);
  }, [autoPlay, voice, character.key]);

  const persistCornerMessage = useCallback(async (content: string) => {
    if (!clientData?.id) return;
    const { error } = await supabase
      .from('solo_messages')
      .insert({ client_id: clientData.id, role: 'corner', content });
    if (error && __DEV__) console.warn('[Solo] corner row not saved:', error.message);
  }, [clientData?.id]);

  // ── First-open brief: when a brand-new corner has no history yet ──────────
  useEffect(() => {
    if (loading || !clientData?.id || messages.length > 0 || briefRequestedRef.current) return;
    briefRequestedRef.current = true;
    setCurrentLine(WELCOME[character.key] ?? WELCOME.reyes);
    (async () => {
      setWaitingReply(true);
      try {
        const { data, error } = await callCorner({ mode: 'brief', history: [], context: buildContext() });
        if (error) {
          const status = (error as any)?.context?.status;
          if (status === 402) {
            setCurrentLine(`Solo is a paid corner. Start your trial to hear from ${character.name}.`);
            if (Date.now() - lastPurchaseAtRef.current >= 90_000) setPaywallVisible(true);
          }
          return;
        }
        const reply: string | undefined = data?.reply;
        if (!reply) return;
        setCurrentLine(reply);
        setBasedOn(Array.isArray(data?.based_on) ? data.based_on : []);
        await persistCornerMessage(reply);
        setMessages((prev) => [...prev, {
          id: `local-brief-${Date.now()}`, role: 'corner', content: reply, created_at: new Date().toISOString(),
        }]);
        speakReply(reply);
      } catch (e) {
        if (__DEV__) console.warn('[Solo] brief request threw:', e);
      } finally {
        setWaitingReply(false);
      }
    })();
  }, [loading, clientData?.id, messages.length, callCorner, buildContext, character.key, character.name, persistCornerMessage, speakReply]);

  // ── Send an athlete message (composer or quick-ask chip) ──────────────────
  const deliver = useCallback(
    async (content: string, priorHistory: SoloMessage[]) => {
      if (!clientData?.id) return;
      setWaitingReply(true);
      setPendingRetry(null);
      try {
        const history = priorHistory
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content }));

        const { data, error } = await callCorner({ message: content, history, context: buildContext() });

        if (error) {
          const status = (error as any)?.context?.status;
          if (status === 402) {
            if (Date.now() - lastPurchaseAtRef.current < 90_000) {
              setActivating(true);
              setCurrentLine('Activating your subscription…');
            } else {
              setPaywallVisible(true);
              setCurrentLine(`Solo is a paid corner. Start your trial to hear from ${character.name}.`);
            }
          } else if (status === 429) {
            setCurrentLine("Give me a minute. You've asked a lot this hour.");
          } else {
            setCurrentLine("Couldn't reach your corner. Try again.");
            setPendingRetry({ content, prior: priorHistory });
          }
          return;
        }

        const reply: string | undefined = data?.reply;
        if (!reply) {
          setCurrentLine("Couldn't reach your corner. Try again.");
          setPendingRetry({ content, prior: priorHistory });
          return;
        }

        // A reply means the entitlement landed — the activating line is done.
        setActivating(false);
        setCurrentLine(reply);
        setBasedOn(Array.isArray(data?.based_on) ? data.based_on : []);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        await persistCornerMessage(reply);
        setMessages((prev) => [...prev, {
          id: `local-corner-${Date.now()}`, role: 'corner', content: reply, created_at: new Date().toISOString(),
        }]);
        speakReply(reply);
      } catch (e) {
        if (__DEV__) console.warn('[Solo] deliver threw:', e);
        setCurrentLine("Couldn't reach your corner. Try again.");
        setPendingRetry({ content, prior: priorHistory });
      } finally {
        setWaitingReply(false);
      }
    },
    [clientData?.id, callCorner, buildContext, character.name, persistCornerMessage, speakReply]
  );

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sendingRef.current || !clientData?.id) return;
    sendingRef.current = true;
    Keyboard.dismiss();

    // Echo the athlete's own line above the orb for a beat, then let the
    // reply (or waiting state) take over the spoken line.
    setAthleteEcho(trimmed);
    if (echoTimerRef.current) clearTimeout(echoTimerRef.current);
    echoTimerRef.current = setTimeout(() => setAthleteEcho(null), 1500);

    const prior = messages;
    const athleteMsg: SoloMessage = {
      id: `local-athlete-${Date.now()}`,
      role: 'athlete',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, athleteMsg]);

    try {
      const { error: insertError } = await supabase
        .from('solo_messages')
        .insert({ client_id: clientData.id, role: 'athlete', content: trimmed });
      if (insertError && __DEV__) console.warn('[Solo] athlete row not saved:', insertError.message);
      await deliver(trimmed, prior);
    } finally {
      sendingRef.current = false;
    }
  }, [messages, clientData?.id, deliver]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    setInput('');
    sendMessage(content);
  }, [input, sendMessage]);

  const handleRetry = useCallback(() => {
    if (!pendingRetry) return;
    const { content, prior } = pendingRetry;
    setPendingRetry(null);
    deliver(content, prior);
  }, [pendingRetry, deliver]);

  const toggleAutoPlay = useCallback(() => {
    const next = !autoPlay;
    setAutoPlayState(next);
    persistAutoPlay(next);
    Haptics.selectionAsync().catch(() => {});
    if (!next) voice.stop();
  }, [autoPlay, voice]);

  // ── Orb / spoken-line state ─────────────────────────────────────────────────
  const speaking = voice.state.activeText === currentLine && voice.state.playing;
  const orbLoading = waitingReply || (voice.state.activeText === currentLine && voice.state.loading);

  const groupedHistory = useMemo(() => {
    const groups: { header: string; items: SoloMessage[] }[] = [];
    messages.forEach((m) => {
      const header = dayHeader(m.created_at);
      const last = groups[groups.length - 1];
      if (last && last.header === header) last.items.push(m);
      else groups.push({ header, items: [m] });
    });
    return groups;
  }, [messages]);

  // ── Corner not set up yet: a real state, not a spinner forever ────────────
  if (!clientData?.id) {
    return (
      <View style={[s.container, s.centerFill, { paddingTop: insets.top }]}>
        {ensuring ? (
          <ActivityIndicator size="large" color={C.accent} />
        ) : (
          <>
            <Ionicons name="mic-off-outline" size={32} color={C.textFaint} />
            <Text style={s.emptyTitle} maxFontSizeMultiplier={1.3}>Your corner isn't set up yet</Text>
            <Text style={s.emptySub} maxFontSizeMultiplier={1.3}>
              Choose a voice to hear from and we'll get it ready.
            </Text>
            <TouchableOpacity
              style={s.emptyCta}
              onPress={() => router.push('/(client-tabs)/solo-setup' as any)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={s.emptyCtaText} maxFontSizeMultiplier={1.2}>Choose your corner</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.push('/(client-tabs)' as any))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={19} color={C.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.kicker} maxFontSizeMultiplier={1.4}>Your corner · AI</Text>
          <Text style={s.title} maxFontSizeMultiplier={1.3}>{character.name}</Text>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={toggleAutoPlay}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={autoPlay ? 'Mute auto-play' : 'Unmute auto-play'}
          >
            <Ionicons
              name={autoPlay ? 'volume-high-outline' : 'volume-mute-outline'}
              size={18}
              color={autoPlay ? C.accent : C.textPrimary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => setHistoryVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Open transcript history"
          >
            <Ionicons name="time-outline" size={18} color={C.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.presenceScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {athleteEcho && (
            <Text style={s.echoText} maxFontSizeMultiplier={1.3} numberOfLines={2}>You: {athleteEcho}</Text>
          )}

          <Orb tint={tint} size={132} speaking={speaking} loading={orbLoading} reduced={reducedMotion} showMeter />

          {loading ? (
            <ActivityIndicator size="small" color={C.accent} style={{ marginTop: 22 }} />
          ) : (
            <View style={[s.spokenBlock, orbLoading && s.spokenBlockDim]}>
              <SpokenLine
                text={currentLine}
                tint={tint}
                state={voice.state}
                onToggle={() => voice.toggle(currentLine, character.key)}
              />
            </View>
          )}

          {basedOn.length > 0 && (
            <View style={s.basedOnRow}>
              <Ionicons name="layers-outline" size={14} color={C.textFaint} />
              <Text style={s.basedOnText} maxFontSizeMultiplier={1.3}>
                {basedOn.join(' · ')}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={s.footerBlock}>
          {pendingRetry ? (
            <View style={s.chipsRow}>
              <TouchableOpacity
                style={[s.chip, s.retryChip]}
                onPress={handleRetry}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Ionicons name="refresh" size={14} color={C.textPrimary} />
                <Text style={s.chipText} maxFontSizeMultiplier={1.2}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsRow}
            >
              {QUICK_ASKS.map((label) => (
                <TouchableOpacity
                  key={label}
                  style={s.chip}
                  onPress={() => sendMessage(label)}
                  activeOpacity={0.8}
                  disabled={waitingReply}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Text style={s.chipText} maxFontSizeMultiplier={1.2}>{label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              placeholder={`Ask ${character.name}`}
              placeholderTextColor={C.textFaint}
              value={input}
              onChangeText={setInput}
              maxLength={2000}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              accessibilityLabel={`Message ${character.name}`}
            />
            <TouchableOpacity
              style={[s.sendBtn, input.trim() ? s.sendBtnActive : null]}
              onPress={handleSend}
              disabled={!input.trim() || waitingReply}
              hitSlop={2}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              <Ionicons name="arrow-up" size={19} color={input.trim() ? C.onAccent : C.textFaint} />
            </TouchableOpacity>
          </View>
          <View style={{ height: Math.max(insets.bottom, 14) + 55, backgroundColor: C.bg }} />
        </View>
      </KeyboardAvoidingView>

      {/* ── History sheet ── */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setHistoryVisible(false)}
      >
        <View style={[s.historyContainer, { paddingTop: insets.top }]}>
          <View style={s.historyHeader}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => setHistoryVisible(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close history"
            >
              <Ionicons name="chevron-back" size={19} color={C.textPrimary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker} maxFontSizeMultiplier={1.4}>This week</Text>
              <Text style={s.title} maxFontSizeMultiplier={1.3}>Everything {character.name} said</Text>
            </View>
          </View>
          <ScrollView contentContainerStyle={s.historyScroll} showsVerticalScrollIndicator={false}>
            {groupedHistory.map((group) => (
              <View key={group.header}>
                <Text style={s.dayHeader} maxFontSizeMultiplier={1.3}>{group.header.toUpperCase()}</Text>
                {group.items.map((m) => {
                  const isAthlete = m.role === 'athlete';
                  const isActive = voice.state.activeText === m.content && (voice.state.playing || voice.state.loading);
                  return (
                    <View key={m.id} style={s.historyRow}>
                      <View style={s.historyLabelRow}>
                        {!isAthlete && <View style={[s.historyDot, { backgroundColor: tint }]} />}
                        <Text style={s.historyLabel} maxFontSizeMultiplier={1.3}>
                          {isAthlete ? 'You' : character.name}
                        </Text>
                      </View>
                      <Text style={[s.historyText, isAthlete && s.historyTextMuted]} maxFontSizeMultiplier={1.4}>
                        {m.content}
                      </Text>
                      {!isAthlete && (
                        <TouchableOpacity
                          style={s.historyPlay}
                          onPress={() => voice.toggle(m.content, character.key)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityRole="button"
                          accessibilityLabel={isActive && voice.state.playing ? 'Pause' : 'Play this line'}
                        >
                          <Ionicons
                            name={isActive && voice.state.playing ? 'pause' : 'play'}
                            size={12}
                            color={C.textFaint}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            ))}
            {groupedHistory.length === 0 && (
              <Text style={s.historyEmpty} maxFontSizeMultiplier={1.3}>Nothing said yet.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <SoloPaywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onSuccess={() => {
          // Opens the 90s grace window for the webhook to land server-side.
          lastPurchaseAtRef.current = Date.now();
          setPaywallVisible(false);
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centerFill: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  emptyTitle: { fontFamily: F.headingBold, fontSize: 19, color: C.textPrimary, textAlign: 'center', marginTop: 6 },
  emptySub: { fontFamily: F.body, fontSize: 14, lineHeight: 20, color: C.textSecondary, textAlign: 'center' },
  emptyCta: {
    marginTop: 8, height: 48, paddingHorizontal: 24, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  emptyCtaText: { fontFamily: F.bodyBold, fontSize: 15, color: C.onAccent },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  kicker: {
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase', color: C.textMuted,
  },
  title: { fontFamily: F.headingBold, fontSize: 18, color: C.textPrimary, marginTop: 2 },

  presenceScroll: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, gap: 16,
  },
  echoText: {
    fontFamily: F.bodyMedium, fontSize: 13, color: C.textFaint, textAlign: 'center',
  },
  spokenBlock: { marginTop: 4 },
  spokenBlockDim: { opacity: 0.45 },

  basedOnRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 16, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 4,
    alignSelf: 'stretch',
  },
  basedOnText: { flex: 1, fontFamily: F.body, fontSize: 13, lineHeight: 18, color: C.textSecondary },

  footerBlock: { paddingTop: 4 },
  chipsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 40, paddingHorizontal: 14, borderRadius: 999, borderCurve: 'continuous',
    borderWidth: 1, borderColor: C.border,
  },
  retryChip: { borderColor: C.textFaint },
  chipText: { fontFamily: F.bodyMedium, fontSize: 14, color: C.textPrimary },

  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20,
  },
  input: {
    flex: 1, height: 52, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.borderMuted,
    borderRadius: 999, borderCurve: 'continuous',
    paddingHorizontal: 18,
    fontFamily: F.body, fontSize: 15, color: C.textPrimary,
  },
  sendBtn: {
    width: 52, height: 52, borderRadius: 999, borderCurve: 'continuous',
    backgroundColor: C.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnActive: { backgroundColor: C.accent },

  historyContainer: { flex: 1, backgroundColor: C.bg },
  historyHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 8,
  },
  historyScroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  dayHeader: {
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 1.2,
    color: C.textMuted, paddingTop: 18, paddingBottom: 6,
  },
  historyRow: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.borderMuted, gap: 6,
  },
  historyLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyDot: { width: 8, height: 8, borderRadius: 999, borderCurve: 'continuous' },
  historyLabel: {
    fontFamily: F.bodySemiBold, fontSize: 11, letterSpacing: 0.8,
    textTransform: 'uppercase', color: C.textMuted,
  },
  historyText: { fontFamily: F.body, fontSize: 15, lineHeight: 22, color: C.textPrimary },
  historyTextMuted: { color: C.textSecondary },
  historyPlay: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  historyEmpty: { fontFamily: F.body, fontSize: 14, color: C.textFaint, textAlign: 'center', marginTop: 40 },
});
