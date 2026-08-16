import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform,
  LayoutAnimation, UIManager, ActivityIndicator, TextInput, KeyboardAvoidingView,
  Modal, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import Animated, { SlideInRight, SlideInLeft } from 'react-native-reanimated';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { supabase } from '../../lib/supabase';
import { proxyGifUrl } from '../../lib/exercisedb';
import { useWorkout, StrengthSetLog, SetFeel, WorkoutHistoryEntry } from '../../context/WorkoutContext';
import { suggestNextLoad } from '../../lib/loadSuggestion';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useClient } from '../../context/ClientContext';
import PRCelebration, { WeeklyBest } from '../../components/client-tabs/PRCelebration';
import ExerciseMediaDemo from '../../components/shared/exercise/ExerciseMediaDemo';
import ExerciseInstructions from '../../components/shared/exercise/ExerciseInstructions';
import MuscleMap from '../../components/anatomy/MuscleMap';
import { musclesForExercise, regionLabel, MuscleRegionId } from '../../lib/muscles';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Athlete in-session experience (design turn 22b + 22c, live mode reshaped as
 * a card-centric "active workout" player).
 *
 * 22b — logging a set is two beats: the number (prefilled from real history,
 * big touch targets), then how it felt. The feel is stored on the set, not
 * decorative: it rides into fitlink_workout_history (WorkoutContext) and into
 * the existing client_workout_logs JSONB on the server.
 *
 * 22c — a genuine PR (top weight beats this athlete's real prior best for the
 * exercise) triggers the in-screen celebration overlay, and the PR can go
 * somewhere: an editable message into the coach conversation.
 *
 * Player layout — one exercise front-and-center per card (name, target,
 * real tags/instructions/image, set logging inside the card), Prev/Next
 * progression at the bottom with a jumpable exercise rail. Per-exercise
 * input drafts are keyed by exercise id so navigation never loses state.
 */

const FEELS: { key: SetFeel; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'right', label: 'Right' },
  { key: 'grind', label: 'Grind' },
  { key: 'failed', label: 'Failed' },
];

const FEEL_PHRASE: Record<SetFeel, string> = {
  easy: 'you called it easy',
  right: 'you called it about right',
  grind: 'you called it a grind',
  failed: 'you flagged a failed rep',
};

interface Ex {
  key: string;
  exerciseId: string;
  name: string;
  sets: number;
  reps: number;
  restSec: number;
  raw: any;
}

interface PrHit {
  exerciseId: string;
  exerciseName: string;
  weight: number;
  reps: number;
  setsCount: number;
  priorBest: number;
}

