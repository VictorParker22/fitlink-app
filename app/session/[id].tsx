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
 * Design: #0D0D12 base, #C8F135 lime accent, W*factor responsive sizing.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, TextInput, StatusBar, Dimensions,
  ActivityIndicator,
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
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import Avatar from '../../components/Avatar';
import { useRestChime } from '../../hooks/useRestChime';
import CancelSessionSheet from '../../components/sessions/CancelSessionSheet';
import { setCompletionData } from './sessionCompletionCache';

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
  upcoming:  { label: 'Upcoming',  color: '#C8F135', bg: 'rgba(200,241,53,0.1)'  },
  completed: { label: 'Completed', color: '#22C55E', bg: 'rgba(34,197,94,0.1)'   },
  cancelled: { label: 'Cancelled', color: '#EF4444', bg: 'rgba(239,68,68,0.1)'   },
} as const;

// ─── Root component ───────────────────────────────────────────────────────────

export default function TrainerSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; mode?: string }>();
  const sessionId = params.id;
  const mode = params.mode ?? 'track'; // 'detail' | 'track'

  const { sessions, updateSession, getClientById, clientWorkouts, workouts, getClientSessions } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

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
    } catch { /* complete.tsx will handle gracefully */ }

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
    } catch {}
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
        <ActivityIndicator size="large" color="#C8F135" />
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
      colors={colors}
      isDark={isDark}
      styles={styles}
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
        colors={['#141420', '#1A1A28']}
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
            <Ionicons name="close" size={20} color="rgba(255,255,255,0.55)" />
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
            <Ionicons name="radio-button-on" size={8} color="#C8F135" />
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
            <Ionicons name="barbell-outline" size={44} color="rgba(255,255,255,0.2)" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No Workout Assigned</Text>
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
                    <View style={[styles.awExIdx, allDone && { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
                      {allDone
                        ? <Ionicons name="checkmark" size={14} color="#22C55E" />
                        : <Text style={styles.awExIdxText}>{exIdx + 1}</Text>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.awExName}>{exercise.exerciseName}</Text>
                      <Text style={styles.awExTarget}>{exercise.targetSets} × {exercise.targetReps} reps</Text>
                    </View>
                    <View style={[styles.awExProgressPill, allDone && styles.awExProgressPillDone]}>
                      <Text style={[styles.awExProgressText, allDone && { color: '#22C55E' }]}>
                        {completedInEx}/{exercise.sets.length}
                      </Text>
                    </View>
                    <Ionicons
                      name={exercise.expanded ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color="rgba(255,255,255,0.3)"
                    />
                  </TouchableOpacity>

                  {exercise.expanded && (
                    <View style={styles.awSetsContainer}>
                      {/* Column headers */}
                      <View style={styles.awSetHeaderRow}>
                        <Text style={[styles.awSetHeaderText, { width: 40 }]}>SET</Text>
                        <Text style={[styles.awSetHeaderText, { flex: 1 }]}>WEIGHT</Text>
                        <Text style={[styles.awSetHeaderText, { flex: 1 }]}>REPS</Text>
                        <Text style={[styles.awSetHeaderText, { width: 50, textAlign: 'center' }]}>✓</Text>
                      </View>

                      {exercise.sets.map((set, setIdx) => (
                        <View key={setIdx} style={[styles.awSetRow, set.completed && styles.awSetRowDone]}>
                          <View style={styles.awSetNumContainer}>
                            <Text style={[styles.awSetNum, set.completed && { color: '#22C55E' }]}>
                              {setIdx + 1}
                            </Text>
                          </View>
                          <View style={styles.awSetInputContainer}>
                            <TextInput
                              style={[styles.awSetInput, set.completed && styles.awSetInputDone]}
                              value={set.weight}
                              onChangeText={v => updateSetValue(exIdx, setIdx, 'weight', v)}
                              placeholder="0"
                              placeholderTextColor="rgba(255,255,255,0.2)"
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
                              placeholderTextColor="rgba(255,255,255,0.2)"
                              keyboardType="numeric"
                              editable={!set.completed}
                              selectTextOnFocus
                              accessibilityLabel={`Reps for set ${setIdx + 1}`}
                            />
                          </View>
                          <TouchableOpacity
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
                              color={set.completed ? '#22C55E' : 'rgba(255,255,255,0.25)'}
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
                colors={progress >= 1 ? ['#C8F135', '#A8D420'] : ['#C8F135', '#E0A820']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.awFinishBtnGradient}
              >
                <Ionicons name={progress >= 1 ? 'trophy' : 'flag'} size={19} color="#0D0D12" />
                <Text style={styles.awFinishBtnText}>
                  {progress >= 1 ? 'Finish Session 🎉' : 'Finish Session'}
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
            <Ionicons name="timer-outline" size={18} color="#FFD700" />
            <Text style={styles.restBarLabel}>REST TIMER</Text>
            <Text style={styles.restBarTime}>{formatTime(restRemaining)}</Text>
          </View>
          <TouchableOpacity
            style={styles.restBarSkip}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRestRemaining(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Skip rest timer"
          >
            <Text style={styles.restBarSkipText}>SKIP</Text>
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
  colors:            ThemeColors;
  isDark:            boolean;
  styles:            ReturnType<typeof getStyles>;
  getClientSessions: (id: string) => any[];
}

function DetailView({
  session, client, exerciseStates, noWorkoutAssigned,
  detailNotes, setDetailNotes, notesSaving, notesSaved,
  onNotesSave, onStartTracking, onBookFollowUp, onBack,
  colors, isDark, styles, getClientSessions,
}: DetailViewProps) {
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
      <LinearGradient colors={['#0D0D12', '#111118', '#0A0A0F']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* ── Detail Header ── */}
          <Animated.View entering={FadeIn.duration(300)} style={dt.headerRow}>
            <TouchableOpacity
              style={dt.backBtn}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
            <Text style={dt.headerTitle}>Session Details</Text>
            <View style={[dt.statusPill, { backgroundColor: statusCfg.bg, borderColor: `${statusCfg.color}35` }]}>
              <Text style={[dt.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            </View>
          </Animated.View>

          {/* ── Client Hero Card ── */}
          <Animated.View entering={FadeInUp.delay(60).duration(350)}>
            <LinearGradient
              colors={['#1A2200', '#0D0D12']}
              style={dt.heroCard}
            >
              <View style={dt.heroClientRow}>
                {client
                  ? <Avatar name={client.name} size="lg" imageUrl={client.avatar_url} />
                  : (
                    <View style={dt.groupIcon}>
                      <Ionicons name="people" size={26} color="#C8F135" />
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
                  <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.4)" />
                  <Text style={dt.infoText}>{dateLabel}</Text>
                </View>
                <View style={dt.infoItem}>
                  <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.4)" />
                  <Text style={dt.infoText}>{timeLabel}</Text>
                </View>
                <View style={dt.infoItem}>
                  <Ionicons name="hourglass-outline" size={14} color="rgba(255,255,255,0.4)" />
                  <Text style={dt.infoText}>{session.duration} min</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ── Workout Plan ── */}
          <Animated.View entering={FadeInUp.delay(160).duration(350)} style={dt.card}>
            <Text style={dt.cardTag}>PLANNED WORKOUT</Text>
            <Text style={dt.cardTitle}>Exercise Lineup</Text>

            {noWorkoutAssigned ? (
              <View style={dt.emptyWorkout}>
                <Ionicons name="barbell-outline" size={28} color="rgba(255,255,255,0.2)" />
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
                          <Ionicons name="timer-outline" size={10} color="rgba(255,255,255,0.35)" />
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
          <Animated.View entering={FadeInUp.delay(240).duration(350)} style={dt.card}>
            <View style={dt.cardTitleRow}>
              <Text style={dt.cardTag}>COACH NOTES</Text>
              {notesSaved && (
                <View style={dt.savedPill}>
                  <Ionicons name="checkmark" size={10} color="#22C55E" />
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
              placeholderTextColor="rgba(255,255,255,0.22)"
              multiline
              textAlignVertical="top"
              accessibilityLabel="Coach session notes"
            />
          </Animated.View>

          {/* ── Actions ── */}
          <Animated.View entering={FadeInUp.delay(320).duration(350)} style={dt.actionsCard}>
            {session.status === 'upcoming' && (
              <TouchableOpacity
                style={dt.primaryCTA}
                onPress={onStartTracking}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Start tracking this session"
              >
                <LinearGradient
                  colors={['#C8F135', '#A8D420']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={dt.primaryCTAGradient}
                >
                  <Ionicons name="play-circle" size={20} color="#0D0D12" />
                  <Text style={dt.primaryCTAText}>Start Tracking</Text>
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
              <Ionicons name="calendar-outline" size={17} color="#60A5FA" />
              <Text style={dt.secondaryCTAText}>
                {session.status === 'upcoming' ? 'Book Another Session' : 'Book Follow-up Session'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Tracker styles ─────────────────────────────────────────────────────────
const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D12' },

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
    backgroundColor:'rgba(255,255,255,0.06)',
  },
  awHeaderCenter: { flex: 1, alignItems: 'center' },
  awHeaderName:   {
    fontFamily: FontFamily.headingSemiBold,
    fontSize:   W * 0.042,
    color:      '#FFFFFF',
  },
  awTimerPill: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            5,
    backgroundColor:'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderRadius:   20,
  },
  awTimerText: {
    fontFamily:  FontFamily.bodyBold,
    fontSize:    W * 0.034,
    color:       '#C8F135',
    fontVariant: ['tabular-nums'],
  },

  // Progress bar
  awProgressContainer: { marginTop: W * 0.01 },
  awProgressTrack: {
    height:          5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius:    3,
    overflow:        'hidden',
    marginBottom:    6,
  },
  awProgressFill: {
    height:          '100%',
    backgroundColor: '#C8F135',
    borderRadius:    3,
  },
  awProgressLabel: {
    fontFamily:  FontFamily.bodyMedium,
    fontSize:    W * 0.028,
    color:       'rgba(255,255,255,0.45)',
    alignSelf:   'flex-end',
  },

  // Exercise cards
  awExCard: {
    backgroundColor: '#111118',
    borderRadius:    Radius.xl,
    marginBottom:    10,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
  },
  awExCardDone: {
    borderColor:     'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.04)',
  },
  awExHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    padding:       Spacing.md,
    gap:           Spacing.md,
    minHeight:     56,
  },
  awExIdx: {
    width:          28,
    height:         28,
    borderRadius:   14,
    backgroundColor:'rgba(255,255,255,0.06)',
    alignItems:     'center',
    justifyContent: 'center',
  },
  awExIdxText:      { fontFamily: FontFamily.bodyBold, fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  awExName:         { fontFamily: FontFamily.headingSemiBold, fontSize: W * 0.038, color: '#FFFFFF', marginBottom: 2 },
  awExTarget:       { fontFamily: FontFamily.bodyMedium, fontSize: W * 0.03, color: 'rgba(255,255,255,0.4)' },
  awExProgressPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:    12,
  },
  awExProgressPillDone: { backgroundColor: 'rgba(34,197,94,0.12)' },
  awExProgressText: { fontFamily: FontFamily.bodyBold, fontSize: W * 0.03, color: 'rgba(255,255,255,0.45)' },

  // Sets
  awSetsContainer: { padding: Spacing.md, paddingTop: 0 },
  awSetHeaderRow:  {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:  Spacing.sm,
    paddingHorizontal: 8,
  },
  awSetHeaderText: {
    fontFamily:    FontFamily.bodyBold,
    fontSize:      10,
    color:         'rgba(255,255,255,0.28)',
    letterSpacing: 0.8,
  },
  awSetRow: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    Radius.lg,
    padding:         8,
    marginBottom:    8,
  },
  awSetRowDone:      { backgroundColor: 'rgba(34,197,94,0.08)' },
  awSetNumContainer: { width: 40, alignItems: 'center' },
  awSetNum: {
    fontFamily: FontFamily.bodyBold,
    fontSize:   W * 0.035,
    color:      'rgba(255,255,255,0.45)',
  },
  awSetInputContainer: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius:    Radius.md,
    marginHorizontal:4,
    paddingHorizontal:8,
  },
  awSetInput: {
    flex:       1,
    height:     40,
    fontFamily: FontFamily.headingSemiBold,
    fontSize:   W * 0.04,
    color:      '#FFFFFF',
    textAlign:  'center',
  },
  awSetInputDone: { color: 'rgba(255,255,255,0.3)' },
  awSetUnit: {
    fontFamily: FontFamily.bodyMedium,
    fontSize:   W * 0.028,
    color:      'rgba(255,255,255,0.3)',
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
    borderRadius: Radius.full,
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
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.044,
    color:         '#0D0D12',
    letterSpacing: -0.2,
  },

  // Empty state
  emptyState: {
    alignItems:     'center',
    paddingVertical: W * 0.1,
    paddingHorizontal: W * 0.1,
  },
  emptyTitle: {
    fontFamily:  FontFamily.headingSemiBold,
    fontSize:    W * 0.042,
    color:       '#FFFFFF',
    marginBottom: 8,
    textAlign:   'center',
  },
  emptyBody: {
    fontFamily:  FontFamily.body,
    fontSize:    W * 0.034,
    color:       'rgba(255,255,255,0.4)',
    textAlign:   'center',
    lineHeight:  W * 0.05,
  },

  // Rest timer bar
  restBar: {
    position:  'absolute',
    bottom:    20,
    left:      W * 0.04,
    right:     W * 0.04,
    backgroundColor: '#0C0C10',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.35)',
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
    fontFamily:    FontFamily.bodyBold,
    fontSize:      W * 0.026,
    color:         '#FFD700',
    letterSpacing: 1.5,
  },
  restBarTime: {
    fontFamily:  FontFamily.headingExtraBold,
    fontSize:    W * 0.046,
    color:       '#FFFFFF',
    fontVariant: ['tabular-nums'],
    marginLeft:  4,
  },
  restBarSkip: {
    backgroundColor:  'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical:   7,
    borderRadius:     14,
  },
  restBarSkipText: {
    fontFamily:    FontFamily.bodyBold,
    fontSize:      W * 0.028,
    color:         'rgba(255,255,255,0.6)',
    letterSpacing: 1,
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
    backgroundColor:'rgba(255,255,255,0.06)',
    flexShrink:     0,
  },
  headerTitle: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.05,
    color:         '#FFFFFF',
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
    fontFamily: FontFamily.bodyBold,
    fontSize:   W * 0.03,
  },

  // Hero card
  heroCard: {
    marginHorizontal: W * 0.04,
    borderRadius:     20,
    padding:          W * 0.05,
    borderWidth:      1,
    borderColor:      'rgba(200,241,53,0.15)',
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
    backgroundColor: 'rgba(200,241,53,0.12)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  heroName: {
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.052,
    color:         '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom:  3,
  },
  heroType: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize:   W * 0.034,
    color:      '#C8F135',
    marginBottom:3,
  },
  heroHistory: {
    fontFamily: FontFamily.body,
    fontSize:   W * 0.03,
    color:      'rgba(255,255,255,0.4)',
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
    fontFamily: FontFamily.bodyMedium,
    fontSize:   W * 0.031,
    color:      'rgba(255,255,255,0.55)',
  },

  // Card
  card: {
    marginHorizontal: W * 0.04,
    marginBottom:     W * 0.035,
    backgroundColor:  '#111118',
    borderRadius:     18,
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.08)',
    padding:          W * 0.05,
  },
  cardTag: {
    fontFamily:    FontFamily.bodyBold,
    fontSize:      W * 0.026,
    color:         'rgba(255,255,255,0.35)',
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
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.046,
    color:         '#FFFFFF',
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
    fontFamily: FontFamily.bodyMedium,
    fontSize:   W * 0.034,
    color:      'rgba(255,255,255,0.35)',
    textAlign:  'center',
  },
  exList: { gap: 10 },
  exItem: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    12,
    padding:         12,
  },
  exNum: {
    width:          28,
    height:         28,
    borderRadius:   14,
    backgroundColor:'rgba(200,241,53,0.12)',
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  exNumText:   { fontFamily: FontFamily.bodyBold, fontSize: 12, color: '#C8F135' },
  exName:      { fontFamily: FontFamily.bodySemiBold, fontSize: W * 0.036, color: '#FFFFFF', marginBottom: 2 },
  exMeta:      { fontFamily: FontFamily.body, fontSize: W * 0.029, color: 'rgba(255,255,255,0.4)' },
  restChip: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            3,
    backgroundColor:'rgba(255,255,255,0.06)',
    paddingHorizontal: 8,
    paddingVertical:   4,
    borderRadius:   8,
  },
  restChipText: { fontFamily: FontFamily.bodyMedium, fontSize: 10, color: 'rgba(255,255,255,0.35)' },

  // Muscle chips
  muscleChips: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
    marginTop:     W * 0.04,
    paddingTop:    W * 0.04,
    borderTopWidth:1,
    borderTopColor:'rgba(255,255,255,0.06)',
  },
  muscleChip: {
    paddingHorizontal: 12,
    paddingVertical:    5,
    borderRadius:   20,
    backgroundColor:'rgba(167,139,250,0.1)',
    borderWidth:    1,
    borderColor:    'rgba(167,139,250,0.2)',
  },
  muscleChipText: { fontFamily: FontFamily.bodySemiBold, fontSize: W * 0.03, color: '#A78BFA' },

  // Notes
  savedPill: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           3,
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:  20,
    backgroundColor:'rgba(34,197,94,0.1)',
  },
  savedText: { fontFamily: FontFamily.bodyBold, fontSize: W * 0.026, color: '#22C55E' },
  notesInput: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.08)',
    padding:         14,
    fontFamily:      FontFamily.body,
    fontSize:        W * 0.035,
    color:           '#FFFFFF',
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
    fontFamily:    FontFamily.headingExtraBold,
    fontSize:      W * 0.044,
    color:         '#0D0D12',
    letterSpacing: -0.2,
  },
  secondaryCTA: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            8,
    paddingVertical:14,
    borderRadius:   14,
    backgroundColor:'rgba(96,165,250,0.08)',
    borderWidth:    1,
    borderColor:    'rgba(96,165,250,0.2)',
    minHeight:      52,
  },
  secondaryCTAText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize:   W * 0.038,
    color:      '#60A5FA',
  },
});
