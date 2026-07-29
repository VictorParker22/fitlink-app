import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, TextInput, Modal, Vibration, StatusBar, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import Avatar from '../../components/Avatar';
import { useRestChime } from '../../hooks/useRestChime';

// ─── Types ──────────────────────────────────────────────────
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

// ─── Helpers ────────────────────────────────────────────────
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

export default function TrainerSessionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { sessions, updateSession, getClientById, clientWorkouts, workouts } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [session, setSession] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [noWorkoutAssigned, setNoWorkoutAssigned] = useState(false);

  // Tracking state
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  
  // Timers
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize — look up real workout exercises via client's assigned workouts
  useEffect(() => {
    if (id && sessions) {
      const found = sessions.find((s) => s.id === id);
      if (found) {
        setSession(found);
        if (found.client_id) {
          setClient(getClientById(found.client_id));
        }

        // Find the most recent workout assigned to this client
        const clientId = found.client_id;
        let workoutExercises: ExerciseState[] = [];

        if (clientId) {
          const assignedWorkouts = clientWorkouts
            .filter((cw) => cw.client_id === clientId && cw.status === 'assigned')
            .sort((a, b) => new Date(b.assigned_date).getTime() - new Date(a.assigned_date).getTime());

          if (assignedWorkouts.length > 0) {
            const linkedWorkout = workouts.find((w) => w.id === assignedWorkouts[0].workout_id);
            if (linkedWorkout && linkedWorkout.workout_exercises && linkedWorkout.workout_exercises.length > 0) {
              workoutExercises = linkedWorkout.workout_exercises
                .sort((a, b) => a.order_index - b.order_index)
                .map((we, idx) => ({
                  exerciseName: we.exercises?.name || 'Exercise',
                  muscleGroup: we.exercises?.muscle_group || we.exercises?.category || '',
                  targetSets: we.sets,
                  targetReps: we.reps,
                  restSeconds: we.rest_seconds,
                  sets: Array.from({ length: we.sets }, () => ({
                    weight: '',
                    reps: String(we.reps),
                    completed: false,
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
      }
    }
  }, [id, sessions, getClientById, clientWorkouts, workouts]);

  // Elapsed timer
  useEffect(() => {
    if (session && !showSummary) {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [session, showSummary]);

  const toggleExercise = useCallback((index: number) => {
    setExerciseStates((prev) => prev.map((ex, i) => ({
      ...ex, expanded: i === index ? !ex.expanded : ex.expanded,
    })));
  }, []);

  const updateSetValue = useCallback((exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setExerciseStates((prev) => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const newSets = [...ex.sets];
      newSets[setIdx] = { ...newSets[setIdx], [field]: value };
      return { ...ex, sets: newSets };
    }));
  }, []);

  const { triggerRestCue, triggerCountdownTick } = useRestChime();
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rest timer countdown
  useEffect(() => {
    if (restRemaining !== null && restRemaining > 0) {
      restTimerRef.current = setInterval(() => {
        setRestRemaining((prev) => {
          if (prev === null || prev <= 1) {
            if (restTimerRef.current) clearInterval(restTimerRef.current);
            triggerRestCue();
            return null;
          }
          const nextVal = prev - 1;
          if (nextVal <= 3) {
            triggerCountdownTick(nextVal);
          }
          return nextVal;
        });
      }, 1000);
    }
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, [restRemaining, triggerRestCue, triggerCountdownTick]);

  const completeSet = useCallback((exIdx: number, setIdx: number) => {
    setExerciseStates((prev) => {
      const updated = prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const newSets = [...ex.sets];
        newSets[setIdx] = { ...newSets[setIdx], completed: !newSets[setIdx].completed };
        return { ...ex, sets: newSets };
      });

      const set = updated[exIdx].sets[setIdx];
      if (set.completed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Start rest timer if exercise specifies restSeconds or default to 60s
        const restSecs = updated[exIdx].restSeconds || 60;
        setRestRemaining(restSecs);

        // Auto-expand next if done
        const allDone = updated[exIdx].sets.every((s) => s.completed);
        if (allDone && exIdx < updated.length - 1) {
          updated[exIdx + 1] = { ...updated[exIdx + 1], expanded: true };
        }
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return updated;
    });
  }, []);

  const handleFinishSession = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setShowSummary(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleConfirmFinish = useCallback(async () => {
    if (!session) return;
    try {
      await updateSession(session.id, { status: 'completed' });
      router.back();
    } catch (err) {
      Alert.alert('Error', 'Failed to complete session');
    }
  }, [session, updateSession, router]);

  const handleCancelSession = useCallback(() => {
    Alert.alert('End Session?', 'Are you sure you want to exit? Session progress will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Exit',
        style: 'destructive',
        onPress: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          router.back();
        },
      },
    ]);
  }, [router]);

  if (!session) return (
    <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator size="large" color={colors.accent} />
    </SafeAreaView>
  );

  const totalSets = exerciseStates.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exerciseStates.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0);
  const progress = totalSets > 0 ? completedSets / totalSets : 0;

  // ─────────────────────────────────────────────────────────────
  // SUMMARY VIEW
  // ─────────────────────────────────────────────────────────────
  if (showSummary) {
    let totalVolume = 0;
    exerciseStates.forEach((ex) => ex.sets.forEach((set) => {
      if (set.completed) totalVolume += (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0);
    }));

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <LinearGradient
          colors={isDark ? ['#1A1A24', '#111114'] : ['#1C1C21', '#111114']}
          style={{ flex: 1, padding: Spacing.xl, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="ribbon" size={64} color={colors.accent} style={{ marginBottom: Spacing.lg }} />
          <Text style={{ fontFamily: FontFamily.headingExtraBold, fontSize: 28, color: '#FFF', marginBottom: 4 }}>Session Complete!</Text>
          <Text style={{ fontFamily: FontFamily.bodyMedium, fontSize: 16, color: colors.textSecondary, marginBottom: Spacing['2xl'] }}>
            Great work tracking {client?.name || 'Client'}.
          </Text>

          <View style={{ flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing['3xl'] }}>
            <View style={styles.awSummaryStatCard}>
              <Ionicons name="time-outline" size={22} color={colors.accent} />
              <Text style={styles.awSummaryStatValue}>{formatDuration(elapsedSeconds)}</Text>
              <Text style={styles.awSummaryStatLabel}>Duration</Text>
            </View>
            <View style={styles.awSummaryStatCard}>
              <Ionicons name="trending-up-outline" size={22} color={colors.yellow} />
              <Text style={styles.awSummaryStatValue}>
                {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume.toLocaleString()}
              </Text>
              <Text style={styles.awSummaryStatLabel}>Volume (lbs)</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.awSummaryFinishBtn} onPress={handleConfirmFinish} activeOpacity={0.8}>
            <Ionicons name="checkmark-circle" size={20} color="#FFF" />
            <Text style={styles.awSummaryFinishBtnText}>Save & Exit</Text>
          </TouchableOpacity>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // ACTIVE SESSION TRACKER
  // ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <LinearGradient
        colors={isDark ? ['#1A1A24', '#22222E'] : ['#1C1C21', '#2A2A32']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.awHeader}
      >
        <View style={styles.awHeaderTop}>
          <TouchableOpacity onPress={handleCancelSession} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <View style={styles.awHeaderCenter}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {client && <Avatar name={client.name} size="sm" imageUrl={client.avatar_url} />}
              <Text style={styles.awHeaderName} numberOfLines={1}>{client?.name || 'Session'}</Text>
            </View>
          </View>
          <View style={styles.awTimerPill}>
            <Ionicons name="time-outline" size={14} color={colors.accent} />
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

      {/* Exercise List */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.md }} showsVerticalScrollIndicator={false}>
        {noWorkoutAssigned ? (
          <View style={{ alignItems: 'center', paddingVertical: Spacing['3xl'], paddingHorizontal: Spacing.xl }}>
            <Ionicons name="barbell-outline" size={48} color={colors.textTertiary} style={{ marginBottom: Spacing.md }} />
            <Text style={{ fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary, marginBottom: 6, textAlign: 'center' }}>
              No Workout Assigned
            </Text>
            <Text style={{ fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              No workout has been assigned to this client yet. Assign a workout from the Workouts tab to track exercises here.
            </Text>
          </View>
        ) : (
        <>
        {exerciseStates.map((exercise, exIdx) => {
          const completedInEx = exercise.sets.filter((s) => s.completed).length;
          const allDone = completedInEx === exercise.sets.length;

          return (
            <View key={exIdx} style={[styles.awExCard, allDone && styles.awExCardDone]}>
              <TouchableOpacity style={styles.awExHeader} onPress={() => toggleExercise(exIdx)} activeOpacity={0.7}>
                <View style={[styles.awExIdx, allDone && { backgroundColor: `${colors.green}25` }]}>
                  {allDone ? (
                    <Ionicons name="checkmark" size={14} color={colors.green} />
                  ) : (
                    <Text style={[styles.awExIdxText, allDone && { color: colors.green }]}>{exIdx + 1}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.awExName}>{exercise.exerciseName}</Text>
                  <View style={styles.awExMeta}>
                    <Text style={styles.awExTarget}>{exercise.targetSets} × {exercise.targetReps} reps</Text>
                  </View>
                </View>
                <View style={styles.awExProgress}>
                  <Text style={[styles.awExProgressText, allDone && { color: colors.green }]}>
                    {completedInEx}/{exercise.sets.length}
                  </Text>
                </View>
                <Ionicons name={exercise.expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textTertiary} />
              </TouchableOpacity>

              {exercise.expanded && (
                <View style={styles.awSetsContainer}>
                  <View style={styles.awSetHeaderRow}>
                    <Text style={[styles.awSetHeaderText, { width: 40 }]}>SET</Text>
                    <Text style={[styles.awSetHeaderText, { flex: 1 }]}>WEIGHT</Text>
                    <Text style={[styles.awSetHeaderText, { flex: 1 }]}>REPS</Text>
                    <Text style={[styles.awSetHeaderText, { width: 50, textAlign: 'center' }]}>✓</Text>
                  </View>

                  {exercise.sets.map((set, setIdx) => (
                    <View key={setIdx} style={[styles.awSetRow, set.completed && styles.awSetRowDone]}>
                      <View style={styles.awSetNumContainer}>
                        <Text style={[styles.awSetNum, set.completed && { color: colors.green }]}>{setIdx + 1}</Text>
                      </View>
                      <View style={styles.awSetInputContainer}>
                        <TextInput
                          style={[styles.awSetInput, set.completed && styles.awSetInputDone]}
                          value={set.weight} onChangeText={(v) => updateSetValue(exIdx, setIdx, 'weight', v)}
                          placeholder="0" placeholderTextColor={colors.textTertiary} keyboardType="numeric"
                          editable={!set.completed} selectTextOnFocus
                        />
                        <Text style={styles.awSetUnit}>lbs</Text>
                      </View>
                      <View style={styles.awSetInputContainer}>
                        <TextInput
                          style={[styles.awSetInput, set.completed && styles.awSetInputDone]}
                          value={set.reps} onChangeText={(v) => updateSetValue(exIdx, setIdx, 'reps', v)}
                          placeholder="0" placeholderTextColor={colors.textTertiary} keyboardType="numeric"
                          editable={!set.completed} selectTextOnFocus
                        />
                      </View>
                      <TouchableOpacity
                        style={[styles.awCheckBtn, set.completed && styles.awCheckBtnDone]}
                        onPress={() => completeSet(exIdx, setIdx)} activeOpacity={0.6}
                      >
                        <Ionicons
                          name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                          size={26} color={set.completed ? colors.green : colors.textTertiary}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* Finish button */}
        <TouchableOpacity
          style={[styles.awFinishBtn, progress < 1 && styles.awFinishBtnPartial]}
          onPress={handleFinishSession} activeOpacity={0.8}
        >
          <LinearGradient
            colors={progress >= 1 ? [colors.green, '#1DA34E'] : [colors.accent, '#E04E28']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.awFinishBtnGradient}
          >
            <Ionicons name={progress >= 1 ? 'trophy' : 'flag'} size={20} color="#FFF" />
            <Text style={styles.awFinishBtnText}>{progress >= 1 ? 'Finish Session 🎉' : 'Finish Session'}</Text>
          </LinearGradient>
        </TouchableOpacity>
        </>
        )}
        <View style={{ height: restRemaining !== null ? 90 : 40 }} />
      </ScrollView>

      {/* Floating Rest Timer Bar */}
      {restRemaining !== null && (
        <View style={styles.restTimerFloatingBar}>
          <View style={styles.restTimerInfo}>
            <Ionicons name="timer-outline" size={20} color="#FFD700" />
            <Text style={styles.restTimerLabel}>REST TIMER</Text>
            <Text style={styles.restTimerTime}>{formatTime(restRemaining)}</Text>
          </View>
          <TouchableOpacity
            style={styles.restTimerSkipBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRestRemaining(null);
            }}
          >
            <Text style={styles.restTimerSkipText}>SKIP</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? '#0F0F13' : '#F3F4F6' },
  
  awHeader: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, paddingTop: Spacing.sm,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
  },
  awHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.lg },
  awHeaderCenter: { flex: 1, alignItems: 'center' },
  awHeaderName: { fontFamily: FontFamily.headingSemiBold, fontSize: 18, color: '#FFF' },
  awTimerPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  awTimerText: { fontFamily: FontFamily.bodyBold, fontSize: FontSize.sm, color: colors.accent, fontVariant: ['tabular-nums'] },
  
  awProgressContainer: { marginTop: Spacing.xs },
  awProgressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  awProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  awProgressLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.6)', alignSelf: 'flex-end' },

  awExCard: { backgroundColor: colors.bgCard, borderRadius: Radius.xl, marginBottom: Spacing.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  awExCardDone: { borderColor: `${colors.green}50`, backgroundColor: isDark ? '#141E18' : '#F0FDF4' },
  awExHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  awExIdx: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  awExIdxText: { fontFamily: FontFamily.bodyBold, fontSize: 12, color: colors.textSecondary },
  awExName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: colors.textPrimary, marginBottom: 2 },
  awExMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  awExTarget: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textSecondary },
  awExProgress: { backgroundColor: colors.bgElevated, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  awExProgressText: { fontFamily: FontFamily.bodyBold, fontSize: 12, color: colors.textSecondary },

  awSetsContainer: { padding: Spacing.md, paddingTop: 0 },
  awSetHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm, paddingHorizontal: 8 },
  awSetHeaderText: { fontFamily: FontFamily.bodyBold, fontSize: 10, color: colors.textTertiary, letterSpacing: 0.5 },
  awSetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, borderRadius: Radius.lg, padding: 8, marginBottom: 8 },
  awSetRowDone: { backgroundColor: `${colors.green}15` },
  awSetNumContainer: { width: 40, alignItems: 'center' },
  awSetNum: { fontFamily: FontFamily.bodyBold, fontSize: 14, color: colors.textSecondary },
  awSetInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgPrimary, borderRadius: Radius.md, marginHorizontal: 4, paddingHorizontal: 8 },
  awSetInput: { flex: 1, height: 40, fontFamily: FontFamily.headingSemiBold, fontSize: 16, color: colors.textPrimary, textAlign: 'center' },
  awSetInputDone: { color: colors.textTertiary },
  awSetUnit: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: colors.textTertiary, marginLeft: 4 },
  awCheckBtn: { width: 50, height: 40, alignItems: 'center', justifyContent: 'center' },
  awCheckBtnDone: { opacity: 1 },

  awFinishBtn: { marginHorizontal: Spacing.md, marginTop: Spacing.lg, borderRadius: Radius.full, overflow: 'hidden' },
  awFinishBtnPartial: { opacity: 0.9 },
  awFinishBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  awFinishBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: '#FFF' },

  awSummaryStatCard: { backgroundColor: 'rgba(255,255,255,0.05)', padding: Spacing.lg, borderRadius: Radius.xl, alignItems: 'center', width: 120 },
  awSummaryStatValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, color: '#FFF', marginVertical: 4 },
  awSummaryStatLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  awSummaryFinishBtn: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: Radius.full, backgroundColor: colors.green, gap: 8 },
  awSummaryFinishBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: '#FFF' },

  restTimerFloatingBar: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#0C0C0E',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  restTimerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  restTimerLabel: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10,
    color: '#FFD700',
    letterSpacing: 1.5,
  },
  restTimerTime: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    marginLeft: 4,
  },
  restTimerSkipBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  restTimerSkipText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1,
  },
});