interface InputDraft {
  w: string;
  r: string;
  feel: SetFeel | null;
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

function cap(t: string): string {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// Real instructions → bullet lines. HTML list items / paragraphs become
// bullets; a single plain-text blob is split on sentence ends. No data → [].
function toBullets(raw?: string | null): string[] {
  if (!raw) return [];
  const withBreaks = String(raw)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(li|p|div|ol|ul)\s*>/gi, '\n');
  const text = withBreaks.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/g, ' ');
  const lines = text.split(/\r?\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const items = lines.length > 1
    ? lines
    : (lines[0] ?? '').split(/\.\s+/).map(s => s.trim()).filter(s => s.length > 1);
  return items.map(s => (/[.!?]$/.test(s) ? s : `${s}.`));
}

export default function StrengthSessionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const { workoutHistory, recordStrengthWorkout } = useWorkout();
  const { clientData, trainer, conversation, enrollment, exercisePrs, logExerciseSet, checkAndUpdatePr } = useClient();
  const reducedMotion = useReducedMotion();

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});

  // ── Live session state ──
  const [mode, setMode] = useState<'overview' | 'live'>('overview');
  const [exIdx, setExIdx] = useState(0);
  const [logged, setLogged] = useState<StrengthSetLog[]>([]);
  const [weightStr, setWeightStr] = useState('');
  const [repsStr, setRepsStr] = useState('');
  const [feel, setFeel] = useState<SetFeel | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const [prHit, setPrHit] = useState<PrHit | null>(null);
  const [showPr, setShowPr] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const [instrOpen, setInstrOpen] = useState<Record<string, boolean>>({});
  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);
  // In-progress inputs per exercise id — Prev/Next never loses typed state.
  const draftsRef = useRef<Record<string, InputDraft>>({});
  // Card slide direction: 1 = forward (slide in from right), -1 = backward.
  const navDirRef = useRef<1 | -1>(1);

  useEffect(() => {
    async function fetchSession() {
      if (!params.sessionId) { setLoading(false); return; }
      try {
        const { data, error } = await supabase
          .from('workouts')
          .select('*, workout_exercises(*, exercises(*)), trainers(*)')
          .eq('id', params.sessionId)
          .single();
        if (error) throw error;
        setSession(data);
      } catch (err) {
        console.error('Error fetching session:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [params.sessionId]);

  const exercises: Ex[] = useMemo(() => {
    return ((session?.workout_exercises || []) as any[])
      .slice()
      .sort((a, b) => (a.order_index ?? a.order ?? 0) - (b.order_index ?? b.order ?? 0))
      .map((we) => ({
        key: we.id,
        exerciseId: we.exercises?.id || we.exercise_id || we.id,
        name: we.exercises?.name || 'Exercise',
        sets: Math.max(1, parseInt(String(we.sets), 10) || 3),
        reps: Math.max(1, parseInt(String(we.reps), 10) || 8),
        restSec: we.rest_seconds > 0 ? we.rest_seconds : 90,
        raw: we,
      }));
  }, [session]);

  // ── Real history lookups ──

  // Most recent history entry that logged sets for this exercise.
  const lastLoggedFor = useCallback((exerciseId: string): { sets: StrengthSetLog[]; entry: WorkoutHistoryEntry } | null => {
    for (const entry of workoutHistory) {
      const sets = entry.sets?.filter(s => s.exerciseId === exerciseId);
      if (sets && sets.length > 0) return { sets, entry };
    }
    return null;
  }, [workoutHistory]);

  // All-time prior best weight for an exercise: server-side logs (exercisePrs)
  // merged with local fitlink_workout_history set logs. 0 = never logged.
  const priorBestFor = useCallback((exerciseId: string): number => {
    let best = exercisePrs[exerciseId] ?? 0;
    for (const entry of workoutHistory) {
      for (const set of entry.sets ?? []) {
        if (set.exerciseId === exerciseId && set.weight > best) best = set.weight;
      }
    }
    return best;
  }, [exercisePrs, workoutHistory]);

  // ── Preview data (overview mode) ──
  // Whole-workout muscle aggregate — same pattern as the Targets card in
  // app/workout/[id].tsx. Real exercise data only; nothing → no figure.
  const workoutMuscles = useMemo(() => {
    const primaryCounts = new Map<MuscleRegionId, number>();
    const secondaryCounts = new Map<MuscleRegionId, number>();
    exercises.forEach((ex) => {
      const base = ex.raw?.exercises;
      if (!base) return;
      const { primary, secondary } = musclesForExercise(base);
      primary.forEach(id => primaryCounts.set(id, (primaryCounts.get(id) || 0) + 1));
      secondary.forEach(id => secondaryCounts.set(id, (secondaryCounts.get(id) || 0) + 1));
    });
    const primary = [...primaryCounts.keys()];
    const secondary = [...secondaryCounts.keys()].filter(id => !primaryCounts.has(id));
    const rows = [
      ...[...primaryCounts.entries()].map(([id, count]) => ({ id, count, isPrimary: true })),
      ...secondary.map(id => ({ id, count: secondaryCounts.get(id) || 0, isPrimary: false })),
    ].sort((a, b) => (a.isPrimary === b.isPrimary ? b.count - a.count : a.isPrimary ? -1 : 1));
    return { primary, secondary, rows };
  }, [exercises]);

  // Honest estimate: sum of sets × (rest + ~40s work per set). Only shown when
  // every exercise carries a real sets count — otherwise omitted entirely.
  const totalSets = useMemo(() => exercises.reduce((sum, ex) => sum + ex.sets, 0), [exercises]);
  const estMinutes = useMemo(() => {
    if (exercises.length === 0) return null;
    const allReal = exercises.every(ex => {
      const rawSets = parseInt(String(ex.raw?.sets), 10);
      return Number.isFinite(rawSets) && rawSets > 0;
    });
    if (!allReal) return null;
    const seconds = exercises.reduce((sum, ex) => sum + ex.sets * (ex.restSec + 40), 0);
    return Math.max(1, Math.round(seconds / 60));
  }, [exercises]);

  const currentEx = exercises[exIdx] ?? null;
  // Muscle regions for the focus card's anatomy map — real exercise data only;
  // exercises without recognizable muscle info simply render no map.
  const muscleTargets = useMemo(
    () =>
      currentEx
        ? musclesForExercise(currentEx.raw?.exercises ?? {})
        : { primary: [] as string[], secondary: [] as string[] },
    [currentEx],
  );
  const doneSetsForCurrent = currentEx ? logged.filter(s => s.exerciseId === currentEx.exerciseId) : [];
  const curSetIdx = doneSetsForCurrent.length;

  const setsDoneFor = useCallback((exerciseId: string) => (
    logged.filter(s => s.exerciseId === exerciseId).length
  ), [logged]);

  // Exercises with every target set logged — drives the header progress bar
  // and the done state on the rail.
  const completedCount = useMemo(() => (
    exercises.filter(e => setsDoneFor(e.exerciseId) >= e.sets).length
  ), [exercises, setsDoneFor]);

  // Prefill the number from real history (last time's top set), else empty.
  const prefillFor = useCallback((ex: Ex) => {
    const last = lastLoggedFor(ex.exerciseId);
    if (last) {
      const top = last.sets.reduce((a, b) => (b.weight > a.weight ? b : a));
      setWeightStr(fmtKg(top.weight));
      setRepsStr(String(ex.reps));
    } else {
      setWeightStr('');
      setRepsStr(String(ex.reps));
    }
  }, [lastLoggedFor]);

  // Suggested next load — real history only (lastLoggedFor returns null for a
  // never-logged exercise, so new exercises get no suggestion, ever).
  const suggestion = useMemo(() => {
    if (!currentEx) return null;
    const last = lastLoggedFor(currentEx.exerciseId);
    if (!last) return null;
    return suggestNextLoad(last.sets);
  }, [currentEx, lastLoggedFor]);

  // Opt-in fill only — tapping the chip is the one way it touches the input.
  const applySuggestion = useCallback(() => {
    if (!suggestion) return;
    Haptics.selectionAsync();
    setWeightStr(fmtKg(suggestion.suggestedWeight));
  }, [suggestion]);

  // ── Timers ──
  useEffect(() => {
    if (mode !== 'live' || showPr) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [mode, showPr]);

  useEffect(() => {
    if (mode !== 'live' || restLeft == null || restLeft <= 0) return;
    const t = setInterval(() => setRestLeft(prev => (prev != null && prev > 0 ? prev - 1 : prev)), 1000);
    return () => clearInterval(t);
  }, [mode, restLeft != null && restLeft > 0]);

  // Rest over — one buzz so the athlete can put the phone face down between sets.
  useEffect(() => {
    if (mode !== 'live' || restLeft !== 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRestLeft(null);
  }, [mode, restLeft]);

  // ── Actions ──
  const startLive = () => {
    if (exercises.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    startedAtRef.current = Date.now();
    finishedRef.current = false;
    draftsRef.current = {};
    navDirRef.current = 1;
    setLogged([]);
    setExIdx(0);
    setElapsed(0);
    setRestLeft(null);
    setPrHit(null);
    setFeel(null);
    setInstrOpen({});
    setMode('live');
    prefillFor(exercises[0]);
  };

  const bumpWeight = (delta: number) => {
    Haptics.selectionAsync();
    const w = Math.max(0, (parseFloat(weightStr) || 0) + delta);
    setWeightStr(fmtKg(w));
  };

  const bumpReps = (delta: number) => {
    Haptics.selectionAsync();
    const r = Math.max(1, (parseInt(repsStr, 10) || 0) + delta);
    setRepsStr(String(r));
  };

  const pickFeel = (f: SetFeel) => {
    Haptics.selectionAsync();
    setFeel(prev => (prev === f ? null : f));
  };

  // Restore a target exercise's saved draft, or prefill from real history.
  const restoreInputsFor = useCallback((ex: Ex) => {
    const draft = draftsRef.current[ex.exerciseId];
    if (draft) {
      setWeightStr(draft.w);
      setRepsStr(draft.r);
      setFeel(draft.feel);
    } else {
      prefillFor(ex);
      setFeel(null);
    }
  }, [prefillFor]);

  // Prev/Next/rail navigation — saves the current draft first, never drops it.
  const goToExercise = useCallback((nextIdx: number) => {
    if (nextIdx < 0 || nextIdx >= exercises.length || nextIdx === exIdx) return;
    Haptics.selectionAsync();
    if (currentEx) {
      draftsRef.current[currentEx.exerciseId] = { w: weightStr, r: repsStr, feel };
    }
    navDirRef.current = nextIdx > exIdx ? 1 : -1;
    restoreInputsFor(exercises[nextIdx]);
    setExIdx(nextIdx);
  }, [exercises, exIdx, currentEx, weightStr, repsStr, feel, restoreInputsFor]);

  const finishSession = useCallback(async (allSets: StrengthSetLog[], bestPr: PrHit | null) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinishing(true);
    const durationSec = Math.max(1, Math.floor((Date.now() - startedAtRef.current) / 1000));

    // Local history — fitlink_workout_history, sets include feel.
    recordStrengthWorkout({
      workoutId: session.id,
      title: session.name || 'Workout',
      instructor: session.trainers?.name || '',
      startedAt: startedAtRef.current,
      durationSec,
      sets: allSets,
    });

    // Update the in-memory PR map so the same lift can't re-fire this session.
    allSets.forEach(s => checkAndUpdatePr(s.exerciseId, s.weight));

    // Server side — same client_workout_logs table + exercises JSONB shape the
    // existing completion path writes, with the optional feel per set.
    if (clientData?.id) {
      const byExercise: Record<string, { id: string; sets: any[] }> = {};
      allSets.forEach(s => {
        if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = { id: s.exerciseId, sets: [] };
        byExercise[s.exerciseId].sets[s.setIndex] = {
          weight: s.weight,
          reps: s.reps,
          completed: true,
          ...(s.feel ? { feel: s.feel } : {}),
        };
      });
      const { error } = await supabase.from('client_workout_logs').insert({
        client_id: clientData.id,
        workout_id: session.id,
        exercises: Object.values(byExercise),
        duration_minutes: Math.round(durationSec / 60),
      });
      if (error) {
        // The athlete's sets are the whole point of this screen. They are in
        // local history, but the coach-visible copy did not land — say so
        // instead of finishing as though everything saved.
        if (__DEV__) console.warn('[StrengthSession] Log save failed:', error.message);
        setFinishing(false);
        Alert.alert(
          'Sets not synced',
          "Your sets are saved on this device, but we couldn't send them to your coach. They won't show in your coach's view until this syncs.",
        );
        if (bestPr) setShowPr(true);
        else router.push(ClientRoute.workouts);
        return;
      }

      // Close the loop: tell the coach, with the real set count only.
      // Fire-and-forget — a notification failure never blocks the finish flow.
      if (clientData.trainer_id && allSets.length > 0) {
        const summary = `${clientData.name} finished ${session.name || 'a workout'} — ${allSets.length} set${allSets.length === 1 ? '' : 's'} logged`;
        (async () => {
          const { error: notifErr } = await supabase.from('notifications').insert({
            trainer_id: clientData.trainer_id,
            type: 'workout',
            title: 'Workout completed',
            description: summary,
            metadata: { client_id: clientData.id, sets: allSets.length },
            is_read: false,
          });
          if (notifErr && __DEV__) console.warn('[StrengthSession] Coach notification skipped:', notifErr.message);
        })();
        if (trainer?.expo_push_token) {
          supabase.functions.invoke('send-push-notification', {
            body: {
              pushToken: trainer.expo_push_token,
              title: 'Workout completed',
              body: summary,
              data: { url: `/client/${clientData.id}` },
            },
          }).catch(() => {});
        }
      }
    }

    setFinishing(false);
    if (bestPr) {
      setShowPr(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(ClientRoute.workouts);
    }
  }, [session, clientData, trainer, recordStrengthWorkout, checkAndUpdatePr, router]);

  const logSet = () => {
    if (!currentEx) return;
    const w = parseFloat(weightStr) || 0;
    const r = parseInt(repsStr, 10) || 0;
    if (w <= 0 || r <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const set: StrengthSetLog = {
      exerciseId: currentEx.exerciseId,
      exerciseName: currentEx.name,
      setIndex: curSetIdx,
      weight: w,
      reps: r,
      ...(feel ? { feel } : {}),
    };
    const nextLogged = [...logged, set];
    setLogged(nextLogged);
    // Mirror into ClientContext's in-memory log map (existing shape, + feel).
    logExerciseSet(session.id, currentEx.exerciseId, curSetIdx, w, r, feel ?? undefined);

    // PR check — genuine only: needs real prior history, and beats it.
    const prior = priorBestFor(currentEx.exerciseId);
    let nextPr = prHit;
    if (prior > 0 && w > prior && w > (prHit?.exerciseId === currentEx.exerciseId ? prHit.weight : 0)) {
      nextPr = {
        exerciseId: currentEx.exerciseId,
        exerciseName: currentEx.name,
        weight: w,
        reps: r,
        setsCount: currentEx.sets,
        priorBest: prior,
      };
      // Keep the biggest jump if PRs land on two different lifts.
      if (prHit && prHit.exerciseId !== currentEx.exerciseId
          && (prHit.weight - prHit.priorBest) >= (w - prior)) {
        nextPr = prHit;
      }
      setPrHit(nextPr);
    }

    setFeel(null);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

    const isLastSet = curSetIdx + 1 >= currentEx.sets;
    if (!isLastSet) {
      setRestLeft(currentEx.restSec);
      return;
    }
    const isLastExercise = exIdx + 1 >= exercises.length;
    if (!isLastExercise) {
      // All target sets logged — rest starts and the player advances to the
      // next card (drafts keep anything typed there earlier).
      setRestLeft(currentEx.restSec);
      draftsRef.current[currentEx.exerciseId] = { w: weightStr, r: repsStr, feel: null };
      navDirRef.current = 1;
      restoreInputsFor(exercises[exIdx + 1]);
      setExIdx(exIdx + 1);
    } else {
      // Last exercise complete — the athlete ends it with "Finish session"
      // (same finishSession path, PR detection unchanged).
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // "Finish session" on the last card — invokes the existing finish flow.
  const onFinishPress = useCallback(() => {
    if (finishing) return;
    if (logged.length === 0) {
      // Nothing logged: nothing honest to record — back to the overview.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setMode('overview');
      return;
    }
    finishSession(logged, prHit);
  }, [finishing, logged, prHit, finishSession]);

  // ── PR overlay data (all from real history) ──
  const prOverlayData = useMemo(() => {
    if (!prHit) return null;
    // Every prior data point for this exercise, oldest first.
    const points: { at: number; weight: number }[] = [];
    workoutHistory.forEach(entry => {
      const top = (entry.sets ?? [])
        .filter(s => s.exerciseId === prHit.exerciseId)
        .reduce((max, s) => Math.max(max, s.weight), 0);
      if (top > 0) points.push({ at: entry.completedAt, weight: top });
    });
    points.sort((a, b) => a.at - b.at);
    // The just-recorded session is already in workoutHistory by the time this
    // shows; make sure the current PR is the final point either way.
    if (points.length === 0 || points[points.length - 1].weight < prHit.weight) {
      points.push({ at: Date.now(), weight: prHit.weight });
    }

    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const first = points[0];
    const weeksAgo = Math.floor((Date.now() - first.at) / WEEK);
    const gain = prHit.weight - first.weight;
    const gainSinceFirst = points.length >= 2 && gain > 0 ? { kg: gain, weeksAgo } : null;

    // Weekly bests chart: bucket by week since first log, keep last 4 buckets.
    const buckets = new Map<number, number>();
    points.forEach(p => {
      const wk = Math.floor((p.at - first.at) / WEEK);
      buckets.set(wk, Math.max(buckets.get(wk) ?? 0, p.weight));
    });
    const wkKeys = [...buckets.keys()].sort((a, b) => a - b).slice(-4);
    const weeklyBests: WeeklyBest[] = wkKeys.map((wk, i) => ({
      label: `W${wk + 1}`,
      weight: buckets.get(wk)!,
      isCurrent: i === wkKeys.length - 1,
    }));

    const coachName = trainer?.name || 'your coach';
    const defaultMessage =
      `New ${prHit.exerciseName.toLowerCase()} PR — ${fmtKg(prHit.weight)} kg for ${prHit.reps}. ` +
      `Previous best was ${fmtKg(prHit.priorBest)} kg.`;

    return { gainSinceFirst, weeklyBests: weeklyBests.length >= 2 ? weeklyBests : [], coachName, defaultMessage };
  }, [prHit, workoutHistory, trainer]);

  const sendPrToCoach = useCallback(async (content: string) => {
    if (!conversation) throw new Error('No conversation');
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_type: 'client',
      content,
    });
    if (error) throw error;
    await supabase.rpc('increment_conversation_unread', {
      conv_id: conversation.id,
      new_last_message: content,
    });
    if (trainer?.expo_push_token) {
      supabase.functions.invoke('send-push-notification', {
        body: {
          pushToken: trainer.expo_push_token,
          title: `Message from ${clientData?.name || 'Client'}`,
          body: content,
          data: { url: '/messages' },
        },
      }).catch(() => {});
    }
  }, [conversation, trainer, clientData]);

  const toggleExercise = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.selectionAsync();
    setExpandedExercises(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleInstructions = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInstrOpen(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Accordion list of the whole workout — used by the pre-start overview and
  // reused inside the live-mode "All exercises" modal.
  const renderExerciseList = () => (
    <View style={{ gap: 8 }}>
      {exercises.map((ex) => {
        const open = expandedExercises[ex.key] || false;
        const last = lastLoggedFor(ex.exerciseId);
        const lastTop = last ? last.sets.reduce((a, b) => (b.weight > a.weight ? b : a)) : null;
        const instructionText = ex.raw.notes || ex.raw.exercises?.instructions;
        const equipment = ex.raw.exercises?.equipment as string | undefined;
        return (
          <View key={ex.key} style={s.exCard}>
            <TouchableOpacity
              style={s.exRow}
              activeOpacity={0.85}
              onPress={() => toggleExercise(ex.key)}
              accessibilityRole="button"
              accessibilityLabel={`${ex.name}, ${ex.sets} sets of ${ex.reps}, ${ex.restSec} seconds rest${equipment ? `, ${equipment}` : ''}${lastTop ? `, last time ${fmtKg(lastTop.weight)} kilograms` : ''}`}
              accessibilityState={{ expanded: open }}
              accessibilityHint={open ? 'Double tap to collapse details' : 'Double tap to expand details'}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.exName}>{ex.name}</Text>
                <Text style={s.exMeta}>
                  {ex.sets}×{ex.reps} · {ex.restSec}s rest
                  {equipment ? ` · ${cap(equipment)}` : ''}
                  {lastTop ? ` · last time ${fmtKg(lastTop.weight)} kg` : ''}
                </Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={CoachColors.textFaint} />
            </TouchableOpacity>
            {open && (
              <View style={s.exExpanded}>
                <ExerciseMediaDemo
                  imageUrl={ex.raw.exercises?.image_url}
                  videoUrl={ex.raw.video_url}
                  exerciseName={ex.name}
                />
                <ExerciseInstructions
                  exerciseId={ex.key}
                  instructionText={instructionText}
                  muscleGroup={ex.raw.exercises?.muscle_group}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );

  // ── Loading / not found ──
  if (loading) {
    return (
      <View style={[s.container, s.center]}>
        <ActivityIndicator size="large" color={CoachColors.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={s.container}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} onPress={() => router.push(ClientRoute.workouts)} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={[s.center, { flex: 1, paddingBottom: 100 }]}>
            <Ionicons name="fitness-outline" size={44} color={CoachColors.textFaint} />
            <Text style={s.notFoundTitle}>Session not found</Text>
            <Text style={s.notFoundSub}>This session may no longer be available.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────
  // LIVE MODE — active workout player
  // ─────────────────────────────────────────────────────────
  if (mode === 'live' && currentEx) {
    const lastTime = lastLoggedFor(currentEx.exerciseId);
    const lastTop = lastTime ? lastTime.sets.reduce((a, b) => (b.weight > a.weight ? b : a)) : null;
    const isLastExercise = exIdx + 1 >= exercises.length;
    const progressPct = exercises.length > 0 ? (completedCount / exercises.length) * 100 : 0;

    // Focus-card data — real fields only; blocks are omitted when absent.
    const equipment = currentEx.raw.exercises?.equipment as string | undefined;
    const difficulty = currentEx.raw.exercises?.difficulty as string | undefined;
    const imageUrl = currentEx.raw.exercises?.image_url as string | undefined;
    const bullets = toBullets(currentEx.raw.notes || currentEx.raw.exercises?.instructions);
    const instrExpanded = instrOpen[currentEx.key] || false;
    const shownBullets = instrExpanded ? bullets : bullets.slice(0, 3);

    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header — the workout is the headline */}
          <View style={s.liveHeader}>
            <View style={s.liveHeaderTopRow}>
              <Text style={s.liveEyebrow}>Active workout</Text>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
                style={s.allExBtn}
                onPress={() => { Haptics.selectionAsync(); setShowAllExercises(true); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="All exercises"
                accessibilityHint="Opens the full workout list"
              >
                <Ionicons name="list-outline" size={14} color={CoachColors.textSecondary} />
                <Text style={s.allExBtnText}>All exercises</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.liveWorkoutName} numberOfLines={2} accessibilityRole="header">
              {session.name || 'Workout'}
            </Text>
            <View style={s.liveMetaRow}>
              <Text style={s.liveClock} accessibilityLabel={`Elapsed ${fmtClock(elapsed)}`}>{fmtClock(elapsed)}</Text>
              <Text style={s.liveMetaDot}>·</Text>
              <Text style={s.liveExCount}>Exercise {exIdx + 1} of {exercises.length}</Text>
            </View>
            <View
              style={s.progressTrack}
              accessible={true}
              accessibilityLabel={`${completedCount} of ${exercises.length} exercises completed`}
            >
              <View style={[s.progressFill, { width: `${progressPct}%` }]} />
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Exercise focus card — one exercise front and center */}
              <Animated.View
                key={currentEx.key}
                entering={reducedMotion ? undefined : (navDirRef.current > 0 ? SlideInRight : SlideInLeft).duration(220)}
                style={s.focusCard}
              >
                {/* Card header */}
                <Text style={s.focusName} accessibilityRole="header">{currentEx.name}</Text>
                <Text style={s.focusTarget}>
                  {currentEx.sets} sets · {currentEx.reps} reps · {currentEx.restSec}s rest
                </Text>
                {(equipment || difficulty) && (
                  <View style={s.tagRow}>
                    {equipment ? (
                      <View style={s.tag}><Text style={s.tagText}>{cap(equipment)}</Text></View>
                    ) : null}
                    {difficulty ? (
                      <View style={s.tag}><Text style={s.tagText}>{cap(difficulty)}</Text></View>
                    ) : null}
                  </View>
                )}

                {/* Anatomy map — which muscles this exercise hits, from real data */}
                {(muscleTargets.primary.length > 0 || muscleTargets.secondary.length > 0) && (
                  <View
                    style={{ alignItems: 'center', marginVertical: 6 }}
                    accessible
                    accessibilityLabel={`Targets ${muscleTargets.primary.join(', ') || 'supporting muscles'}${muscleTargets.secondary.length ? `, also ${muscleTargets.secondary.join(', ')}` : ''}`}
                  >
                    <MuscleMap
                      primary={muscleTargets.primary}
                      secondary={muscleTargets.secondary}
                      view="both"
                      height={170}
                    />
                  </View>
                )}

                {/* Exercise visual — real image only, omitted entirely when absent */}
                {imageUrl ? (
                  <Image
                    source={{ uri: proxyGifUrl(imageUrl) || imageUrl }}
                    style={s.focusImage}
                    contentFit="cover"
                    accessible={false}
                  />
                ) : null}

                {/* Real instructions as bullets, capped with More */}
                {bullets.length > 0 && (
                  <View style={s.instrBlock}>
                    {shownBullets.map((line, i) => (
                      <View key={i} style={s.instrLine}>
                        <View style={s.instrDot} />
                        <Text style={s.instrText}>{line}</Text>
                      </View>
                    ))}
                    {bullets.length > 3 && (
                      <TouchableOpacity
                        onPress={() => toggleInstructions(currentEx.key)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={instrExpanded ? 'Show fewer instructions' : 'Show more instructions'}
                        accessibilityState={{ expanded: instrExpanded }}
                      >
                        <Text style={s.instrMore}>{instrExpanded ? 'Less' : 'More'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Last time — only when real history exists */}
                {lastTop && (
                  <View style={s.lastTimeCard}>
                    <Ionicons name="time-outline" size={16} color={CoachColors.textMuted} />
                    <Text style={s.lastTimeText}>
                      Last time:{' '}
                      <Text style={s.lastTimeStrong}>
                        {lastTime!.sets.length}×{lastTop.reps} at {fmtKg(lastTop.weight)} kg
                      </Text>
                      {lastTop.feel ? `, and ${FEEL_PHRASE[lastTop.feel]}.` : '.'}
                    </Text>
                  </View>
                )}

                {/* Set logging — the existing two-beat flow, inside the card */}
                <View style={s.logBlock}>
                  {/* Suggestion chip — first set only, real history only, and it
                      hides once the input already holds the suggested number
                      (tapped, prefilled to a repeat, or typed by hand). */}
                  {curSetIdx === 0 && suggestion
                    && parseFloat(weightStr) !== suggestion.suggestedWeight && (
                    <TouchableOpacity hitSlop={{ top: 7, bottom: 7 }}
                      style={s.suggestChip}
                      onPress={applySuggestion}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Try ${fmtKg(suggestion.suggestedWeight)} kilograms, ${suggestion.basis}`}
                      accessibilityHint="Double tap to fill the weight"
                    >
                      <Text style={s.suggestChipText}>
                        Try {fmtKg(suggestion.suggestedWeight)} kg — {suggestion.basis}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <View style={s.activeTopRow}>
                    <View style={s.activeBadge}><Text style={s.activeBadgeText}>{curSetIdx + 1}</Text></View>
                    <View style={s.numbersRow}>
                      <TextInput
                        style={s.numberInput}
                        value={weightStr}
                        onChangeText={setWeightStr}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={CoachColors.textFaint}
                        selectTextOnFocus
                        accessibilityLabel="Weight in kilograms"
                      />
                      <Text style={s.numberUnit}>kg</Text>
                      <Text style={s.numberTimes}>×</Text>
                      <TextInput
                        style={s.numberInput}
                        value={repsStr}
                        onChangeText={setRepsStr}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={CoachColors.textFaint}
                        selectTextOnFocus
                        accessibilityLabel="Repetitions"
                      />
                      <Text style={s.numberUnit}>reps</Text>
                    </View>
                  </View>

                  <View style={s.stepRow}>
                    <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }} style={s.stepBtn} onPress={() => bumpWeight(-2.5)} accessibilityRole="button" accessibilityLabel="Minus 2.5 kilograms">
                      <Text style={s.stepBtnText}>−2.5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }} style={s.stepBtn} onPress={() => bumpWeight(2.5)} accessibilityRole="button" accessibilityLabel="Plus 2.5 kilograms">
                      <Text style={s.stepBtnText}>+2.5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }} style={s.stepBtn} onPress={() => bumpReps(-1)} accessibilityRole="button" accessibilityLabel="Minus one rep">
                      <Text style={s.stepBtnText}>−1 rep</Text>
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={{ top: 3, bottom: 3 }} style={s.stepBtn} onPress={() => bumpReps(1)} accessibilityRole="button" accessibilityLabel="Plus one rep">
                      <Text style={s.stepBtnText}>+1 rep</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.feelBlock}>
                    <Text style={s.feelPrompt}>How did that feel?</Text>
                    <View style={s.feelRow}>
                      {FEELS.map(f => {
                        const active = feel === f.key;
                        return (
                          <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                            key={f.key}
                            style={[s.feelChip, active && s.feelChipActive]}
                            onPress={() => pickFeel(f.key)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`Felt ${f.label.toLowerCase()}`}
                          >
                            <Text style={[s.feelChipText, active && s.feelChipTextActive]}>{f.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Log CTA + rest timer, part of the input group */}
                  <View style={s.logCtaRow}>
                    <View
                      style={s.restBubble}
                      accessible={true}
                      accessibilityLabel={restLeft != null && restLeft > 0 ? `Rest, ${fmtClock(restLeft)} remaining` : `Rest, ${fmtClock(currentEx.restSec)} between sets`}
                    >
                      <Text style={s.restTime}>
                        {restLeft != null && restLeft > 0 ? fmtClock(restLeft) : fmtClock(currentEx.restSec)}
                      </Text>
                      <Text style={s.restLabel}>REST</Text>
                    </View>
                    <TouchableOpacity
                      style={[s.logBtn, finishing && { opacity: 0.6 }]}
                      onPress={logSet}
                      activeOpacity={0.85}
                      disabled={finishing}
                      accessibilityRole="button"
                      accessibilityLabel={`Log set ${curSetIdx + 1}`}
                    >
                      <Text style={s.logBtnText}>
                        {finishing ? 'Saving…' : `Log set ${curSetIdx + 1}`}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Logged sets for this exercise */}
                {doneSetsForCurrent.length > 0 && (
                  <View style={s.doneList}>
                    {doneSetsForCurrent.map((set) => (
                      <View
                        key={set.setIndex}
                        style={s.doneSetRow}
                        accessible={true}
                        accessibilityLabel={`Set ${set.setIndex + 1} done, ${fmtKg(set.weight)} kilograms for ${set.reps}${set.feel ? `, felt ${FEELS.find(f => f.key === set.feel)?.label.toLowerCase()}` : ''}`}
                      >
                        <View style={s.doneSetBadge}><Text style={s.doneSetBadgeText}>{set.setIndex + 1}</Text></View>
                        <Text style={s.doneSetText}>{fmtKg(set.weight)} kg × {set.reps}</Text>
                        {set.feel && (
                          <Text style={s.doneSetFeel}>{FEELS.find(f => f.key === set.feel)?.label}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </Animated.View>
            </ScrollView>

            {/* Exercise rail — jump anywhere, real per-exercise set counts */}
            <View style={s.railWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.railContent}>
                {exercises.map((ex, i) => {
                  const done = setsDoneFor(ex.exerciseId);
                  const isDone = done >= ex.sets;
                  const isCurrent = i === exIdx;
                  return (
                    <TouchableOpacity hitSlop={{ top: 7, bottom: 7 }}
                      key={ex.key}
                      style={[s.railPill, isDone && s.railPillDone, isCurrent && s.railPillCurrent]}
                      onPress={() => goToExercise(i)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Exercise ${i + 1}, ${ex.name}, ${done} of ${ex.sets} sets logged`}
                      accessibilityState={{ selected: isCurrent }}
                      accessibilityHint={isCurrent ? undefined : 'Double tap to jump to this exercise'}
                    >
                      <Text style={[s.railNum, isDone && s.railNumDone, isCurrent && s.railNumCurrent]}>{i + 1}</Text>
                      <Text style={[s.railCount, isCurrent && s.railCountCurrent]}>{done}/{ex.sets}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Prev / Next */}
            <View style={[s.navBar, { paddingBottom: insets.bottom + 70 }]}>
              <TouchableOpacity
                style={[s.prevBtn, exIdx === 0 && s.prevBtnDisabled]}
                onPress={() => goToExercise(exIdx - 1)}
                activeOpacity={0.8}
                disabled={exIdx === 0}
                accessibilityRole="button"
                accessibilityLabel="Previous exercise"
                accessibilityState={{ disabled: exIdx === 0 }}
              >
                <Ionicons name="chevron-back" size={16} color={exIdx === 0 ? CoachColors.textFaint : CoachColors.textPrimary} />
                <Text style={[s.prevBtnText, exIdx === 0 && s.prevBtnTextDisabled]}>Prev</Text>
              </TouchableOpacity>
              {isLastExercise ? (
                <TouchableOpacity
                  style={[s.nextBtn, finishing && { opacity: 0.6 }]}
                  onPress={onFinishPress}
                  activeOpacity={0.85}
                  disabled={finishing}
                  accessibilityRole="button"
                  accessibilityLabel="Finish session"
                >
                  <Text style={s.nextBtnText}>{finishing ? 'Saving…' : 'Finish session'}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={s.nextBtn}
                  onPress={() => goToExercise(exIdx + 1)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Next exercise"
                >
                  <Text style={s.nextBtnText}>Next</Text>
                  <Ionicons name="chevron-forward" size={16} color={CoachColors.onAccent} />
                </TouchableOpacity>
              )}
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>

        {/* All exercises — whole workout at a glance; closing is the only exit,
            no navigation happens while this native Modal is visible. */}
        <Modal
          visible={showAllExercises}
          animationType={reducedMotion ? 'none' : 'slide'}
          onRequestClose={() => setShowAllExercises(false)}
        >
          <View style={s.container}>
            <SafeAreaView style={{ flex: 1 }} edges={['top']}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle} accessibilityRole="header">All exercises</Text>
                <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }}
                  onPress={() => setShowAllExercises(false)}
                  style={s.modalClose}
                  accessibilityRole="button"
                  accessibilityLabel="Close all exercises"
                >
                  <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
                </TouchableOpacity>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled"
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
              >
                {renderExerciseList()}
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>

        {/* 22c — PR payoff overlay */}
        {showPr && prHit && prOverlayData && (
          <PRCelebration
            exerciseName={prHit.exerciseName}
            weight={prHit.weight}
            reps={prHit.reps}
            setsCount={prHit.setsCount}
            priorBest={prHit.priorBest}
            gainSinceFirst={prOverlayData.gainSinceFirst}
            weeklyBests={prOverlayData.weeklyBests}
            coachName={prOverlayData.coachName}
            defaultMessage={prOverlayData.defaultMessage}
            canSend={!!conversation}
            onSend={sendPrToCoach}
            squad={
              enrollment?.status === 'active' && enrollment?.plan_id && clientData?.id
                ? {
                    planId: enrollment.plan_id,
                    clientId: clientData.id,
                    firstName: (clientData.name || '').split(' ')[0] || 'Someone',
                  }
                : null
            }
            onDone={() => {
              setShowPr(false);
              router.push(ClientRoute.workouts);
            }}
          />
        )}
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────
  // OVERVIEW MODE
  // ─────────────────────────────────────────────────────────
  const instructorName = session.trainers?.name || 'Your coach';
  const overviewMetaParts = [
    `${exercises.length} ${exercises.length === 1 ? 'exercise' : 'exercises'}`,
    ...(totalSets > 0 ? [`${totalSets} sets`] : []),
    ...(estMinutes != null ? [`Est. ${estMinutes} min`] : []),
    `from ${instructorName}`,
  ];

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} onPress={() => router.push(ClientRoute.workouts)} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back to workouts">
          <Ionicons name="chevron-back" size={26} color={CoachColors.textPrimary} />
        </TouchableOpacity>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={s.overviewEyebrow}>Strength session</Text>
          <Text style={s.overviewTitle} accessibilityRole="header">{session.name || 'Workout'}</Text>
          <Text style={s.overviewMeta}>{overviewMetaParts.join(' · ')}</Text>
          {session.description ? <Text style={s.overviewDesc}>{session.description}</Text> : null}

          {/* Targets — whole-workout muscle aggregate, real data only */}
          {workoutMuscles.rows.length > 0 && (
            <View
              style={s.targetsCard}
              accessible
              accessibilityLabel={`Targets ${workoutMuscles.rows.slice(0, 7).map(r => regionLabel(r.id)).join(', ')}`}
            >
              <MuscleMap
                view="both"
                height={150}
                primary={workoutMuscles.primary}
                secondary={workoutMuscles.secondary}
              />
              <View style={s.targetsList}>
                {workoutMuscles.rows.slice(0, 7).map(row => (
                  <View key={row.id} style={s.targetRow}>
                    <View style={[s.targetDot, !row.isPrimary && s.targetDotSecondary]} />
                    <Text style={s.targetRowText} numberOfLines={1}>
                      {regionLabel(row.id)} · {row.count} exercise{row.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ marginTop: 22 }}>
            {renderExerciseList()}
          </View>
        </ScrollView>

        <View style={[s.overviewFooter, { paddingBottom: insets.bottom + 70 }]}>
          <TouchableOpacity
            style={[s.startBtn, exercises.length === 0 && { opacity: 0.5 }]}
            onPress={startLive}
            activeOpacity={0.85}
            disabled={exercises.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Start session"
          >
            <Text style={s.startBtnText}>Start session</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  backBtn: { paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },

  notFoundTitle: {
    fontFamily: CoachFonts.headingSemiBold, fontSize: 18,
    color: CoachColors.textPrimary, marginTop: 16,
  },
  notFoundSub: {
    fontFamily: CoachFonts.body, fontSize: 14,
    color: CoachColors.textMuted, marginTop: 8,
  },

  // ── Overview ──
  overviewEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.accent,
    letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8,
  },
  overviewTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 27, color: CoachColors.textPrimary,
    lineHeight: 33, marginTop: 8,
  },
  overviewMeta: {
    fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textMuted, marginTop: 8,
  },
  overviewDesc: {
    fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textSecondary,
    lineHeight: 21, marginTop: 14,
  },
  targetsCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, padding: 15, marginTop: 18,
  },
  targetsList: { flex: 1, gap: 8 },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: CoachColors.accent },
  targetDotSecondary: { backgroundColor: CoachColors.accentSoft },
  targetRowText: {
    flex: 1, fontFamily: CoachFonts.bodyMedium, fontSize: 12.5,
    color: CoachColors.textSecondary,
  },
  exCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, overflow: 'hidden',
  },
  exRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 15,
  },
  exName: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14.5, color: CoachColors.textPrimary },
  exMeta: { fontFamily: CoachFonts.body, fontSize: 12, color: CoachColors.textMuted, marginTop: 3 },
  exExpanded: { paddingHorizontal: 15, paddingBottom: 15 },
  overviewFooter: {
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: '#1E211D',
  },
  startBtn: {
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 16, alignItems: 'center',
  },
  startBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },

  // ── Live header ──
  liveHeader: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: '#1E211D',
  },
  liveHeaderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveEyebrow: {
    fontFamily: CoachFonts.bodyBold, fontSize: 11, color: CoachColors.accent,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  allExBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 999,
    paddingVertical: 6, paddingHorizontal: 11,
  },
  allExBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.textSecondary },
  liveWorkoutName: {
    fontFamily: CoachFonts.headingBold, fontSize: 24, lineHeight: 29,
    color: CoachColors.textPrimary, marginTop: 7,
  },
  liveMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  liveClock: { fontFamily: CoachFonts.headingBold, fontSize: 14, color: CoachColors.accent },
  liveMetaDot: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textFaint },
  liveExCount: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  progressTrack: {
    height: 3, borderRadius: 999, backgroundColor: CoachColors.borderMuted,
    marginTop: 12, overflow: 'hidden',
  },
  progressFill: { height: 3, borderRadius: 999, backgroundColor: CoachColors.accent },

  // ── Focus card ──
  focusCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 18, padding: 16,
  },
  focusName: {
    fontFamily: CoachFonts.headingBold, fontSize: 21, lineHeight: 26,
    color: CoachColors.textPrimary,
  },
  focusTarget: {
    fontFamily: CoachFonts.bodyMedium, fontSize: 13, color: CoachColors.textSecondary,
    marginTop: 5,
  },
  tagRow: { flexDirection: 'row', gap: 7, marginTop: 10, flexWrap: 'wrap' },
  tag: {
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  tagText: { fontFamily: CoachFonts.bodyMedium, fontSize: 11.5, color: CoachColors.textSecondary },
  focusImage: {
    width: '100%', height: 180, borderRadius: 14, marginTop: 14,
    backgroundColor: CoachColors.bg,
  },
  instrBlock: { marginTop: 14, gap: 7 },
  instrLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  instrDot: {
    width: 5, height: 5, borderRadius: 3, backgroundColor: CoachColors.accent,
    marginTop: 7,
  },
  instrText: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 13, lineHeight: 19,
    color: CoachColors.textSecondary,
  },
  instrMore: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: CoachColors.accent,
    paddingVertical: 4,
  },

  // ── Last time ──
  lastTimeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15,
    marginTop: 14,
  },
  lastTimeText: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 12.5,
    color: CoachColors.textSecondary, lineHeight: 18,
  },
  lastTimeStrong: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.textPrimary },

  // ── Set logging (inside the focus card) ──
  logBlock: {
    backgroundColor: '#1E211D',
    borderWidth: 1.5, borderColor: CoachColors.accent,
    borderRadius: 16, padding: 15, marginTop: 14,
  },
  activeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  suggestChip: {
    alignSelf: 'flex-start',
    backgroundColor: CoachColors.accentSofter,
    borderWidth: 1, borderColor: 'rgba(198,242,78,0.35)',
    borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12,
    marginBottom: 12,
  },
  suggestChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12, color: CoachColors.accent },
  activeBadge: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: CoachColors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  activeBadgeText: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.onAccent },
  numbersRow: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' },
  numberInput: {
    fontFamily: CoachFonts.headingBold, fontSize: 23, color: CoachColors.textPrimary,
    minWidth: 52, paddingVertical: 2, paddingHorizontal: 4, textAlign: 'center',
    borderBottomWidth: 1, borderBottomColor: '#33382F',
  },
  numberUnit: { fontFamily: CoachFonts.body, fontSize: 12.5, color: CoachColors.textMuted },
  numberTimes: { fontFamily: CoachFonts.body, fontSize: 13, color: '#4E5449', marginHorizontal: 4 },
  stepRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  stepBtn: {
    flex: 1, borderWidth: 1, borderColor: '#33382F', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  stepBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 12.5, color: '#C9CEC2' },
  feelBlock: {
    borderTopWidth: 1, borderTopColor: '#2E322B', marginTop: 14, paddingTop: 13,
  },
  feelPrompt: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted },
  feelRow: { flexDirection: 'row', gap: 7, marginTop: 10 },
  feelChip: {
    flex: 1, borderWidth: 1, borderColor: '#33382F', borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  feelChipActive: {
    borderWidth: 1.5, borderColor: CoachColors.accent,
    backgroundColor: 'rgba(198,242,78,0.1)',
  },
  feelChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textFaint },
  feelChipTextActive: { fontFamily: CoachFonts.bodyBold, color: CoachColors.accent },
  logCtaRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 14 },
  restBubble: {
    minWidth: 52, minHeight: 52, borderRadius: 26,
    borderWidth: 1, borderColor: '#2E322B',
    alignItems: 'center', justifyContent: 'center',
  },
  restTime: { fontFamily: CoachFonts.headingBold, fontSize: 13, color: '#C9CEC2' },
  restLabel: { fontFamily: CoachFonts.body, fontSize: 8, color: CoachColors.textFaint, letterSpacing: 0.6 },
  logBtn: {
    flex: 1, backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 16, alignItems: 'center',
  },
  logBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },

  // ── Done sets ──
  doneList: { gap: 8, marginTop: 14 },
  doneSetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: CoachColors.bg,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15,
  },
  doneSetBadge: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  doneSetBadgeText: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.accent },
  doneSetText: { flex: 1, fontFamily: CoachFonts.bodySemiBold, fontSize: 15, color: CoachColors.textPrimary },
  doneSetFeel: { fontFamily: CoachFonts.bodyMedium, fontSize: 12, color: CoachColors.textMuted },

  // ── Exercise rail ──
  railWrap: {
    borderTopWidth: 1, borderTopColor: '#1E211D', paddingTop: 10,
  },
  railContent: { paddingHorizontal: 20, gap: 7 },
  railPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: CoachColors.borderMuted, borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 12,
    backgroundColor: CoachColors.surface,
  },
  railPillDone: {
    borderColor: 'rgba(198,242,78,0.35)',
    backgroundColor: CoachColors.accentSofter,
  },
  railPillCurrent: {
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.accent,
  },
  railNum: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textSecondary },
  railNumDone: { color: CoachColors.accent },
  railNumCurrent: { color: CoachColors.onAccent },
  railCount: { fontFamily: CoachFonts.bodyMedium, fontSize: 11, color: CoachColors.textFaint },
  railCountCurrent: { color: CoachColors.onAccent },

  // ── Prev / Next ──
  navBar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 20, paddingTop: 11, paddingBottom: 30,
  },
  prevBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    borderWidth: 1, borderColor: CoachColors.border, borderRadius: 999,
    paddingVertical: 15, paddingHorizontal: 22,
    backgroundColor: CoachColors.surface,
  },
  prevBtnDisabled: { opacity: 0.45 },
  prevBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, color: CoachColors.textPrimary },
  prevBtnTextDisabled: { color: CoachColors.textFaint },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    backgroundColor: CoachColors.accent, borderRadius: 999,
    paddingVertical: 16,
  },
  nextBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15, color: CoachColors.onAccent },

  // ── All exercises modal ──
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  modalTitle: { fontFamily: CoachFonts.headingBold, fontSize: 19, color: CoachColors.textPrimary },
  modalClose: { padding: 6 },
});
