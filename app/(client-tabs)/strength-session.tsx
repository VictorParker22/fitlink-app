import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Platform,
  LayoutAnimation, UIManager, ActivityIndicator, TextInput, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import { ClientRoute } from '../../types/routes';
import { supabase } from '../../lib/supabase';
import { useWorkout, StrengthSetLog, SetFeel, WorkoutHistoryEntry } from '../../context/WorkoutContext';
import { useClient } from '../../context/ClientContext';
import PRCelebration, { WeeklyBest } from '../../components/client-tabs/PRCelebration';
import ExerciseMediaDemo from '../../components/shared/exercise/ExerciseMediaDemo';
import ExerciseInstructions from '../../components/shared/exercise/ExerciseInstructions';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Athlete in-session experience (design turn 22b + 22c).
 *
 * 22b — logging a set is two beats: the number (prefilled from real history,
 * big touch targets), then how it felt. The feel is stored on the set, not
 * decorative: it rides into fitlink_workout_history (WorkoutContext) and into
 * the existing client_workout_logs JSONB on the server.
 *
 * 22c — a genuine PR (top weight beats this athlete's real prior best for the
 * exercise) triggers the in-screen celebration overlay, and the PR can go
 * somewhere: an editable message into the coach conversation.
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

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtKg(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

export default function StrengthSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const { workoutHistory, recordStrengthWorkout } = useWorkout();
  const { clientData, trainer, conversation, enrollment, exercisePrs, logExerciseSet, checkAndUpdatePr } = useClient();

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
  const startedAtRef = useRef(0);
  const finishedRef = useRef(false);

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

  const currentEx = exercises[exIdx] ?? null;
  const doneSetsForCurrent = currentEx ? logged.filter(s => s.exerciseId === currentEx.exerciseId) : [];
  const curSetIdx = doneSetsForCurrent.length;

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
    setLogged([]);
    setExIdx(0);
    setElapsed(0);
    setRestLeft(null);
    setPrHit(null);
    setFeel(null);
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
      if (error && __DEV__) console.warn('[StrengthSession] Log save skipped:', error.message);
    }

    setFinishing(false);
    if (bestPr) {
      setShowPr(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push(ClientRoute.workouts);
    }
  }, [session, clientData, recordStrengthWorkout, checkAndUpdatePr, router]);

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
      setRestLeft(currentEx.restSec);
      setExIdx(exIdx + 1);
      prefillFor(exercises[exIdx + 1]);
    } else {
      finishSession(nextLogged, nextPr);
    }
  };

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
          <TouchableOpacity onPress={() => router.push(ClientRoute.workouts)} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
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
  // LIVE MODE — 22b
  // ─────────────────────────────────────────────────────────
  if (mode === 'live' && currentEx) {
    const lastTime = lastLoggedFor(currentEx.exerciseId);
    const lastTop = lastTime ? lastTime.sets.reduce((a, b) => (b.weight > a.weight ? b : a)) : null;
    const upcoming = Array.from({ length: Math.max(0, currentEx.sets - curSetIdx - 1) });

    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" />
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header */}
          <View style={s.liveHeader}>
            <View style={s.liveHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.liveEyebrow}>Exercise {exIdx + 1} of {exercises.length}</Text>
                <Text style={s.liveTitle} numberOfLines={1}>{currentEx.name}</Text>
              </View>
              <Text style={s.liveClock}>{fmtClock(elapsed)}</Text>
            </View>
            <View style={s.progressRow}>
              {exercises.map((ex, i) => (
                <View key={ex.key} style={[s.progressSeg, i <= exIdx && s.progressSegDone]} />
              ))}
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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
                    {lastTop.feel === 'easy' ? ' Room for +2.5 today?' : ''}
                  </Text>
                </View>
              )}

              {/* Done sets */}
              <View style={{ gap: 8, marginTop: lastTop ? 14 : 0 }}>
                {doneSetsForCurrent.map((set) => (
                  <View key={set.setIndex} style={s.doneSetRow}>
                    <View style={s.doneSetBadge}><Text style={s.doneSetBadgeText}>{set.setIndex + 1}</Text></View>
                    <Text style={s.doneSetText}>{fmtKg(set.weight)} kg × {set.reps}</Text>
                    {set.feel && (
                      <Text style={s.doneSetFeel}>{FEELS.find(f => f.key === set.feel)?.label}</Text>
                    )}
                  </View>
                ))}

                {/* Active set card */}
                <View style={s.activeCard}>
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
                    <TouchableOpacity style={s.stepBtn} onPress={() => bumpWeight(-2.5)} accessibilityRole="button" accessibilityLabel="Minus 2.5 kilograms">
                      <Text style={s.stepBtnText}>−2.5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.stepBtn} onPress={() => bumpWeight(2.5)} accessibilityRole="button" accessibilityLabel="Plus 2.5 kilograms">
                      <Text style={s.stepBtnText}>+2.5</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.stepBtn} onPress={() => bumpReps(-1)} accessibilityRole="button" accessibilityLabel="Minus one rep">
                      <Text style={s.stepBtnText}>−1 rep</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.stepBtn} onPress={() => bumpReps(1)} accessibilityRole="button" accessibilityLabel="Plus one rep">
                      <Text style={s.stepBtnText}>+1 rep</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.feelBlock}>
                    <Text style={s.feelPrompt}>How did that feel?</Text>
                    <View style={s.feelRow}>
                      {FEELS.map(f => {
                        const active = feel === f.key;
                        return (
                          <TouchableOpacity
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
                </View>

                {/* Upcoming sets */}
                {upcoming.map((_, i) => (
                  <View key={`up-${i}`} style={s.upcomingSetRow}>
                    <View style={s.upcomingBadge}><Text style={s.upcomingBadgeText}>{curSetIdx + 2 + i}</Text></View>
                    <Text style={s.upcomingText}>
                      {weightStr ? `${weightStr} kg × ${currentEx.reps}` : `${currentEx.reps} reps`}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* CTA bar */}
            <View style={s.ctaBar}>
              <View style={s.restBubble}>
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
          </KeyboardAvoidingView>
        </SafeAreaView>

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
  const estMin = Math.max(15, exercises.length * 10);

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <TouchableOpacity onPress={() => router.push(ClientRoute.workouts)} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back to workouts">
          <Ionicons name="chevron-back" size={26} color={CoachColors.textPrimary} />
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <Text style={s.overviewEyebrow}>Strength session</Text>
          <Text style={s.overviewTitle} accessibilityRole="header">{session.name || 'Workout'}</Text>
          <Text style={s.overviewMeta}>
            {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} · ~{estMin} min · from {instructorName}
          </Text>
          {session.description ? <Text style={s.overviewDesc}>{session.description}</Text> : null}

          <View style={{ gap: 8, marginTop: 22 }}>
            {exercises.map((ex) => {
              const open = expandedExercises[ex.key] || false;
              const last = lastLoggedFor(ex.exerciseId);
              const lastTop = last ? last.sets.reduce((a, b) => (b.weight > a.weight ? b : a)) : null;
              const instructionText = ex.raw.notes || ex.raw.exercises?.instructions;
              return (
                <View key={ex.key} style={s.exCard}>
                  <TouchableOpacity style={s.exRow} activeOpacity={0.85} onPress={() => toggleExercise(ex.key)} accessibilityRole="button">
                    <View style={{ flex: 1 }}>
                      <Text style={s.exName}>{ex.name}</Text>
                      <Text style={s.exMeta}>
                        {ex.sets}×{ex.reps} · {ex.restSec}s rest
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
        </ScrollView>

        <View style={s.overviewFooter}>
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
  liveHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  liveEyebrow: { fontFamily: CoachFonts.body, fontSize: 11.5, color: CoachColors.textMuted },
  liveTitle: {
    fontFamily: CoachFonts.headingBold, fontSize: 20, color: CoachColors.textPrimary, marginTop: 2,
  },
  liveClock: { fontFamily: CoachFonts.headingBold, fontSize: 15, color: CoachColors.accent },
  progressRow: { flexDirection: 'row', gap: 4, marginTop: 13 },
  progressSeg: { flex: 1, height: 3, borderRadius: 999, backgroundColor: CoachColors.borderMuted },
  progressSegDone: { backgroundColor: CoachColors.accent },

  // ── Last time ──
  lastTimeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15,
  },
  lastTimeText: {
    flex: 1, fontFamily: CoachFonts.body, fontSize: 12.5,
    color: CoachColors.textSecondary, lineHeight: 18,
  },
  lastTimeStrong: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.textPrimary },

  // ── Done sets ──
  doneSetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: CoachColors.surface,
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

  // ── Active set ──
  activeCard: {
    backgroundColor: '#1E211D',
    borderWidth: 1.5, borderColor: CoachColors.accent,
    borderRadius: 16, padding: 15,
  },
  activeTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
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

  // ── Upcoming sets ──
  upcomingSetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    backgroundColor: '#141613',
    borderWidth: 1, borderColor: '#1E211D',
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 15,
  },
  upcomingBadge: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: '#1E211D',
    alignItems: 'center', justifyContent: 'center',
  },
  upcomingBadgeText: { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textFaint },
  upcomingText: { flex: 1, fontFamily: CoachFonts.body, fontSize: 14, color: CoachColors.textFaint },

  // ── CTA bar ──
  ctaBar: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    paddingHorizontal: 20, paddingTop: 13, paddingBottom: 30,
    borderTopWidth: 1, borderTopColor: '#1E211D',
  },
  restBubble: {
    width: 52, height: 52, borderRadius: 26,
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
});
