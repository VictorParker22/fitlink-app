/**
 * Solo — "The corner" (design canvas "FitLink Solo Corner", board "The
 * corner"). Presence-first, not a chat wall: the persona speaks ONE thing
 * at a time — orb breathes at rest, bar-meter while audio plays, transcript
 * one tap away behind the history icon.
 *
 * Data mechanics kept from the previous chat build: messages persist to
 * solo_messages (last 50 load on mount), buildContext sends only real data
 * (INVARIANTS §4), a 402 within PURCHASE_GRACE_MS of a purchase polls and
 * shows "Activating…" instead of routing to SoloPaywall, and failures get a
 * quiet retry — never a toast storm.
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
import { useAuth } from '../../context/AuthContext';
import { useAlert } from '../../context/AlertContext';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { computeStreak } from '../../lib/streak';
import { getSoloCharacter } from '../../lib/soloCharacters';
import { ensureSoloClient } from '../../lib/soloClient';
import { useSoloVoice, getAutoPlay, setAutoPlay as persistAutoPlay } from '../../lib/soloVoice';
import { streamCorner, firstSentence, StreamHttpError } from '../../lib/soloStream';
import { useDictation } from '../../lib/soloDictation';
import { Orb, SpokenLine, SOLO_TINT } from '../../components/solo/Presence';
import SoloPaywall from '../../components/paywalls/SoloPaywall';
import AiConsentSheet from '../../components/solo/AiConsentSheet';
import { hasAiConsent } from '../../lib/aiConsent';
import { buildSoloProgram } from '../../lib/soloProgram';
import { layers } from '../../lib/layers';
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

const QUICK_ASKS = ['Plan today', 'Build my week', 'I slept badly', 'Log a PR', 'Swap an exercise'];
// Anything that reads as "write me a program" rebuilds the week before the
// corner answers, so the reply can talk about real sessions.
const BUILD_INTENT = /(build|rebuild|make|write|create|plan).*(week|program|plan|programme)|new (week|program|plan)/i;

// A 402 in the minutes after a local purchase is RevenueCat's webhook still
// landing, not a missing subscription — this is how long we keep polling and
// showing "Activating..." before treating a 402 as a real paywall again.
const PURCHASE_GRACE_MS = 5 * 60 * 1000;
const PURCHASE_POLL_MS = 4_000;
// solo-program is idempotent under six days; past that the week is stale and
// the corner should rewrite it from what was actually logged.
const PROGRAM_STALE_MS = 6 * 24 * 60 * 60 * 1000;

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
  const { user } = useAuth();
  const { clientData, todayWorkout, workouts, progressLogs, healthSharingEnabled, refreshData } = useClient();
  const { isConnected: healthConnected, healthData } = useHealth();
  const { workoutHistory } = useWorkout();
  const voice = useSoloVoice();
  // Hold-to-talk. Falls back to a plain send button when the native
  // recognizer is missing (builds that predate expo-speech-recognition).
  const dictation = useDictation();

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

  // ── AI consent (Apple 5.1.2(i)) — asked once, before the first call ever
  // reaches the model. Whichever entry point gets there first (the brief or
  // a typed message) queues its own call and runs it once the sheet resolves.
  const [consentVisible, setConsentVisible] = useState(false);
  const pendingAfterConsentRef = useRef<(() => void) | null>(null);
  const ensureConsent = useCallback((action: () => void) => {
    if (hasAiConsent(user)) { action(); return; }
    pendingAfterConsentRef.current = action;
    setConsentVisible(true);
  }, [user]);
  const handleConsentAgree = useCallback(() => {
    layers.track('ai_consent', { granted: true });
    setConsentVisible(false);
    const action = pendingAfterConsentRef.current;
    pendingAfterConsentRef.current = null;
    action?.();
  }, []);
  const handleConsentDecline = useCallback(() => {
    layers.track('ai_consent', { granted: false });
    setConsentVisible(false);
    pendingAfterConsentRef.current = null;
    setCurrentLine('The corner stays quiet until you agree.');
  }, []);

  // ── Feedback on the current spoken line — one vote per line ────────────────
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [promptVersion, setPromptVersion] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<{ line: string; verdict: 'up' | 'down' } | null>(null);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { layers.track('solo_opened', { character: character.key }); }, []);

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

  // ── First week (and its weekly rewrite): the corner writes the program
  // once premium is live, then rewrites it once the current week goes stale.
  // solo-program is idempotent server-side (skips a fresh-enough week), so
  // this can fire on every mount without duplicating or over-adapting.
  const programAttemptedRef = useRef(false);
  // The brief waits for this so a first-ever line can name real sessions.
  const [programSettled, setProgramSettled] = useState(false);
  const [buildingWeek, setBuildingWeek] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const preAdaptLineRef = useRef('');
  useEffect(() => {
    if (!clientData?.id || programAttemptedRef.current) return;
    const until = (clientData as any)?.premium_until ? new Date((clientData as any).premium_until).getTime() : 0;
    if (until <= Date.now()) { setProgramSettled(true); return; }

    const builtAtRaw = (clientData as any)?.solo_program_built_at as string | undefined;
    if (!builtAtRaw) {
      // No week written yet — the very first one.
      programAttemptedRef.current = true;
      (async () => {
        setBuildingWeek(true);
        try {
          const res = await buildSoloProgram();
          if (res.ok && res.created.length > 0) {
            layers.track('program_built', { created: res.created.length, adapt: false });
            await refreshData();
          } else if (!res.ok && __DEV__) console.warn('[solo] program build:', res.reason, res.message);
        } finally {
          setBuildingWeek(false);
          setProgramSettled(true);
        }
      })();
      return;
    }

    const builtAt = new Date(builtAtRaw).getTime();
    if (Date.now() - builtAt > PROGRAM_STALE_MS) {
      // The week is stale — rewrite it from what was actually logged.
      programAttemptedRef.current = true;
      (async () => {
        setAdapting(true);
        setCurrentLine((prev) => { preAdaptLineRef.current = prev; return 'Rewriting next week from what you logged…'; });
        try {
          const res = await buildSoloProgram({ adapt: true });
          if (res.ok && res.created.length > 0) {
            layers.track('program_built', { created: res.created.length, adapt: true });
            await refreshData();
          } else if (!res.ok && __DEV__) console.warn('[solo] program adapt:', res.reason, res.message);
        } finally {
          setAdapting(false);
          setCurrentLine((cur) => cur === 'Rewriting next week from what you logged…' ? preAdaptLineRef.current : cur);
          setProgramSettled(true);
        }
      })();
      return;
    }

    setProgramSettled(true);
  }, [clientData?.id, (clientData as any)?.premium_until, (clientData as any)?.solo_program_built_at, refreshData]);

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
        if (lastCorner) {
          setCurrentLine(lastCorner.content);
          setCurrentMessageId(lastCorner.id);
          setPromptVersion(null);
        }
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
    // The week the corner wrote: with no logs yet this is the only thing it
    // can honestly talk about, and it should lead with it.
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (workouts || [])
      .filter((w: any) => w?.assigned_date && String(w.assigned_date) >= today && w?.status !== 'completed')
      .sort((a: any, b: any) => String(a.assigned_date).localeCompare(String(b.assigned_date)))
      .slice(0, 6)
      .map((w: any) => `${w?.workouts?.name ?? w?.name ?? 'Session'} on ${String(w.assigned_date)}`);
    if (upcoming.length > 0) ctx.week_plan = upcoming.join('; ');
    const logged = (workoutHistory || []).length;
    if (logged === 0) ctx.sessions_logged = "none yet, this is the athlete's first week";
    return ctx;
  }, [todayWorkout, sessionName, sessionExercises, workoutHistory, workouts, healthSharingEnabled, healthConnected, healthData, progressLogs]);

  // The activating line has a lifetime — PURCHASE_GRACE_MS from the purchase.
  // Past it, a 402 is a real paywall again; a paying athlete never bounces
  // inside the window while RevenueCat's webhook is still landing.
  useEffect(() => {
    if (!activating) return;
    const remaining = Math.max(0, PURCHASE_GRACE_MS - (Date.now() - lastPurchaseAtRef.current));
    const t = setTimeout(() => setActivating(false), remaining);
    const poll = setInterval(() => { refreshData().catch(() => {}); }, PURCHASE_POLL_MS);
    return () => { clearTimeout(t); clearInterval(poll); };
  }, [activating]);

  // Shared 402 handling for both the brief and a sent message: inside the
  // purchase grace window this is the webhook still landing, not a real
  // denial, so it shows "Activating…" and polls rather than showing the
  // paywall the athlete just paid on.
  const handle402 = useCallback(() => {
    if (Date.now() - lastPurchaseAtRef.current < PURCHASE_GRACE_MS) {
      setActivating(true);
      setCurrentLine('Activating your subscription…');
    } else {
      setCurrentLine(`Solo is a paid corner. Start your trial to hear from ${character.name}.`);
      setPaywallVisible(true);
      layers.track('paywall_shown', { source: 'corner' });
    }
  }, [character.name]);

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

  // The sequence key of the reply currently being spoken chunk-by-chunk, so
  // the spoken line can show itself active while its text is still growing.
  const streamKeyRef = useRef<string | null>(null);
  const streamActive = !!streamKeyRef.current && voice.state.activeText === streamKeyRef.current;

  /**
   * Ask the corner and paint the answer as it arrives (roast phase 2).
   * Streams by default: the line types in, speech starts on the first
   * sentence, the rest follows as one clip. Falls back to the plain JSON
   * call when streaming is unavailable. Throws { status } on an HTTP
   * refusal (402 paywall, 429 rate limit) or { status: 0 } when nothing
   * usable came back.
   */
  const runCorner = useCallback(async (body: Record<string, unknown>, startedAt: number) => {
    const key = `stream-${startedAt}`;
    const seqCtl = { current: null as ReturnType<typeof voice.speakSequence> | null };
    let spokenPrefix = '';
    let firstTextAt = 0;
    try {
      const res = await streamCorner({ ...body, character: character.key }, {
        onMeta: (m) => setBasedOn(m.based_on),
        onText: (t) => {
          if (!firstTextAt) firstTextAt = Date.now();
          setCurrentLine(t);
          if (autoPlay && !seqCtl.current) {
            const fs = firstSentence(t);
            if (fs) {
              seqCtl.current = voice.speakSequence(key, character.key);
              streamKeyRef.current = key;
              spokenPrefix = fs;
              seqCtl.current.push(fs);
            }
          }
        },
      });
      if (seqCtl.current) {
        if (res.rewritten || !res.reply.startsWith(spokenPrefix)) {
          // The grounding check changed the text after part of it was
          // spoken: say the corrected line whole rather than a mismatched tail.
          seqCtl.current.cancel();
          streamKeyRef.current = null;
          voice.speak(res.reply, character.key);
        } else {
          const rest = res.reply.slice(spokenPrefix.length).trim();
          if (rest) seqCtl.current.push(rest);
          seqCtl.current.end();
        }
      } else if (autoPlay) {
        voice.speak(res.reply, character.key);
      }
      return {
        reply: res.reply,
        basedOn: res.meta.based_on,
        promptVersion: res.meta.prompt_version,
        firstTextMs: firstTextAt ? firstTextAt - startedAt : null,
        streamed: true,
      };
    } catch (e: any) {
      if (seqCtl.current) { seqCtl.current.cancel(); streamKeyRef.current = null; }
      if (e instanceof StreamHttpError) throw { status: e.status };
      // Streaming unavailable (older function, buffering proxy, transport):
      // the plain call still answers, just all at once.
      const { data, error } = await callCorner(body);
      if (error) throw { status: (error as any)?.context?.status ?? 0 };
      const reply: string | undefined = data?.reply;
      if (!reply) throw { status: 0 };
      setCurrentLine(reply);
      const basedOn = Array.isArray(data?.based_on) ? data.based_on : [];
      setBasedOn(basedOn);
      if (autoPlay) voice.speak(reply, character.key);
      return {
        reply,
        basedOn,
        promptVersion: typeof data?.prompt_version === 'string' ? data.prompt_version : null,
        firstTextMs: Date.now() - startedAt,
        streamed: false,
      };
    }
  }, [voice, character.key, autoPlay, callCorner]);

  /** Returns the persisted row's id (for feedback's message_id), or null. */
  const persistCornerMessage = useCallback(async (content: string): Promise<string | null> => {
    if (!clientData?.id) return null;
    const { data, error } = await supabase
      .from('solo_messages')
      .insert({ client_id: clientData.id, role: 'corner', content })
      .select('id')
      .single();
    if (error) {
      if (__DEV__) console.warn('[Solo] corner row not saved:', error.message);
      return null;
    }
    return (data as any)?.id ?? null;
  }, [clientData?.id]);

  // One vote per line: submit at most once for the currently-spoken content.
  const submitFeedback = useCallback((verdict: 'up' | 'down') => {
    if (!clientData?.id || feedbackGiven?.line === currentLine) return;
    Haptics.selectionAsync().catch(() => {});
    setFeedbackGiven({ line: currentLine, verdict });
    supabase.from('solo_feedback').insert({
      client_id: clientData.id,
      message_id: currentMessageId,
      content: currentLine,
      verdict,
      character: character.key,
      prompt_version: promptVersion,
    }).then(({ error }) => {
      if (error && __DEV__) console.warn('[Solo] feedback not saved:', error.message);
    });
  }, [clientData?.id, feedbackGiven, currentLine, currentMessageId, character.key, promptVersion]);

  // ── First-open brief: when a brand-new corner has no history yet ──────────
  useEffect(() => {
    if (loading || !clientData?.id || messages.length > 0 || briefRequestedRef.current) return;
    if (!programSettled) { setCurrentLine(buildingWeek ? 'Writing your first week…' : (WELCOME[character.key] ?? WELCOME.reyes)); return; }
    briefRequestedRef.current = true;
    setCurrentLine(WELCOME[character.key] ?? WELCOME.reyes);
    const requestBrief = async () => {
      setWaitingReply(true);
      const startedAt = Date.now();
      try {
        let out: Awaited<ReturnType<typeof runCorner>>;
        try {
          out = await runCorner({ mode: 'brief', history: [], context: buildContext() }, startedAt);
        } catch (err: any) {
          if (err?.status === 402) handle402();
          return;
        }
        const reply = out.reply;
        const msgId = await persistCornerMessage(reply);
        setCurrentMessageId(msgId);
        setPromptVersion(out.promptVersion);
        setMessages((prev) => [...prev, {
          id: msgId ?? `local-brief-${Date.now()}`, role: 'corner', content: reply, created_at: new Date().toISOString(),
        }]);
        layers.track('brief_delivered', {
          character: character.key,
          latency_ms: Date.now() - startedAt,
          first_text_ms: out.firstTextMs,
          streamed: out.streamed,
        });
      } catch (e) {
        if (__DEV__) console.warn('[Solo] brief request threw:', e);
      } finally {
        setWaitingReply(false);
      }
    };
    ensureConsent(requestBrief);
  }, [loading, clientData?.id, messages.length, programSettled, buildingWeek, callCorner, buildContext, character.key, character.name, persistCornerMessage, speakReply, ensureConsent, handle402]);

  // ── Send an athlete message (composer or quick-ask chip) ──────────────────
  const deliver = useCallback(
    async (content: string, priorHistory: SoloMessage[]) => {
      if (!clientData?.id) return;
      setWaitingReply(true);
      setPendingRetry(null);
      const startedAt = Date.now();
      const autoPlayedThisReply = autoPlay;
      try {
        const history = priorHistory
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content }));

        // "Build my week" and its cousins: write the program first, then let
        // the corner describe what it just wrote.
        const extra: Record<string, string> = {};
        if (BUILD_INTENT.test(content)) {
          setCurrentLine('Writing your week…');
          const res = await buildSoloProgram({ rebuild: true });
          if (res.ok && res.created.length > 0) {
            extra.just_built_week = res.created.map((c) => `${c.name} on ${c.date}`).join('; ');
            layers.track('program_built', { created: res.created.length, adapt: false });
            refreshData().catch(() => {});
          } else if (!res.ok && res.reason !== 'premium_required') {
            extra.program_build_failed = 'the program could not be written just now';
          }
        }

        let out: Awaited<ReturnType<typeof runCorner>>;
        try {
          out = await runCorner({ message: content, history, context: { ...buildContext(), ...extra } }, startedAt);
        } catch (err: any) {
          const status = err?.status;
          if (status === 402) {
            handle402();
          } else if (status === 429) {
            setCurrentLine("Give me a minute. You've asked a lot this hour.");
          } else {
            setCurrentLine("Couldn't reach your corner. Try again.");
            setPendingRetry({ content, prior: priorHistory });
          }
          return;
        }
        const reply = out.reply;

        // A reply means the entitlement landed — the activating line is done.
        setActivating(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const msgId = await persistCornerMessage(reply);
        setCurrentMessageId(msgId);
        setPromptVersion(out.promptVersion);
        setMessages((prev) => [...prev, {
          id: msgId ?? `local-corner-${Date.now()}`, role: 'corner', content: reply, created_at: new Date().toISOString(),
        }]);
        layers.track('corner_reply', {
          character: character.key,
          latency_ms: Date.now() - startedAt,
          first_text_ms: out.firstTextMs,
          streamed: out.streamed,
          audio_autoplayed: autoPlayedThisReply,
        });
      } catch (e) {
        if (__DEV__) console.warn('[Solo] deliver threw:', e);
        setCurrentLine("Couldn't reach your corner. Try again.");
        setPendingRetry({ content, prior: priorHistory });
      } finally {
        setWaitingReply(false);
      }
    },
    [clientData?.id, callCorner, buildContext, character.key, character.name, persistCornerMessage, speakReply, handle402, autoPlay]
  );

  const sendMessage = useCallback((content: string) => {
    const trimmed = content.trim();
    if (!trimmed || sendingRef.current || !clientData?.id) return;
    // Gated before anything else happens — a decline must not even echo the
    // athlete's line, since the corner is never going to answer it.
    ensureConsent(async () => {
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
    });
  }, [messages, clientData?.id, deliver, ensureConsent]);

  const handleSend = useCallback(() => {
    const content = input.trim();
    if (!content) return;
    setInput('');
    sendMessage(content);
  }, [input, sendMessage]);

  // ── Hold to talk ──────────────────────────────────────────────────────────
  const holdStartedAt = useRef(0);
  const onHoldStart = useCallback(async () => {
    if (!dictation.available || waitingReply) return;
    voice.stop();
    holdStartedAt.current = Date.now();
    const ok = await dictation.start();
    if (ok) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      showAlert({ title: 'Microphone', message: `Allow the microphone and speech recognition in Settings to talk to ${character.name}.` });
    }
  }, [dictation, waitingReply, voice, showAlert, character.name]);

  const onHoldEnd = useCallback(async () => {
    if (!dictation.available) return;
    const heldMs = Date.now() - holdStartedAt.current;
    const text = await dictation.stop();
    Haptics.selectionAsync();
    if (heldMs < 400 && !text) return; // a tap, not a hold — nothing to send
    if (text) {
      setInput('');
      sendMessage(text);
    }
  }, [dictation, sendMessage]);

  // Mirror the live transcript into the composer so the athlete sees what
  // was heard before it is sent.
  useEffect(() => {
    if (dictation.listening) setInput(dictation.transcript);
  }, [dictation.listening, dictation.transcript]);

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
            <>
              <View style={[s.spokenBlock, orbLoading && s.spokenBlockDim]}>
                <SpokenLine
                  text={currentLine}
                  tint={tint}
                  state={voice.state}
                  activeOverride={streamActive ? true : undefined}
                  onToggle={() => (streamActive ? voice.stop() : voice.toggle(currentLine, character.key))}
                />
              </View>
              {!!currentLine && (
                <View style={s.feedbackRow}>
                  <TouchableOpacity
                    style={s.feedbackBtn}
                    onPress={() => submitFeedback('up')}
                    disabled={feedbackGiven?.line === currentLine}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="This helped"
                  >
                    <Ionicons
                      name="thumbs-up-outline"
                      size={20}
                      color={feedbackGiven?.line === currentLine && feedbackGiven.verdict === 'up' ? C.accent : C.textFaint}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.feedbackBtn}
                    onPress={() => submitFeedback('down')}
                    disabled={feedbackGiven?.line === currentLine}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel="This missed"
                  >
                    <Ionicons
                      name="thumbs-down-outline"
                      size={20}
                      color={feedbackGiven?.line === currentLine && feedbackGiven.verdict === 'down' ? C.accent : C.textFaint}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </>
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
            {dictation.available && (dictation.listening || !input.trim()) ? (
              <TouchableOpacity
                style={[s.sendBtn, dictation.listening ? s.micBtnLive : null]}
                onPressIn={onHoldStart}
                onPressOut={onHoldEnd}
                disabled={waitingReply}
                delayPressIn={0}
                activeOpacity={0.9}
                hitSlop={2}
                accessibilityRole="button"
                accessibilityLabel={`Hold to talk to ${character.name}`}
                accessibilityHint="Press and hold, speak, then release to send"
                accessibilityState={{ busy: dictation.listening }}
              >
                <Ionicons name={dictation.listening ? 'mic' : 'mic-outline'} size={20} color={dictation.listening ? C.onAccent : C.textPrimary} />
              </TouchableOpacity>
            ) : (
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
            )}
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
          // Opens the purchase grace window for the webhook to land server-side.
          lastPurchaseAtRef.current = Date.now();
          setPaywallVisible(false);
          setActivating(true);
          setCurrentLine('Activating your subscription…');
          layers.track('trial_started', { source: 'corner' });
        }}
      />

      <AiConsentSheet
        visible={consentVisible}
        onAgree={handleConsentAgree}
        onDecline={handleConsentDecline}
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
  feedbackRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  feedbackBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

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
  micBtnLive: { backgroundColor: C.accent, transform: [{ scale: 1.08 }] },

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
