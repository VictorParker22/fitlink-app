/**
 * app/session/[id].tsx — Trainer Session Screen
 *
 * Supports two modes via ?mode URL param:
 *
 *  mode=detail (default when tapped from Schedule "Details"):
 *    Read-only Tonal-inspired view — client card, workout preview,
 *    coach notes, session stats, Book Follow-up CTA.
 *
 *  mode=track (active session tracking):
 *    Live exercise tracker — weight/reps inputs, set completion,
 *    elapsed timer, rest timer with audio cues.
 *    "Finish Session" → stores data in sessionCompletionCache → navigates
 *    to /session/complete.
 *    "✕" cancel → CancelSessionSheet (not a bare Alert).
 *
 * Design: fixed dark CoachColors palette, lime accent, W*factor responsive sizing.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, StatusBar, Dimensions, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, {
  FadeIn, FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import { useApp } from '../../context/AppContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import Avatar from '../../components/Avatar';
import { useRestChime } from '../../hooks/useRestChime';
import CancelSessionSheet from '../../components/sessions/CancelSessionSheet';
import { setCompletionData } from './sessionCompletionCache';
import { useReducedMotion } from '../../lib/useReducedMotion';

const { width: W } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetLog {
  weight: string;
  reps: string;
  completed: boolean;
}

interface ExerciseState {
  exerciseName: string;
  muscleGroup: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  sets: SetLog[];
  expanded: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const STATUS_CONFIG = {
  upcoming:  { label: 'Upcoming',  color: CoachColors.accent, bg: CoachColors.accentSoft  },
  completed: { label: 'Completed', color: CoachColors.accent, bg: CoachColors.accentSoft   },
  cancelled: { label: 'Cancelled', color: CoachColors.danger, bg: CoachColors.dangerSoft   },
} as const;

// ─── Root component ───────────────────────────────────────────────────────────

export default function TrainerSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; mode?: string }>();
  const sessionId = params.id;
  const mode = params.mode ?? 'track'; // 'detail' | 'track'

  const { sessions, updateSession, getClientById, clientWorkouts, workouts, getClientSessions } = useApp();

  const [session, setSession]                   = useState<any>(null);
  const [client,  setClient]                    = useState<any>(null);
  const [noWorkoutAssigned, setNoWorkoutAssigned] = useState(false);
  const [exerciseStates, setExerciseStates]     = useState<ExerciseState[]>([]);

  // ── Track-mode state ──
  const [elapsedSeconds, setElapsedSeconds]     = useState(0);
  const [showCancelSheet, setShowCancelSheet]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rest timer
  const { triggerRestCue, triggerCountdownTick } = useRestChime();
  const [restRemaining, setRestRemaining]       = useState<number | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Detail-mode state ──
  const [detailNotes, setDetailNotes]           = useState('');
  const [notesSaving, setNotesSaving]           = useState(false);
  const [notesSaved,  setNotesSaved]            = useState(false);

  // ─── Data init ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !sessions) return;
    const found = sessions.find(s => s.id === sessionId);
    if (!found) return;

    setSession(found);
    setDetailNotes(found.notes ?? '');

    if (found.client_id) {
      setClient(getClientById(found.client_id));
    }

    // Build exercise list from assigned workout
    const clientId = found.client_id;
    let workoutExercises: ExerciseState[] = [];
    if (clientId) {
      const assignedWorkouts = clientWorkouts
        .filter(cw => cw.client_id === clientId && cw.status === 'assigned')
        .sort((a, b) => new Date(b.assigned_date).getTime() - new Date(a.assigned_date).getTime());
      if (assignedWorkouts.length > 0) {
        const linked = workouts.find(w => w.id === assignedWorkouts[0].workout_id);
        if (linked?.workout_exercises?.length) {
          workoutExercises = linked.workout_exercises
            .sort((a, b) => a.order_index - b.order_index)
            .map((we, idx) => ({
              exerciseName: we.exercises?.name ?? 'Exercise',
              muscleGroup:  we.exercises?.muscle_group ?? we.exercises?.category ?? '',
              targetSets:   we.sets,
              targetReps:   we.reps,
              restSeconds:  we.rest_seconds,
              sets: Array.from({ length: we.sets }, () => ({
                weight: '', reps: String(we.reps), completed: false,
              })),
              expanded: idx === 0,
            }));
        }
      }
    }

    if (workoutExercises.length > 0) {
      setExerciseStates(workoutExercises);
      setNoWorkoutAssigned(false);
    } else {
      setExerciseStates([]);
      setNoWorkoutAssigned(true);
    }
  }, [sessionId, sessions, getClientById, clientWorkouts, workouts]);

  // ─── Elapsed timer (track mode only) ─────────────────────────────────────

  useEffect(() => {
    if (session && mode === 'track') {
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [session, mode]);

  // ─── Rest timer countdown ─────────────────────────────────────────────────

  useEffect(() => {
    if (restRemaining !== null && restRemaining > 0) {
      restTimerRef.current = setInterval(() => {
        setRestRemaining(prev => {
          if (prev === null || prev <= 1) {
            if (restTimerRef.current) clearInterval(restTimerRef.current);
            triggerRestCue();
            return null;
          }
          const next = prev - 1;
          if (next <= 3) triggerCountdownTick(next);
          return next;
        });
      }, 1000);
    }
    return () => { if (restTimerRef.current) clearInterval(restTimerRef.current); };
  }, [restRemaining, triggerRestCue, triggerCountdownTick]);

  // ─── Track-mode handlers ──────────────────────────────────────────────────

  const toggleExercise = useCallback((index: number) => {
    setExerciseStates(prev => prev.map((ex, i) => ({
      ...ex, expanded: i === index ? !ex.expanded : ex.expanded,
    })));
  }, []);

  const updateSetValue = useCallback((exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setExerciseStates(prev => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const newSets = [...ex.sets];
      newSets[setIdx] = { ...newSets[setIdx], [field]: value };
      return { ...ex, sets: newSets };
    }));
  }, []);

  const completeSet = useCallback((exIdx: number, setIdx: number) => {
    setExerciseStates(prev => {
      const updated = prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const newSets = [...ex.sets];
        newSets[setIdx] = { ...newSets[setIdx], completed: !newSets[setIdx].completed };
        return { ...ex, sets: newSets };
      });
      const set = updated[exIdx].sets[setIdx];
      if (set.completed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const restSecs = updated[exIdx].restSeconds || 60;
        setRestRemaining(restSecs);
        const allDone = updated[exIdx].sets.every(s => s.completed);
        if (allDone && exIdx < updated.length - 1) {
          updated[exIdx + 1] = { ...updated[exIdx + 1], expanded: true };
        }
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return updated;
    });
  }, []);

  /**
   * Finish session: store exercise data in cache → mark completed → go to complete screen.
   * The cache bridges large exercise data (too big for URL params) to complete.tsx.
   */
  const handleFinishSession = useCallback(async () => {
    if (!session) return;
    if (timerRef.current) clearInterval(timerRef.current);

    // Write exercise data to module-level cache before navigating
    setCompletionData({
      durationSeconds: elapsedSeconds,
      exercises: exerciseStates.map(ex => ({
        exerciseName: ex.exerciseName,
        muscleGroup:  ex.muscleGroup,
        targetSets:   ex.targetSets,
        targetReps:   ex.targetReps,
        sets:         ex.sets,
      })),
    });

    try {
      await updateSession(session.id, { status: 'completed' });
    } catch (e) {
      // Not fatal here: the recap screen retries the same write and now tells
      // the coach if it still fails, so we only need the breadcrumb.
      console.error('[Session] could not mark session completed, recap will retry:', e);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(`/session/complete?sessionId=${session.id}` as any);
  }, [session, elapsedSeconds, exerciseStates, updateSession, router]);

  /** Cancel from tracker — opens CancelSessionSheet instead of a bare Alert */
  const handleCancelTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCancelSheet(true);
  }, []);

  // ─── Detail-mode handlers ─────────────────────────────────────────────────

  const handleNotesSave = useCallback(async () => {
    if (!session || detailNotes === (session.notes ?? '')) return;
    setNotesSaving(true);
    try {
      await updateSession(session.id, { notes: detailNotes.trim() });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2500);
    } catch (e: any) {
      console.error('[Session] notes save failed:', e);
      Alert.alert('Notes not saved', e?.message || 'Your notes are still on screen. Tap out of the box again to retry.');
    }
    finally { setNotesSaving(false); }
  }, [session, detailNotes, updateSession]);

  const handleStartTracking = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Replace current detail view with the tracker
    router.replace(`/session/${sessionId}` as any);
  }, [router, sessionId]);

  const handleBookFollowUp = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (session) {
      router.push(`/book-session?client_id=${session.client_id ?? ''}&type=${encodeURIComponent(session.type)}` as any);
    }
  }, [router, session]);

  // ─── Loading state ────────────────────────────────────────────────────────

  if (!session) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={CoachColors.accent} />
      </View>
    );
  }

  // ─── Detail mode ──────────────────────────────────────────────────────────

  if (mode === 'detail') {
    return <DetailView
      session={session}
      client={client}
      exerciseStates={exerciseStates}
      noWorkoutAssigned={noWorkoutAssigned}
      detailNotes={detailNotes}
      setDetailNotes={setDetailNotes}
      notesSaving={notesSaving}
      notesSaved={notesSaved}
      onNotesSave={handleNotesSave}
      onStartTracking={handleStartTracking}
      onBookFollowUp={handleBookFollowUp}
      onBack={() => router.back()}
      getClientSessions={getClientSessions}
    />;
  }

  // ─── Track mode ───────────────────────────────────────────────────────────

  const totalSets     = exerciseStates.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exerciseStates.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0);
  const progress      = totalSets > 0 ? completedSets / totalSets : 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* ── Tracker Header ─────────────────────────────────────── */}
      <LinearGradient
        colors={[CoachColors.surface, CoachColors.surface]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.awHeader}
      >
        <View style={styles.awHeaderTop}>
          {/* Cancel button → sheet */}
          <TouchableOpacity
            onPress={handleCancelTap}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel session"
            style={styles.awCancelBtn}
          >
            <Ionicons name="close" size={20} color={CoachColors.textSecondary} />
          </TouchableOpacity>

          {/* Client name */}
          <View style={styles.awHeaderCenter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {client && <Avatar name={client.name} size="sm" imageUrl={client.avatar_url} />}
              <Text style={styles.awHeaderName} numberOfLines={1}>
                {client?.name ?? session.group_name ?? 'Session'}
              </Text>
            </View>
          </View>

          {/* Elapsed timer pill */}
          <View style={styles.awTimerPill}>
            <Ionicons name="radio-button-on" size={8} color={CoachColors.accent} />
            <Text style={styles.awTimerText}>{formatDuration(elapsedSeconds)}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.awProgressContainer}>
          <View style={styles.awProgressTrack}>
            <View style={[styles.awProgressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.awProgressLabel}>{completedSets}/{totalSets} sets</Text>
        </View>
      </LinearGradient>

      {/* ── Exercise List ───────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: W * 0.04, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {noWorkoutAssigned ? (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={44} color={CoachColors.textFaint} style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No workout assigned</Text>
            <Text style={styles.emptyBody}>
              Assign a workout from the Workouts tab to track exercises here.
            </Text>
          </View>
        ) : (
          <>
            {exerciseStates.map((exercise, exIdx) => {
              const completedInEx = exercise.sets.filter(s => s.completed).length;
              const allDone       = completedInEx === exercise.sets.length;

              return (
                <View key={exIdx} style={[styles.awExCard, allDone && styles.awExCardDone]}>
                  <TouchableOpacity
                    style={styles.awExHeader}
                    onPress={() => toggleExercise(exIdx)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: exercise.expanded }}
                  >
                    <View style={[styles.awExIdx, allDone && { backgroundColor: CoachColors.accentSoft }]}>
                      {allDone
                        ? <Ionicons name="checkmark" size={14} color={CoachColors.accent} />
                        : <Text style={styles.awExIdxText}>{exIdx + 1}</Text>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.awExName}>{exercise.exerciseName}</Text>
                      <Text style={styles.awExTarget}>{exercise.targetSets} × {exercise.targetReps} reps</Text>
                    </View>
                    <View style={[styles.awExProgressPill, allDone && styles.awExProgressPillDone]}>
                      <Text style={[styles.awExProgressText, allDone && { color: CoachColors.accent }]}>
                        {completedInEx}/{exercise.sets.length}
                      </Text>
                    </View>
                    <Ionicons
                      name={exercise.expanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={CoachColors.textFaint}
                    />
                  </TouchableOpacity>

                  {exercise.expanded && (
                    <View style={styles.awSetsContainer}>
                      {/* Column headers */}
                      <View style={styles.awSetHeaderRow}>
                        <Text style={[styles.awSetHeaderText, { width: 40 }]}>Set</Text>
                        <Text style={[styles.awSetHeaderText, { flex: 1 }]}>Weight</Text>
                        <Text style={[styles.awSetHeaderText, { flex: 1 }]}>Reps</Text>
                        <Text style={[styles.awSetHeaderText, { width: 50, textAlign: 'center' }]}>Done</Text>
                      </View>

                      {exercise.sets.map((set, setIdx) => (
                        <View key={setIdx} style={[styles.awSetRow, set.completed && styles.awSetRowDone]}>
                          <View style={styles.awSetNumContainer}>
                            <Text style={[styles.awSetNum, set.completed && { color: CoachColors.accent }]}>
                              {setIdx + 1}
                            </Text>
                          </View>
                          <View style={styles.awSetInputContainer}>
                            <TextInput
                              style={[styles.awSetInput, set.completed && styles.awSetInputDone]}
                              value={set.weight}
                              onChangeText={v => updateSetValue(exIdx, setIdx, 'weight', v)}
                              placeholder="0"
                              placeholderTextColor={CoachColors.textFaint}
                              keyboardType="numeric"
                              editable={!set.completed}
                              selectTextOnFocus
                              accessibilityLabel={`Weight for set ${setIdx + 1}`}
                            />
                            <Text style={styles.awSetUnit}>lbs</Text>
                          </View>
                          <View style={styles.awSetInputContainer}>
                            <TextInput
                              style={[styles.awSetInput, set.completed && styles.awSetInputDone]}
                              value={set.reps}
                              onChangeText={v => updateSetValue(exIdx, setIdx, 'reps', v)}
                              placeholder="0"
                              placeholderTextColor={CoachColors.textFaint}
                              keyboardType="numeric"
                              editable={!set.completed}
                              selectTextOnFocus
                              accessibilityLabel={`Reps for set ${setIdx + 1}`}
                            />
                          </View>
                          <TouchableOpacity hitSlop={2}
                            style={styles.awCheckBtn}
                            onPress={() => completeSet(exIdx, setIdx)}
                            activeOpacity={0.6}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: set.completed }}
                            accessibilityLabel={`Mark set ${setIdx + 1} ${set.completed ? 'incomplete' : 'complete'}`}
                          >
                            <Ionicons
                              name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                              size={26}
                              color={set.completed ? CoachColors.accent : CoachColors.textFaint}
                            />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}

            {/* ── Finish button ── */}
            <TouchableOpacity
              style={styles.awFinishBtn}
              onPress={handleFinishSession}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={progress >= 1 ? 'Finish session' : 'Finish session early'}
            >
              <LinearGradient
                colors={progress >= 1 ? [CoachColors.accent, CoachColors.accent] : [CoachColors.accent, CoachColors.accent]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.awFinishBtnGradient}
              >
                <Ionicons name={progress >= 1 ? 'trophy' : 'flag'} size={19} color={CoachColors.onAccent} />
                <Text style={styles.awFinishBtnText}>
                  {progress >= 1 ? 'Finish session' : 'Finish session'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: restRemaining !== null ? 100 : 48 }} />
      </ScrollView>

      {/* ── Floating Rest Timer Bar ──────────────────────────────── */}
      {restRemaining !== null && (
        <View style={styles.restBar}>
          <View style={styles.restBarInfo}>
            <Ionicons name="timer-outline" size={18} color={CoachColors.accent} />
            <Text style={styles.restBarLabel}>Rest timer</Text>
            <Text style={styles.restBarTime}>{formatTime(restRemaining)}</Text>
          </View>
          <TouchableOpacity hitSlop={{ top: 7, bottom: 7 }}
            style={styles.restBarSkip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRestRemaining(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip rest timer"
          >
            <Text style={styles.restBarSkipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Cancel Sheet (track mode) ────────────────────────────── */}
      <CancelSessionSheet
        visible={showCancelSheet}
        session={session}
        onDismiss={() => setShowCancelSheet(false)}
        onDone={() => {
          setShowCancelSheet(false);
          if (timerRef.current) clearInterval(timerRef.current);
          router.back();
        }}
      />
    </SafeAreaView>
  );
}

// ─── Detail View (read-only, Tonal-inspired) ──────────────────────────────────

interface DetailViewProps {
  session:           any;
  client:            any;
  exerciseStates:    ExerciseState[];
  noWorkoutAssigned: boolean;
  detailNotes:       string;
  setDetailNotes:    (v: string) => void;
  notesSaving:       boolean;
  notesSaved:        boolean;
  onNotesSave:       () => void;
  onStartTracking:   () => void;
  onBookFollowUp:    () => void;
  onBack:            () => void;
  getClientSessions: (id: string) => any[];
}

function DetailView({
  session, client, exerciseStates, noWorkoutAssigned,
  detailNotes, setDetailNotes, notesSaving, notesSaved,
  onNotesSave, onStartTracking, onBookFollowUp, onBack,
  getClientSessions,
}: DetailViewProps) {
  // Reduce Motion: the staggered slide-up entrance is decorative only —
  // drop it entirely and render the detail already in place.
  const reduceMotion = useReducedMotion();
  const statusCfg = STATUS_CONFIG[session.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.upcoming;
  const dateLabel = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
  const timeLabel = new Date(session.date).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });

  // Session history for this client
  const clientHistory = session.client_id ? getClientSessions(session.client_id) : [];
  const completedCount = clientHistory.filter((s: any) => s.status === 'completed').length;

  // Unique muscle groups from assigned workout
  const muscleGroups = [...new Set(
    exerciseStates
      .map(ex => ex.muscleGroup)
      .filter(Boolean)
      .flatMap(m => m.split(',').map(x => x.trim()))
  )].slice(0, 6);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[CoachColors.bg, CoachColors.surface, CoachColors.bg]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* The Observations field sits directly above the primary CTA — without
            this the keyboard covers both. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* ── Detail Header ── */}
          <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)} style={dt.headerRow}>
            <TouchableOpacity
              style={dt.backBtn}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={CoachColors.textSecondary} />
            </TouchableOpacity>
            <Text style={dt.headerTitle}>Session details</Text>
            <View style={[dt.statusPill, { backgroundColor: statusCfg.bg, borderColor: `${statusCfg.color}35` }]}>
              <Text style={[dt.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          </Animated.View>

          {/* ── Client Hero Card ── */}
          <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(60).duration(350)}>
            <LinearGradient
              colors={[CoachColors.surface, CoachColors.bg]}
              style={dt.heroCard}
            >
              <View style={dt.heroClientRow}>
                {client
                  ? <Avatar name={client.name} size="lg" imageUrl={client.avatar_url} />
                  : (
                    <View style={dt.groupIcon}>
                      <Ionicons name="people" size={26} color={CoachColors.accent} />
                    </View>
                  )
                }
                <View style={{ flex: 1 }}>
                  <Text style={dt.heroName}>
                    {client?.name ?? session.group_name ?? 'Group Session'}
                  </Text>
                  <Text style={dt.heroType}>{session.type}</Text>
                  {completedCount > 0 && (
                    <Text style={dt.heroHistory}>
                      {completedCount} session{completedCount !== 1 ? 's' : ''} completed together
                    </Text>
                  )}
                </View>
              </View>

              {/* Date / time / duration row */}
              <View style={dt.infoRow}>
                <View style={dt.infoItem}>
                  <Ionicons name="calendar-outline" size={14} color={CoachColors.textMuted} />
                  <Text style={dt.infoText}>{dateLabel}</Text>
                </View>
                <View style={dt.infoItem}>
                  <Ionicons name="time-outline" size={14} color={CoachColors.textMuted} />
                  <Text style={dt.infoText}>{timeLabel}</Text>
                </View>
                <View style={dt.infoItem}>
                  <Ionicons name="hourglass-outline" size={14} color={CoachColors.textMuted} />
                  <Text style={dt.infoText}>{session.duration} min</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ── Workout Plan ── */}
          <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(160).duration(350)} style={dt.card}>
            <Text style={dt.cardTag}>Planned workout</Text>
            <Text style={dt.cardTitle}>Exercise lineup</Text>

            {noWorkoutAssigned ? (
              <View style={dt.emptyWorkout}>
                <Ionicons name="barbell-outline" size={28} color={CoachColors.textFaint} />
                <Text style={dt.emptyWorkoutText}>No workout assigned to this client yet.</Text>
              </View>
            ) : (
              <>
                <View style={dt.exList}>
                  {exerciseStates.map((ex, i) => (
                    <View key={i} style={dt.exItem}>
                      <View style={dt.exNum}>
                        <Text style={dt.exNumText}>{i + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={dt.exName}>{ex.exerciseName}</Text>
                        <Text style={dt.exMeta}>{ex.targetSets} sets × {ex.targetReps} reps</Text>
                      </View>
                      {ex.restSeconds > 0 && (
                        <View style={dt.restChip}>
                          <Ionicons name="timer-outline" size={10} color={CoachColors.textMuted} />
                          <Text style={dt.restChipText}>{ex.restSeconds}s</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>

                {/* Muscle group chips */}
                {muscleGroups.length > 0 && (
                  <View style={dt.muscleChips}>
                    {muscleGroups.map((m, i) => (
                      <View key={i} style={dt.muscleChip}>
                        <Text style={dt.muscleChipText}>{m}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </Animated.View>

          {/* ── Coach Notes ── */}
          <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(240).duration(350)} style={dt.card}>
            <View style={dt.cardTitleRow}>
              <Text style={dt.cardTag}>Coach notes</Text>
              {notesSaved && (
                <View style={dt.savedPill}>
                  <Ionicons name="checkmark" size={10} color={CoachColors.accent} />
                  <Text style={dt.savedText}>Saved</Text>
                </View>
              )}
            </View>
            <Text style={dt.cardTitle}>Observations</Text>
            <TextInput
              style={dt.notesInput}
              value={detailNotes}
              onChangeText={setDetailNotes}
              onBlur={onNotesSave}
              placeholder="Record struggles, wins, and what to focus on next session…"
              placeholderTextColor={CoachColors.textFaint}
              multiline
              textAlignVertical="top"
              accessibilityLabel="Coach session notes"
            />
          </Animated.View>

          {/* ── Actions ── */}
          <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(320).duration(350)} style={dt.actionsCard}>
            {session.status === 'upcoming' && (
              <TouchableOpacity
                style={dt.primaryCTA}
                onPress={onStartTracking}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Start tracking this session"
              >
                <LinearGradient
                  colors={[CoachColors.accent, CoachColors.accent]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={dt.primaryCTAGradient}
                >
                  <Ionicons name="play-circle" size={20} color={CoachColors.onAccent} />
                  <Text style={dt.primaryCTAText}>Start tracking</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={dt.secondaryCTA}
              onPress={onBookFollowUp}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Book a follow-up session"
            >
              <Ionicons name="calendar-outline" size={17} color={CoachColors.accent} />
              <Text style={dt.secondaryCTAText}>
                {session.status === 'upcoming' ? 'Book another session' : 'Book follow-up session'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Tracker styles ─────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CoachColors.bg },

  // Header
  awHeader: {
    paddingHorizontal: W * 0.05,
    paddingBottom:     W * 0.04,
    paddingTop:        W * 0.02,
    borderBottomLeftRadius:  24,
    borderBottomRightRadius: 24,
  },
  awHeaderTop: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   W * 0.03,
  },
  awCancelBtn: {
    width:          40,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   12,
    backgroundColor:CoachColors.surface,
  },
  awHeaderCenter: { flex: 1, alignItems: 'center' },
  awHeaderName:   {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize:   W * 0.042,
    color:      CoachColors.textPrimary,
  },
  awTimerPill: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    backgroundColor:CoachColors.surface,
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderRadius:   20,
  },
  awTimerText: {
    fontFamily:  CoachFonts.bodyBold,
    fontSize:    W * 0.034,
    color:       CoachColors.accent,
    fontVariant: ['tabular-nums'],
  },

  // Progress bar
  awProgressContainer: { marginTop: W * 0.01 },
  awProgressTrack: {
    height:          5,
    backgroundColor: CoachColors.surface,
    borderRadius:    3,
    overflow:        'hidden',
    marginBottom:    6,
  },
  awProgressFill: {
    height:          '100%',
    backgroundColor: CoachColors.accent,
    borderRadius:    3,
  },
  awProgressLabel: {
    fontFamily:  CoachFonts.bodyMedium,
    fontSize:    W * 0.028,
    color:       CoachColors.textMuted,
    alignSelf:   'flex-end',
  },

  // Exercise cards
  awExCard: {
    backgroundColor: CoachColors.surface,
    borderRadius:    20,
    marginBottom:    10,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     CoachColors.borderMuted,
  },
  awExCardDone: {
    borderColor:     CoachColors.accent,
    backgroundColor: CoachColors.accentSofter,
  },
  awExHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       10,
    gap:           10,
    minHeight:     56,
  },
  awExIdx: {
    // minWidth/minHeight: holds the scalable exercise number.
    minWidth:       28,
    minHeight:      28,
    borderRadius:   14,
    backgroundColor:CoachColors.surface,
    alignItems:     'center',
    justifyContent: 'center',
  },
  awExIdxText:      { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.textMuted },
  awExName:         { fontFamily: CoachFonts.headingSemiBold, fontSize: W * 0.038, color: CoachColors.textPrimary, marginBottom: 2 },
  awExTarget:       { fontFamily: CoachFonts.bodyMedium, fontSize: W * 0.03, color: CoachColors.textMuted },
  awExProgressPill: {
    backgroundColor: CoachColors.surface,
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:    12,
  },
  awExProgressPillDone: { backgroundColor: CoachColors.accentSoft },
  awExProgressText: { fontFamily: CoachFonts.bodyBold, fontSize: W * 0.03, color: CoachColors.textMuted },

  // Sets
  awSetsContainer: { padding: 10, paddingTop: 0 },
  awSetHeaderRow:  {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  6,
    paddingHorizontal: 8,
  },
  awSetHeaderText: {
    fontFamily:    CoachFonts.bodyBold,
    fontSize:      10,
    color:         CoachColors.textFaint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  awSetRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: CoachColors.surface,
    borderRadius:    16,
    padding:         8,
    marginBottom:    8,
  },
  awSetRowDone:      { backgroundColor: CoachColors.accentSofter },
  awSetNumContainer: { width: 40, alignItems: 'center' },
  awSetNum: {
    fontFamily: CoachFonts.bodyBold,
    fontSize:   W * 0.035,
    color:      CoachColors.textMuted,
  },
  awSetInputContainer: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: CoachColors.surface,
    borderRadius:    12,
    marginHorizontal:4,
    paddingHorizontal:8,
  },
  awSetInput: {
    flex:       1,
    height:     40,
    fontFamily: CoachFonts.headingSemiBold,
    fontSize:   W * 0.04,
    color:      CoachColors.textPrimary,
    textAlign:  'center',
  },
  awSetInputDone: { color: CoachColors.textFaint },
  awSetUnit: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize:   W * 0.028,
    color:      CoachColors.textFaint,
    marginLeft: 4,
  },
  awCheckBtn: {
    width:          50,
    height:         40,
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Finish button
  awFinishBtn: {
    marginTop:    W * 0.04,
    marginBottom: W * 0.02,
    borderRadius: 999,
    overflow:     'hidden',
  },
  awFinishBtnGradient: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical:16,
    gap:            8,
    minHeight:      54,
  },
  awFinishBtnText: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      W * 0.044,
    color:         CoachColors.onAccent,
    letterSpacing: -0.2,
  },

  // Empty state
  emptyState: {
    alignItems:     'center',
    paddingVertical: W * 0.1,
    paddingHorizontal: W * 0.1,
  },
  emptyTitle: {
    fontFamily:  CoachFonts.headingSemiBold,
    fontSize:    W * 0.042,
    color:       CoachColors.textPrimary,
    marginBottom: 8,
    textAlign:   'center',
  },
  emptyBody: {
    fontFamily:  CoachFonts.body,
    fontSize:    W * 0.034,
    color:       CoachColors.textMuted,
    textAlign:   'center',
    lineHeight:  W * 0.05,
  },

  // Rest timer bar
  restBar: {
    position:  'absolute',
    bottom:    20,
    left:      W * 0.04,
    right:     W * 0.04,
    backgroundColor: CoachColors.bg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical:   12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius:  12,
    elevation: 10,
  },
  restBarInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restBarLabel: {
    fontFamily:    CoachFonts.bodyBold,
    fontSize:      W * 0.026,
    color:         CoachColors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  restBarTime: {
    fontFamily:  CoachFonts.headingBold,
    fontSize:    W * 0.046,
    color:       CoachColors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginLeft:  4,
  },
  restBarSkip: {
    backgroundColor:  CoachColors.surface,
    paddingHorizontal: 16,
    paddingVertical:   7,
    borderRadius:     14,
  },
  restBarSkipText: {
    fontFamily:    CoachFonts.bodyBold,
    fontSize:      W * 0.028,
    color:         CoachColors.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

// ── Detail view styles ─────────────────────────────────────────────────────
const dt = StyleSheet.create({
  headerRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: W * 0.05,
    paddingTop:     W * 0.04,
    paddingBottom:  W * 0.03,
    gap:            12,
  },
  backBtn: {
    width:          44,
    height:         44,
    alignItems:     'center',
    justifyContent: 'center',
    borderRadius:   14,
    backgroundColor:CoachColors.surface,
    flexShrink:     0,
  },
  headerTitle: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      W * 0.05,
    color:         CoachColors.textPrimary,
    letterSpacing: -0.5,
    flex:          1,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical:    5,
    borderRadius:   20,
    borderWidth:    1,
  },
  statusText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize:   W * 0.03,
  },

  // Hero card
  heroCard: {
    marginHorizontal: W * 0.04,
    borderRadius:     20,
    padding:          W * 0.05,
    borderWidth:      1,
    borderColor:      CoachColors.accentSoft,
    marginBottom:     W * 0.035,
  },
  heroClientRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    marginBottom:  W * 0.04,
  },
  groupIcon: {
    width:           52,
    height:          52,
    borderRadius:    16,
    backgroundColor: CoachColors.accentSoft,
    alignItems:      'center',
    justifyContent:  'center',
  },
  heroName: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      W * 0.052,
    color:         CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom:  3,
  },
  heroType: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize:   W * 0.034,
    color:      CoachColors.accent,
    marginBottom:3,
  },
  heroHistory: {
    fontFamily: CoachFonts.body,
    fontSize:   W * 0.03,
    color:      CoachColors.textMuted,
  },
  infoRow: {
    flexDirection: 'row',
    gap:           W * 0.04,
    flexWrap:      'wrap',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  infoText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize:   W * 0.031,
    color:      CoachColors.textSecondary,
  },

  // Card
  card: {
    marginHorizontal: W * 0.04,
    marginBottom:     W * 0.035,
    backgroundColor:  CoachColors.surface,
    borderRadius:     18,
    borderWidth:      1,
    borderColor:      CoachColors.borderMuted,
    padding:          W * 0.05,
  },
  cardTag: {
    fontFamily:    CoachFonts.bodyBold,
    fontSize:      W * 0.026,
    color:         CoachColors.textMuted,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom:  4,
  },
  cardTitleRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      W * 0.046,
    color:         CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom:  W * 0.04,
  },

  // Exercise list in detail
  emptyWorkout: {
    alignItems:   'center',
    paddingVertical: W * 0.05,
    gap:          10,
  },
  emptyWorkoutText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize:   W * 0.034,
    color:      CoachColors.textMuted,
    textAlign:  'center',
  },
  exList: { gap: 10 },
  exItem: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    backgroundColor: CoachColors.surface,
    borderRadius:    12,
    padding:         12,
  },
  exNum: {
    width:          28,
    height:         28,
    borderRadius:   14,
    backgroundColor:CoachColors.accentSoft,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  exNumText:   { fontFamily: CoachFonts.bodyBold, fontSize: 12, color: CoachColors.accent },
  exName:      { fontFamily: CoachFonts.bodySemiBold, fontSize: W * 0.036, color: CoachColors.textPrimary, marginBottom: 2 },
  exMeta:      { fontFamily: CoachFonts.body, fontSize: W * 0.029, color: CoachColors.textMuted },
  restChip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            3,
    backgroundColor:CoachColors.surface,
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:   8,
  },
  restChipText: { fontFamily: CoachFonts.bodyMedium, fontSize: 10, color: CoachColors.textMuted },

  // Muscle chips
  muscleChips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginTop:     W * 0.04,
    paddingTop:    W * 0.04,
    borderTopWidth:1,
    borderTopColor:CoachColors.borderMuted,
  },
  muscleChip: {
    paddingHorizontal: 12,
    paddingVertical:    5,
    borderRadius:   20,
    backgroundColor:CoachColors.accentSoft,
    borderWidth:    1,
    borderColor:    CoachColors.accentSoft,
  },
  muscleChipText: { fontFamily: CoachFonts.bodySemiBold, fontSize: W * 0.03, color: CoachColors.accent },

  // Notes
  savedPill: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:  20,
    backgroundColor:CoachColors.accentSoft,
  },
  savedText: { fontFamily: CoachFonts.bodyBold, fontSize: W * 0.026, color: CoachColors.accent },
  notesInput: {
    backgroundColor: CoachColors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     CoachColors.borderMuted,
    padding:         14,
    fontFamily:      CoachFonts.body,
    fontSize:        W * 0.035,
    color:           CoachColors.textPrimary,
    minHeight:       100,
    lineHeight:      W * 0.052,
  },

  // Actions card
  actionsCard: {
    marginHorizontal: W * 0.04,
    gap:              12,
    marginBottom:     W * 0.04,
  },
  primaryCTA: {
    borderRadius: 14,
    overflow:     'hidden',
  },
  primaryCTAGradient: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical:16,
    minHeight:      54,
  },
  primaryCTAText: {
    fontFamily:    CoachFonts.headingBold,
    fontSize:      W * 0.044,
    color:         CoachColors.onAccent,
    letterSpacing: -0.2,
  },
  secondaryCTA: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical:14,
    borderRadius:   14,
    backgroundColor:CoachColors.accentSofter,
    borderWidth:    1,
    borderColor:    CoachColors.accentSoft,
    minHeight:      52,
  },
  secondaryCTAText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize:   W * 0.038,
    color:      CoachColors.accent,
  },
});
