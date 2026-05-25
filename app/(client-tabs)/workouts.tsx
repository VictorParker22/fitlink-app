import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, RefreshControl,
  ScrollView, TextInput, Modal, Vibration, StatusBar, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import type { ThemeColors } from '../../context/ThemeContext';
import Card from '../../components/Card';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

type TabKey = 'upcoming' | 'completed' | 'all';

// ─── Set tracking types ─────────────────────────────────────────
interface SetLog {
  weight: string;
  reps: string;
  completed: boolean;
}

interface ExerciseState {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  sets: SetLog[];
  expanded: boolean;
}

// ─── Helper: format seconds to MM:SS ────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ─── Helper: format seconds to H:MM:SS ──────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function ClientWorkoutsScreen() {
  const {
    workouts, markWorkoutComplete, markWorkoutSkipped, refreshData,
    logExerciseSet, completeWorkoutWithLog, clearExerciseLogs, exerciseLogs,
  } = useClient();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ─── Active Workout State ───────────────────────────────────
  const [activeWorkout, setActiveWorkout] = useState<any>(null);
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Elapsed timer ─────────────────────────────────────────
  useEffect(() => {
    if (activeWorkout && !showSummary) {
      timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeWorkout, showSummary]);

  // ─── Rest countdown timer ─────────────────────────────────
  useEffect(() => {
    if (showRestTimer && restTimeLeft > 0) {
      restTimerRef.current = setInterval(() => {
        setRestTimeLeft((t) => {
          if (t <= 1) {
            setShowRestTimer(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            if (Platform.OS !== 'web') Vibration.vibrate([0, 300, 150, 300]);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (restTimerRef.current) clearInterval(restTimerRef.current); };
  }, [showRestTimer, restTimeLeft]);

  // ─── Start Active Workout ─────────────────────────────────
  const startActiveWorkout = useCallback((workout: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const exercises = workout.workouts?.workout_exercises || [];
    const states: ExerciseState[] = exercises.map((ex: any) => ({
      exerciseId: ex.exercise_id || ex.exercises?.id || `ex-${Math.random()}`,
      exerciseName: ex.exercises?.name || 'Exercise',
      muscleGroup: ex.exercises?.muscle_group || '',
      targetSets: ex.sets || 3,
      targetReps: ex.reps || 10,
      restSeconds: ex.rest_seconds || 60,
      sets: Array.from({ length: ex.sets || 3 }, () => ({
        weight: '',
        reps: String(ex.reps || 10),
        completed: false,
      })),
      expanded: false,
    }));
    // Auto-expand first exercise
    if (states.length > 0) states[0].expanded = true;
    setExerciseStates(states);
    setActiveWorkout(workout);
    setElapsedSeconds(0);
    setShowSummary(false);
    clearExerciseLogs();
  }, [clearExerciseLogs]);

  // ─── Toggle exercise expansion ────────────────────────────
  const toggleExercise = useCallback((index: number) => {
    setExerciseStates((prev) => prev.map((ex, i) => ({
      ...ex,
      expanded: i === index ? !ex.expanded : ex.expanded,
    })));
  }, []);

  // ─── Update set value ─────────────────────────────────────
  const updateSetValue = useCallback((exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setExerciseStates((prev) => prev.map((ex, i) => {
      if (i !== exIdx) return ex;
      const newSets = [...ex.sets];
      newSets[setIdx] = { ...newSets[setIdx], [field]: value };
      return { ...ex, sets: newSets };
    }));
  }, []);

  // ─── Complete a set ───────────────────────────────────────
  const completeSet = useCallback((exIdx: number, setIdx: number) => {
    setExerciseStates((prev) => {
      const updated = prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const newSets = [...ex.sets];
        const wasCompleted = newSets[setIdx].completed;
        newSets[setIdx] = { ...newSets[setIdx], completed: !wasCompleted };
        return { ...ex, sets: newSets };
      });

      const exercise = updated[exIdx];
      const set = exercise.sets[setIdx];

      if (set.completed && activeWorkout) {
        // Log to context
        logExerciseSet(
          activeWorkout.id,
          exercise.exerciseId,
          setIdx,
          parseFloat(set.weight) || 0,
          parseInt(set.reps) || 0,
        );
        // Start rest timer
        if (exercise.restSeconds > 0) {
          setRestTimeLeft(exercise.restSeconds);
          setShowRestTimer(true);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Auto-expand next exercise if all sets of current are done
        const allDone = exercise.sets.every((s) => s.completed);
        if (allDone && exIdx < updated.length - 1) {
          updated[exIdx + 1] = { ...updated[exIdx + 1], expanded: true };
        }
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      return updated;
    });
  }, [activeWorkout, logExerciseSet]);

  // ─── Summary calculations ─────────────────────────────────
  const summaryData = useMemo(() => {
    let totalSetsCompleted = 0;
    let totalVolume = 0;
    let exercisesCompleted = 0;

    exerciseStates.forEach((ex) => {
      let exCompleted = false;
      ex.sets.forEach((set) => {
        if (set.completed) {
          totalSetsCompleted++;
          exCompleted = true;
          totalVolume += (parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0);
        }
      });
      if (exCompleted) exercisesCompleted++;
    });

    return { totalSetsCompleted, totalVolume, exercisesCompleted };
  }, [exerciseStates]);

  // ─── Finish workout ───────────────────────────────────────
  const handleFinishWorkout = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setShowSummary(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleConfirmFinish = useCallback(async () => {
    if (!activeWorkout) return;
    await completeWorkoutWithLog(activeWorkout.id, elapsedSeconds);
    setActiveWorkout(null);
    setShowSummary(false);
    setExerciseStates([]);
    setElapsedSeconds(0);
  }, [activeWorkout, completeWorkoutWithLog, elapsedSeconds]);

  const handleCancelWorkout = useCallback(() => {
    Alert.alert('End Workout?', 'Your progress will be lost.', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          setActiveWorkout(null);
          setExerciseStates([]);
          setElapsedSeconds(0);
          setShowSummary(false);
          clearExerciseLogs();
        },
      },
    ]);
  }, [clearExerciseLogs]);

  // ─── Existing list handlers ────────────────────────────────
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const handleComplete = (id: string, name: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Complete Workout', `Mark "${name}" as completed?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: '✅ Complete', onPress: () => markWorkoutComplete(id) },
    ]);
  };

  const handleSkip = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markWorkoutSkipped(id);
  };

  // Filter + group by date section
  const filtered = useMemo(() => {
    let list = [...workouts];
    if (tab === 'upcoming') list = list.filter((w: any) => w.status === 'assigned');
    else if (tab === 'completed') list = list.filter((w: any) => w.status === 'completed');
    return list;
  }, [workouts, tab]);

  const sections = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filtered.forEach((w: any) => {
      const d = new Date(w.assigned_date);
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
      let label: string;
      if (d.toDateString() === today.toDateString()) label = 'Today';
      else if (d.toDateString() === tomorrow.toDateString()) label = 'Tomorrow';
      else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday';
      else label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      if (!groups[label]) groups[label] = [];
      groups[label].push(w);
    });
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  // Stats
  const totalCompleted = workouts.filter((w: any) => w.status === 'completed').length;
  const totalAssigned = workouts.filter((w: any) => w.status === 'assigned').length;
  const totalSkipped = workouts.filter((w: any) => w.status === 'skipped').length;

  const statusConfig: Record<string, { bg: string; text: string; icon: string; label: string }> = {
    assigned: { bg: `${colors.accent}18`, text: colors.accent, icon: 'flash', label: 'Ready' },
    completed: { bg: `${colors.green}18`, text: colors.green, icon: 'checkmark-circle', label: 'Done' },
    skipped: { bg: colors.bgElevated, text: colors.textTertiary, icon: 'close-circle', label: 'Skipped' },
  };

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: totalAssigned },
    { key: 'completed', label: 'Completed', count: totalCompleted },
    { key: 'all', label: 'All', count: workouts.length },
  ];

  // ─────────────────────────────────────────────────────────────
  // ACTIVE WORKOUT SUMMARY VIEW
  // ─────────────────────────────────────────────────────────────
  if (activeWorkout && showSummary) {
    const { totalSetsCompleted, totalVolume, exercisesCompleted } = summaryData;
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <LinearGradient
          colors={isDark ? ['#1A1A24', '#111114'] : ['#1C1C21', '#111114']}
          style={styles.awSummaryGradient}
        >
          <View style={styles.awSummaryContent}>
            {/* Trophy icon */}
            <View style={styles.awSummaryTrophy}>
              <Ionicons name="trophy" size={48} color={colors.accent} />
            </View>

            <Text style={styles.awSummaryTitle}>Workout Complete!</Text>
            <Text style={styles.awSummaryName}>{activeWorkout.workouts?.name || 'Workout'}</Text>

            {/* Stats grid */}
            <View style={styles.awSummaryGrid}>
              <View style={styles.awSummaryStatCard}>
                <Ionicons name="time-outline" size={22} color={colors.accent} />
                <Text style={styles.awSummaryStatValue}>{formatDuration(elapsedSeconds)}</Text>
                <Text style={styles.awSummaryStatLabel}>Duration</Text>
              </View>
              <View style={styles.awSummaryStatCard}>
                <Ionicons name="barbell-outline" size={22} color={colors.green} />
                <Text style={styles.awSummaryStatValue}>{exercisesCompleted}</Text>
                <Text style={styles.awSummaryStatLabel}>Exercises</Text>
              </View>
              <View style={styles.awSummaryStatCard}>
                <Ionicons name="layers-outline" size={22} color={colors.blue} />
                <Text style={styles.awSummaryStatValue}>{totalSetsCompleted}</Text>
                <Text style={styles.awSummaryStatLabel}>Sets</Text>
              </View>
              <View style={styles.awSummaryStatCard}>
                <Ionicons name="trending-up-outline" size={22} color={colors.yellow} />
                <Text style={styles.awSummaryStatValue}>
                  {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume.toLocaleString()}
                </Text>
                <Text style={styles.awSummaryStatLabel}>Volume (lbs)</Text>
              </View>
            </View>

            {/* Exercise breakdown */}
            <View style={styles.awSummaryBreakdown}>
              {exerciseStates.map((ex, i) => {
                const completedSets = ex.sets.filter((s) => s.completed).length;
                return (
                  <View key={i} style={styles.awSummaryExRow}>
                    <View style={[styles.awSummaryExDot, { backgroundColor: completedSets > 0 ? colors.green : colors.textTertiary }]} />
                    <Text style={styles.awSummaryExName} numberOfLines={1}>{ex.exerciseName}</Text>
                    <Text style={styles.awSummaryExSets}>{completedSets}/{ex.targetSets}</Text>
                  </View>
                );
              })}
            </View>

            {/* Actions */}
            <TouchableOpacity style={styles.awSummaryFinishBtn} onPress={handleConfirmFinish} activeOpacity={0.8}>
              <Ionicons name="checkmark-circle" size={20} color="#FFF" />
              <Text style={styles.awSummaryFinishBtnText}>Save & Finish</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.awSummaryContinueBtn} onPress={() => setShowSummary(false)} activeOpacity={0.7}>
              <Text style={styles.awSummaryContinueBtnText}>Continue Workout</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // ACTIVE WORKOUT VIEW
  // ─────────────────────────────────────────────────────────────
  if (activeWorkout) {
    const exercises = activeWorkout.workouts?.workout_exercises || [];
    const totalSets = exerciseStates.reduce((sum, ex) => sum + ex.sets.length, 0);
    const completedSets = exerciseStates.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0);
    const progress = totalSets > 0 ? completedSets / totalSets : 0;

    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar barStyle="light-content" />

        {/* Rest Timer Overlay */}
        <Modal visible={showRestTimer} transparent animationType="fade">
          <View style={styles.awRestOverlay}>
            <View style={styles.awRestCard}>
              <Text style={styles.awRestLabel}>REST</Text>
              <Text style={styles.awRestTime}>{formatTime(restTimeLeft)}</Text>
              <Text style={styles.awRestHint}>Next set coming up</Text>
              <TouchableOpacity
                style={styles.awRestSkipBtn}
                onPress={() => { setShowRestTimer(false); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                activeOpacity={0.7}
              >
                <Ionicons name="play-skip-forward" size={18} color="#FFF" />
                <Text style={styles.awRestSkipText}>Skip Rest</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Header */}
        <LinearGradient
          colors={isDark ? ['#1A1A24', '#22222E'] : ['#1C1C21', '#2A2A32']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.awHeader}
        >
          <View style={styles.awHeaderTop}>
            <TouchableOpacity onPress={handleCancelWorkout} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            <View style={styles.awHeaderCenter}>
              <Text style={styles.awHeaderName} numberOfLines={1}>
                {activeWorkout.workouts?.name || 'Workout'}
              </Text>
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
        <ScrollView
          style={styles.awScrollView}
          contentContainerStyle={styles.awScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {exerciseStates.map((exercise, exIdx) => {
            const completedInEx = exercise.sets.filter((s) => s.completed).length;
            const allDone = completedInEx === exercise.sets.length;

            return (
              <View key={exIdx} style={[styles.awExCard, allDone && styles.awExCardDone]}>
                {/* Exercise header */}
                <TouchableOpacity
                  style={styles.awExHeader}
                  onPress={() => toggleExercise(exIdx)}
                  activeOpacity={0.7}
                >
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
                      {exercise.muscleGroup ? (
                        <Text style={styles.awExMuscle}>{exercise.muscleGroup}</Text>
                      ) : null}
                      <Text style={styles.awExTarget}>
                        {exercise.targetSets} × {exercise.targetReps} reps
                      </Text>
                      {exercise.restSeconds > 0 && (
                        <Text style={styles.awExRest}>
                          <Ionicons name="timer-outline" size={10} color={colors.textTertiary} /> {exercise.restSeconds}s rest
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.awExProgress}>
                    <Text style={[styles.awExProgressText, allDone && { color: colors.green }]}>
                      {completedInEx}/{exercise.sets.length}
                    </Text>
                  </View>
                  <Ionicons
                    name={exercise.expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textTertiary}
                  />
                </TouchableOpacity>

                {/* Sets table */}
                {exercise.expanded && (
                  <View style={styles.awSetsContainer}>
                    {/* Table header */}
                    <View style={styles.awSetHeaderRow}>
                      <Text style={[styles.awSetHeaderText, { width: 40 }]}>SET</Text>
                      <Text style={[styles.awSetHeaderText, { flex: 1 }]}>WEIGHT</Text>
                      <Text style={[styles.awSetHeaderText, { flex: 1 }]}>REPS</Text>
                      <Text style={[styles.awSetHeaderText, { width: 50, textAlign: 'center' }]}>✓</Text>
                    </View>

                    {exercise.sets.map((set, setIdx) => (
                      <View
                        key={setIdx}
                        style={[styles.awSetRow, set.completed && styles.awSetRowDone]}
                      >
                        <View style={styles.awSetNumContainer}>
                          <Text style={[styles.awSetNum, set.completed && { color: colors.green }]}>
                            {setIdx + 1}
                          </Text>
                        </View>

                        <View style={styles.awSetInputContainer}>
                          <TextInput
                            style={[styles.awSetInput, set.completed && styles.awSetInputDone]}
                            value={set.weight}
                            onChangeText={(v) => updateSetValue(exIdx, setIdx, 'weight', v)}
                            placeholder="0"
                            placeholderTextColor={colors.textTertiary}
                            keyboardType="numeric"
                            editable={!set.completed}
                            selectTextOnFocus
                          />
                          <Text style={styles.awSetUnit}>lbs</Text>
                        </View>

                        <View style={styles.awSetInputContainer}>
                          <TextInput
                            style={[styles.awSetInput, set.completed && styles.awSetInputDone]}
                            value={set.reps}
                            onChangeText={(v) => updateSetValue(exIdx, setIdx, 'reps', v)}
                            placeholder="0"
                            placeholderTextColor={colors.textTertiary}
                            keyboardType="numeric"
                            editable={!set.completed}
                            selectTextOnFocus
                          />
                        </View>

                        <TouchableOpacity
                          style={[styles.awCheckBtn, set.completed && styles.awCheckBtnDone]}
                          onPress={() => completeSet(exIdx, setIdx)}
                          activeOpacity={0.6}
                        >
                          <Ionicons
                            name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                            size={26}
                            color={set.completed ? colors.green : colors.textTertiary}
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
            onPress={handleFinishWorkout}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={progress >= 1
                ? [colors.green, '#1DA34E']
                : [colors.accent, '#E04E28']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.awFinishBtnGradient}
            >
              <Ionicons name={progress >= 1 ? 'trophy' : 'flag'} size={20} color="#FFF" />
              <Text style={styles.awFinishBtnText}>
                {progress >= 1 ? 'Finish Workout 🎉' : 'Finish Workout'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // DEFAULT WORKOUT LIST VIEW (unchanged)
  // ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Workouts</Text>
        <View style={styles.headerStats}>
          <View style={[styles.miniStat, { backgroundColor: `${colors.green}15` }]}>
            <Ionicons name="checkmark-circle" size={14} color={colors.green} />
            <Text style={[styles.miniStatText, { color: colors.green }]}>{totalCompleted}</Text>
          </View>
          <View style={[styles.miniStat, { backgroundColor: `${colors.accent}15` }]}>
            <Ionicons name="flash" size={14} color={colors.accent} />
            <Text style={[styles.miniStatText, { color: colors.accent }]}>{totalAssigned}</Text>
          </View>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)} activeOpacity={0.7}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            <View style={[styles.tabBadge, tab === t.key && { backgroundColor: colors.accent }]}>
              <Text style={[styles.tabBadgeText, tab === t.key && { color: '#FFF' }]}>{t.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name={tab === 'completed' ? 'trophy-outline' : 'barbell-outline'} size={40} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>{tab === 'completed' ? 'No completed workouts' : tab === 'upcoming' ? 'No upcoming workouts' : 'No workouts yet'}</Text>
            <Text style={styles.emptyText}>Your trainer will assign workouts to you</Text>
          </View>
        }
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item: workout }) => {
          const s = statusConfig[workout.status] || statusConfig.assigned;
          const exercises = workout.workouts?.workout_exercises || [];
          const isExpanded = expandedId === workout.id;
          const isToday = new Date(workout.assigned_date).toDateString() === new Date().toDateString();
          const isAssigned = workout.status === 'assigned';

          // Today's assigned workout gets the premium Mission card
          if (isToday && isAssigned) {
            return (
              <TouchableOpacity activeOpacity={0.88} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpandedId(isExpanded ? null : workout.id); }}>
                <LinearGradient colors={isDark ? ['#1A1A24', '#22222E'] : ['#1C1C21', '#2A2A32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.missionCard}>
                  <View style={[styles.missionAccent, { backgroundColor: colors.accent }]} />
                  <View style={styles.missionHeader}>
                    <View>
                      <Text style={styles.missionLabel}>TODAY'S MISSION</Text>
                      <Text style={styles.missionName}>{workout.workouts?.name || 'Workout'}</Text>
                    </View>
                    <View style={[styles.missionBadge, { backgroundColor: `${colors.accent}25` }]}>
                      <Ionicons name="flash" size={14} color={colors.accent} />
                      <Text style={[styles.missionBadgeText, { color: colors.accent }]}>{exercises.length} exercises</Text>
                    </View>
                  </View>

                  {/* Exercise preview: first 2 visible, rest locked */}
                  <View style={styles.missionExList}>
                    {exercises.slice(0, isExpanded ? exercises.length : 2).map((ex: any, i: number) => (
                      <View key={i} style={styles.missionExRow}>
                        <View style={styles.missionExNum}><Text style={styles.missionExNumText}>{i + 1}</Text></View>
                        <Text style={styles.missionExName}>{ex.exercises?.name || 'Exercise'}</Text>
                        <Text style={styles.missionExSets}>{ex.sets}×{ex.reps}</Text>
                      </View>
                    ))}
                    {!isExpanded && exercises.length > 2 && (
                      <View style={styles.missionExRow}>
                        <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.3)" />
                        <Text style={styles.missionLockText}>{exercises.length - 2} more exercises locked</Text>
                        <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.3)" />
                      </View>
                    )}
                  </View>

                  {/* Actions — now starts Active Workout */}
                  <View style={styles.missionActions}>
                    <TouchableOpacity style={styles.missionCompleteBtn} onPress={() => startActiveWorkout(workout)}>
                      <Ionicons name="flash" size={18} color="#FFF" />
                      <Text style={styles.missionCompleteBtnText}>Start Workout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.missionSkipBtn} onPress={() => handleSkip(workout.id)}>
                      <Ionicons name="play-skip-forward" size={16} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            );
          }

          // Regular workout card
          return (
            <TouchableOpacity activeOpacity={0.88} onPress={() => setExpandedId(isExpanded ? null : workout.id)}>
              <Card style={styles.workoutCard}>
                <View style={styles.workoutHeader}>
                  <View style={[styles.statusIcon, { backgroundColor: s.bg }]}>
                    <Ionicons name={s.icon as any} size={18} color={s.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.workoutName}>{workout.workouts?.name || 'Workout'}</Text>
                    <View style={styles.workoutMetaRow}>
                      <Text style={styles.workoutDate}>{new Date(workout.assigned_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                      <Text style={styles.workoutDot}>·</Text>
                      <Text style={styles.workoutDate}>{exercises.length} exercises</Text>
                      {workout.workouts?.estimated_duration && (
                        <><Text style={styles.workoutDot}>·</Text><Text style={styles.workoutDate}>{workout.workouts.estimated_duration}min</Text></>
                      )}
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
                    <Text style={[styles.statusText, { color: s.text }]}>{s.label}</Text>
                  </View>
                </View>

                {/* Expanded exercise list */}
                {isExpanded && exercises.length > 0 && (
                  <View style={styles.exerciseList}>
                    {exercises.map((ex: any, i: number) => (
                      <View key={i} style={styles.exerciseRow}>
                        <View style={styles.exerciseIdx}><Text style={styles.exerciseIdxText}>{i + 1}</Text></View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exerciseName}>{ex.exercises?.name || 'Exercise'}</Text>
                          {ex.exercises?.muscle_group && <Text style={styles.exerciseMuscle}>{ex.exercises.muscle_group}</Text>}
                        </View>
                        <View style={styles.exerciseSetsPill}>
                          <Text style={styles.exerciseSetsText}>{ex.sets}×{ex.reps}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* Collapsed preview */}
                {!isExpanded && exercises.length > 0 && (
                  <View style={styles.collapsedPreview}>
                    <Text style={styles.collapsedText}>{exercises.slice(0, 3).map((e: any) => e.exercises?.name).filter(Boolean).join(' • ')}{exercises.length > 3 ? ` +${exercises.length - 3}` : ''}</Text>
                    <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                  </View>
                )}

                {/* Action buttons for assigned */}
                {isExpanded && isAssigned && (
                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.completeBtn} onPress={() => startActiveWorkout(workout)}>
                      <Ionicons name="flash" size={16} color="#FFF" />
                      <Text style={styles.completeBtnText}>Start Workout</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(workout.id)}>
                      <Text style={styles.skipBtnText}>Skip</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────

const getStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, marginBottom: Spacing.sm },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5, color: colors.textPrimary },
  headerStats: { flexDirection: 'row', gap: Spacing.sm },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  miniStatText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs },

  tabBar: { flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: colors.bgElevated, borderRadius: Radius.md, padding: 3 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: Radius.sm },
  tabActive: { backgroundColor: colors.bgCard, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary },
  tabTextActive: { color: colors.textPrimary },
  tabBadge: { backgroundColor: colors.bgHover, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, minWidth: 20, alignItems: 'center' },
  tabBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: colors.textTertiary },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 120 },
  sectionHeader: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.lg, marginBottom: Spacing.sm },

  // Mission card (today's workout)
  missionCard: { borderRadius: Radius.xl, padding: Spacing.lg, marginBottom: Spacing.md, overflow: 'hidden' },
  missionAccent: { position: 'absolute', top: 0, left: 0, width: 4, height: '100%' },
  missionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  missionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2 },
  missionName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: '#FFF', marginTop: 4 },
  missionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  missionBadgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10 },
  missionExList: { marginTop: Spacing.lg, gap: Spacing.sm },
  missionExRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  missionExNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  missionExNumText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  missionExName: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)' },
  missionExSets: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.45)' },
  missionLockText: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' },
  missionActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  missionCompleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.accent, paddingVertical: 12, borderRadius: Radius.md },
  missionCompleteBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFF' },
  missionSkipBtn: { width: 44, height: 44, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

  // Regular workout card
  workoutCard: { marginBottom: Spacing.sm },
  workoutHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  statusIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  workoutName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  workoutMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  workoutDate: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  workoutDot: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, textTransform: 'capitalize' },

  collapsedPreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  collapsedText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, flex: 1, marginRight: Spacing.sm },

  exerciseList: { marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: Spacing.sm },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  exerciseIdx: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  exerciseIdxText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.textTertiary },
  exerciseName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary },
  exerciseMuscle: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 1 },
  exerciseSetsPill: { backgroundColor: colors.bgElevated, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  exerciseSetsText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textSecondary },

  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  completeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.accent, paddingVertical: 10, borderRadius: Radius.md },
  completeBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#FFF' },
  skipBtn: { paddingHorizontal: Spacing.lg, paddingVertical: 10, borderRadius: Radius.md, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  skipBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textTertiary },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary },

  // ─── Active Workout Styles ──────────────────────────────────
  awHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.lg },
  awHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  awHeaderCenter: { flex: 1, alignItems: 'center' },
  awHeaderName: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, color: '#FFF' },
  awTimerPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
  },
  awTimerText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: '#FFF' },

  awProgressContainer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  awProgressTrack: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  awProgressFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  awProgressLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)' },

  awScrollView: { flex: 1 },
  awScrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 40 },

  // Exercise card
  awExCard: {
    backgroundColor: colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: colors.border,
    marginBottom: Spacing.md, overflow: 'hidden',
  },
  awExCardDone: { borderColor: `${colors.green}40` },
  awExHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  awExIdx: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  awExIdxText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary },
  awExName: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  awExMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2, flexWrap: 'wrap' },
  awExMuscle: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.accent,
    backgroundColor: `${colors.accent}12`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    overflow: 'hidden',
  },
  awExTarget: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  awExRest: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary },
  awExProgress: {
    backgroundColor: colors.bgElevated, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full,
  },
  awExProgressText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textSecondary },

  // Sets table
  awSetsContainer: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, borderTopWidth: 1, borderTopColor: colors.border },
  awSetHeaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  awSetHeaderText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 9, color: colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 1,
  },
  awSetRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.xs, borderRadius: Radius.sm,
    marginBottom: 4,
  },
  awSetRowDone: { backgroundColor: `${colors.green}08` },
  awSetNumContainer: { width: 40, alignItems: 'center' },
  awSetNum: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textSecondary },
  awSetInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  awSetInput: {
    flex: 1, fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary,
    backgroundColor: colors.bgInput, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 8,
    textAlign: 'center', borderWidth: 1, borderColor: colors.border,
  },
  awSetInputDone: { backgroundColor: `${colors.green}10`, borderColor: `${colors.green}30`, color: colors.green },
  awSetUnit: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, position: 'absolute', right: 8 },
  awCheckBtn: { width: 50, alignItems: 'center', justifyContent: 'center' },
  awCheckBtnDone: {},

  // Finish button
  awFinishBtn: { marginTop: Spacing.md, borderRadius: Radius.lg, overflow: 'hidden' },
  awFinishBtnPartial: {},
  awFinishBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    paddingVertical: 16, paddingHorizontal: Spacing.xl,
  },
  awFinishBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: '#FFF' },

  // Rest Timer Overlay
  awRestOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },
  awRestCard: { alignItems: 'center', padding: Spacing['3xl'] },
  awRestLabel: {
    fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.accent,
    letterSpacing: 4, textTransform: 'uppercase', marginBottom: Spacing.md,
  },
  awRestTime: { fontFamily: FontFamily.headingExtraBold, fontSize: 72, color: '#FFF', letterSpacing: -2 },
  awRestHint: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: 'rgba(255,255,255,0.4)', marginTop: Spacing.sm },
  awRestSkipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing['2xl'], backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: Radius.full,
  },
  awRestSkipText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: '#FFF' },

  // Summary screen
  awSummaryGradient: { flex: 1 },
  awSummaryContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  awSummaryTrophy: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: `${colors.accent}18`, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  awSummaryTitle: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], color: '#FFF', marginBottom: Spacing.xs },
  awSummaryName: { fontFamily: FontFamily.body, fontSize: FontSize.base, color: 'rgba(255,255,255,0.5)', marginBottom: Spacing['2xl'] },
  awSummaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md,
    width: '100%', marginBottom: Spacing['2xl'],
  },
  awSummaryStatCard: {
    width: '47%', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.lg, padding: Spacing.base, alignItems: 'center', gap: Spacing.xs,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  awSummaryStatValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: '#FFF' },
  awSummaryStatLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: 'rgba(255,255,255,0.4)' },
  awSummaryBreakdown: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.lg, padding: Spacing.base, marginBottom: Spacing['2xl'],
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  awSummaryExRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  awSummaryExDot: { width: 8, height: 8, borderRadius: 4 },
  awSummaryExName: { flex: 1, fontFamily: FontFamily.body, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)' },
  awSummaryExSets: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: 'rgba(255,255,255,0.5)' },
  awSummaryFinishBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: colors.accent, paddingVertical: 14, paddingHorizontal: Spacing['3xl'],
    borderRadius: Radius.lg, width: '100%', marginBottom: Spacing.md,
  },
  awSummaryFinishBtnText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: '#FFF' },
  awSummaryContinueBtn: { paddingVertical: Spacing.md },
  awSummaryContinueBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: 'rgba(255,255,255,0.4)' },
});
