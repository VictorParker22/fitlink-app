import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Vibration, Platform, Linking, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useClient } from '../../../context/ClientContext';

import ExerciseThumbnail from '../../../components/shared/exercise/ExerciseThumbnail';
import ExerciseMediaDemo from '../../../components/shared/exercise/ExerciseMediaDemo';
import ExerciseInstructions from '../../../components/shared/exercise/ExerciseInstructions';
import PRCelebrationModal from './PRCelebrationModal';
import { supabase } from '../../../lib/supabase';

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
  imageUrl?: string;
  videoUrl?: string;
  instructionText?: string;
  sets: SetLog[];
  expanded: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface ActiveWorkoutPlayerProps {
  activeWorkout: any;
  onFinishWorkout: (elapsedSeconds: number, exerciseStates: ExerciseState[]) => void;
  onCancelWorkout: () => void;
}

export default function ActiveWorkoutPlayer({
  activeWorkout,
  onFinishWorkout,
  onCancelWorkout,
}: ActiveWorkoutPlayerProps) {
  const { logExerciseSet, clearExerciseLogs, checkAndUpdatePr, clientData, trainer } = useClient();
  // This player renders inside the Train tab, so it sits under BOTH the status
  // bar / Dynamic Island and the floating tab bar. It had no safe-area
  // handling at all: the header ran under the notch and the finish button sat
  // behind the tab bar.
  const insets = useSafeAreaInsets();

  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
  // Rest preference for THIS session. Once the athlete says they are skipping
  // rest for the whole workout, the timer never opens again — no repeated
  // dismissal of the same sheet on every set.
  const [skipAllRest, setSkipAllRest] = useState(false);
  // The "for the rest of this workout" choice is only offered on the FIRST
  // rest — after that the athlete has already decided. Captured as state when
  // the sheet opens so the decision is stable for that whole showing.
  const restShownOnceRef = useRef(false);
  const [offerSkipAll, setOfferSkipAll] = useState(false);
  const openRestTimer = useCallback((seconds: number) => {
    setOfferSkipAll(!restShownOnceRef.current);
    restShownOnceRef.current = true;
    setRestTimeLeft(seconds);
    setShowRestTimer(true);
  }, []);
  // Rest seconds held back while a PR celebration Modal is on screen.
  const pendingRestRef = useRef<number | null>(null);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  // PR celebration state — null when no PR, populated when a new PR is hit mid-set
  const [pendingPr, setPendingPr] = useState<{ exerciseName: string; weight: number } | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoExerciseName, setVideoExerciseName] = useState('');

  const videoPlayer = useVideoPlayer(videoUrl || '', (player) => {
    if (videoUrl) player.play();
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize exercise states
  useEffect(() => {
    if (activeWorkout) {
      const exercises = activeWorkout.workouts?.workout_exercises || [];
      const states: ExerciseState[] = exercises.map((ex: any) => ({
        exerciseId: ex.exercise_id || ex.exercises?.id || `ex-${Math.random()}`,
        exerciseName: ex.exercises?.name || 'Exercise',
        muscleGroup: ex.exercises?.muscle_group || '',
        targetSets: ex.sets || 3,
        targetReps: ex.reps || 10,
        restSeconds: ex.rest_seconds || 60,
        imageUrl: ex.exercises?.image_url,
        videoUrl: ex.video_url,
        instructionText: ex.exercises?.instructions || '',
        sets: Array.from({ length: ex.sets || 3 }, () => ({
          weight: '',
          reps: String(ex.reps || 10),
          completed: false,
        })),
        expanded: false,
      }));
      if (states.length > 0) states[0].expanded = true;
      setExerciseStates(states);
      setElapsedSeconds(0);
    }
  }, [activeWorkout]);

  // Elapsed timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Rest countdown timer
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
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    };
  }, [showRestTimer, restTimeLeft]);

  const toggleExercise = useCallback((index: number) => {
    setExerciseStates((prev) =>
      prev.map((ex, i) => ({
        ...ex,
        expanded: i === index ? !ex.expanded : ex.expanded,
      }))
    );
  }, []);

  const updateSetValue = useCallback((exIdx: number, setIdx: number, field: 'weight' | 'reps', value: string) => {
    setExerciseStates((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const newSets = [...ex.sets];
        newSets[setIdx] = { ...newSets[setIdx], [field]: value };
        return { ...ex, sets: newSets };
      })
    );
  }, []);

  const completeSet = useCallback((exIdx: number, setIdx: number) => {
    const updated = exerciseStates.map((ex, i) => {
      if (i !== exIdx) return ex;
      const newSets = [...ex.sets];
      const wasCompleted = newSets[setIdx].completed;
      newSets[setIdx] = { ...newSets[setIdx], completed: !wasCompleted };
      return { ...ex, sets: newSets };
    });

    const exercise = updated[exIdx];
    const set = exercise.sets[setIdx];

    if (set.completed && activeWorkout) {
      const weight = parseFloat(set.weight) || 0;
      logExerciseSet(
        activeWorkout.id,
        exercise.exerciseId,
        setIdx,
        weight,
        parseInt(set.reps) || 0
      );

      // ── PR Detection ──────────────────────────────────────────────────
      // Only check when a positive weight is entered; bodyweight exercises
      // (weight === 0) intentionally skip PR checking.
      const isPr = weight > 0 && checkAndUpdatePr(exercise.exerciseId, weight);
      if (isPr) {
        setPendingPr({ exerciseName: exercise.exerciseName, weight });
        // Notify coach — fire-and-forget, never block the workout UI
        if (clientData?.trainer_id) {
          // Insert notification row for the coach dashboard
          (async () => {
            const { error } = await supabase.from('notifications').insert({
              trainer_id: clientData.trainer_id,
              type: 'score',
              title: 'New personal record',
              description: `${clientData.name} just hit a new ${exercise.exerciseName} PR at ${weight} lbs!`,
              metadata: { client_id: clientData.id, exercise: exercise.exerciseName, weight },
              is_read: false,
            });
            if (error && __DEV__) console.warn('[ActiveWorkoutPlayer] PR notification insert failed:', error);
          })();
          // Push notification to trainer's device
          if (trainer?.expo_push_token) {
            supabase.functions.invoke('send-push-notification', {
              body: {
                pushToken: trainer.expo_push_token,
                title: 'New PR',
                body: `${clientData.name} just hit a new ${exercise.exerciseName} PR at ${weight} lbs!`,
                data: { url: `/client/${clientData.id}` },
              },
            }).catch(() => { /* silent fail */ });
          }
        }
      }
      if (exercise.restSeconds > 0 && !skipAllRest) {
        if (isPr) {
          // Two native Modals must never be visible at once (documented iOS
          // freeze). A set that is both a PR and rest-timed used to open the
          // celebration and the rest timer in the same commit — queue the rest
          // timer and start it once the celebration has been dismissed.
          pendingRestRef.current = exercise.restSeconds;
        } else {
          openRestTimer(exercise.restSeconds);
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      const allDone = exercise.sets.every((s) => s.completed);
      if (allDone && exIdx < updated.length - 1) {
        updated[exIdx + 1] = { ...updated[exIdx + 1], expanded: true };
      }
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    setExerciseStates(updated);
  }, [exerciseStates, activeWorkout, logExerciseSet]);

  const handleFinish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onFinishWorkout(elapsedSeconds, exerciseStates);
  };

  const handleConfirmCancel = () => {
    const leave = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      clearExerciseLogs();
      onCancelWorkout();
    };
    const anyLogged = exerciseStates.some((ex) => ex.sets.some((set) => set.completed));
    if (!anyLogged) {
      // Nothing committed yet — no "end workout" interrogation, just leave.
      Alert.alert('Leave workout?', 'Nothing has been logged yet.', [
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', onPress: leave },
      ]);
      return;
    }
    Alert.alert('End workout?', 'Your progress will be lost.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'End', style: 'destructive', onPress: leave },
    ]);
  };

  const getExerciseVideoUrl = (exerciseId: string): string | undefined => {
    if (!activeWorkout) return undefined;
    const workoutExercises = activeWorkout.workouts?.workout_exercises || [];
    const we = workoutExercises.find((w: any) => w.exercise_id === exerciseId || w.exercises?.id === exerciseId);
    return we?.video_url;
  };

  const handlePlayVideo = (url: string, exerciseName?: string) => {
    if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('instagram.com') || url.includes('tiktok.com')) {
      Linking.openURL(url);
    } else {
      setVideoExerciseName(exerciseName || 'Exercise demo');
      setVideoUrl(url);
      setShowVideoModal(true);
    }
  };

  const totalSets = exerciseStates.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exerciseStates.reduce((sum, ex) => sum + ex.sets.filter((s) => s.completed).length, 0);
  const progress = totalSets > 0 ? completedSets / totalSets : 0;

  return (
    <View style={s.container}>
      {/* Rest Timer Overlay */}
      <Modal visible={showRestTimer} transparent animationType="fade" onRequestClose={() => setShowRestTimer(false)}>
        <View style={s.restOverlay}>
          <View style={s.restCard}>
            <View
              accessible
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Rest timer. ${formatTime(restTimeLeft)} remaining. Breathe and prepare for the next set.`}
            >
              <Text style={s.restTag}>Rest timer</Text>
              <Text style={s.restTime}>{formatTime(restTimeLeft)}</Text>
              <Text style={s.restHint}>Breathe and prepare for next set</Text>
            </View>
            <TouchableOpacity
              style={s.restSkipBtn}
              onPress={() => {
                setShowRestTimer(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Skip rest"
              accessibilityHint="Ends the rest timer and returns to the workout"
            >
              <Ionicons name="play-skip-forward" size={16} color={CoachColors.onAccent} />
              <Text style={s.restSkipText}>Skip rest</Text>
            </TouchableOpacity>

            {/* Offered on the FIRST rest only — after that the athlete has
                already made the call, and repeating it is the nag we are
                removing. Applies to this session only; the coach's rest
                targets are untouched and it resets next workout. */}
            {offerSkipAll && (
              <TouchableOpacity
                style={s.restSkipAllBtn}
                onPress={() => {
                  setSkipAllRest(true);
                  setShowRestTimer(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Skip rest for the rest of this workout"
                accessibilityHint="Rest timers will not open again during this session"
              >
                <Text style={s.restSkipAllText}>Skip rest for this workout</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <View style={s.headerTop}>
          <TouchableOpacity
            onPress={handleConfirmCancel}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close workout"
          >
            <Ionicons name="close" size={25} color={CoachColors.textSecondary} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.tagHeader}>Active session</Text>
            <Text style={s.workoutName} numberOfLines={1}>
              {activeWorkout?.workouts?.name || 'Workout'}
            </Text>
          </View>
          {/* A way back: skipping rest for the session is reversible, so the
              athlete is never locked out of their coach's rest targets. */}
          {skipAllRest && (
            <TouchableOpacity
              style={s.restOffPill}
              onPress={() => {
                setSkipAllRest(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Rest timers off. Double tap to turn them back on"
            >
              <Ionicons name="timer-outline" size={13} color={CoachColors.textMuted} />
              <Text style={s.restOffText}>Rest off</Text>
            </TouchableOpacity>
          )}
          <View style={s.timerPill}>
            <Ionicons name="time-outline" size={13} color={CoachColors.accent} />
            <Text style={s.timerText}>{formatDuration(elapsedSeconds)}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View
          style={s.progressRow}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Workout progress"
          accessibilityValue={{ min: 0, max: totalSets, now: completedSets, text: `${completedSets} of ${totalSets} sets done` }}
        >
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.progressLabel}>{completedSets}/{totalSets} sets</Text>
        </View>
      </View>

      {/* Exercise List */}
      <ScrollView keyboardShouldPersistTaps="handled" style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {exerciseStates.map((exercise, exIdx) => {
          const completedInEx = exercise.sets.filter((s) => s.completed).length;
          const allDone = completedInEx === exercise.sets.length;

          return (
            <View key={exIdx} style={[s.exCard, allDone && s.exCardDone]}>
              <TouchableOpacity
                style={s.exHeader}
                onPress={() => toggleExercise(exIdx)}
                activeOpacity={0.7}
                accessible
                accessibilityRole="button"
                accessibilityState={{ expanded: exercise.expanded }}
                accessibilityLabel={`${exercise.exerciseName}, ${exercise.targetSets} sets of ${exercise.targetReps} reps${exercise.restSeconds > 0 ? `, ${exercise.restSeconds} seconds rest` : ''}, ${completedInEx} of ${exercise.sets.length} sets logged${allDone ? ', all done' : ''}`}
                accessibilityHint={exercise.expanded ? 'Collapses this exercise' : 'Expands this exercise to log your sets'}
              >
                <View style={{ position: 'relative' }}>
                  <ExerciseThumbnail
                    imageUrl={exercise.imageUrl}
                    hasVideo={!!exercise.videoUrl}
                    size={44}
                  />
                  {allDone && (
                    <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: CoachColors.surface, borderRadius: 10, padding: 2 }}>
                      <Ionicons name="checkmark-circle" size={18} color={CoachColors.accent} />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>{exercise.exerciseName}</Text>
                  <View style={s.exMeta}>
                    <Text style={s.exTarget}>
                      {exercise.targetSets} sets • {exercise.targetReps} reps
                    </Text>
                    {exercise.restSeconds > 0 && (
                      <Text style={s.exRestTag}>
                        • {exercise.restSeconds}s rest
                      </Text>
                    )}
                  </View>
                </View>

                <Ionicons
                  name={exercise.expanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={CoachColors.textMuted}
                />
              </TouchableOpacity>

              {/* Expanded Media & Sets */}
              {exercise.expanded && (
                <View style={s.expandedContent}>
                  <View style={{ marginBottom: 16 }}>
                    <ExerciseMediaDemo
                      imageUrl={exercise.imageUrl}
                      videoUrl={exercise.videoUrl}
                      exerciseName={exercise.exerciseName}
                      onPlayVideo={handlePlayVideo}
                    />
                    <ExerciseInstructions
                      exerciseId={exercise.exerciseId}
                      instructionText={exercise.instructionText}
                      muscleGroup={exercise.muscleGroup}
                    />
                  </View>

                  <View style={s.setsContainer}>
                    <View style={s.setHeaderRow}>
                      <Text style={[s.setHeaderText, { width: 36 }]}>Set</Text>
                      <Text style={[s.setHeaderText, { flex: 1 }]}>Weight (lbs)</Text>
                      <Text style={[s.setHeaderText, { flex: 1 }]}>Reps</Text>
                      <Text style={[s.setHeaderText, { width: 44, textAlign: 'center' }]}>Log</Text>
                    </View>

                    {exercise.sets.map((set, setIdx) => (
                      <View key={setIdx} style={[s.setRow, set.completed && s.setRowDone]}>
                      <View style={s.setNumBox}>
                        <Text style={[s.setNumText, set.completed && { color: CoachColors.accent }]}>{setIdx + 1}</Text>
                      </View>

                      <View style={s.setInputBox}>
                        <TextInput
                          style={[s.setInput, set.completed && s.setInputDone]}
                          value={set.weight}
                          onChangeText={(v) => updateSetValue(exIdx, setIdx, 'weight', v)}
                          placeholder="0"
                          placeholderTextColor={CoachColors.textFaint}
                          keyboardType="numeric"
                          editable={!set.completed}
                          selectTextOnFocus
                          accessibilityLabel={`${exercise.exerciseName}, set ${setIdx + 1}, weight in pounds`}
                          accessibilityState={{ disabled: set.completed }}
                          accessibilityHint={set.completed ? 'Locked because this set is already logged' : undefined}
                        />
                      </View>

                      <View style={s.setInputBox}>
                        <TextInput
                          style={[s.setInput, set.completed && s.setInputDone]}
                          value={set.reps}
                          onChangeText={(v) => updateSetValue(exIdx, setIdx, 'reps', v)}
                          placeholder="0"
                          placeholderTextColor={CoachColors.textFaint}
                          keyboardType="numeric"
                          editable={!set.completed}
                          selectTextOnFocus
                          accessibilityLabel={`${exercise.exerciseName}, set ${setIdx + 1}, reps`}
                          accessibilityState={{ disabled: set.completed }}
                          accessibilityHint={set.completed ? 'Locked because this set is already logged' : undefined}
                        />
                      </View>

                      <TouchableOpacity hitSlop={4}
                        style={[s.checkBtn, set.completed && s.checkBtnDone]}
                        onPress={() => completeSet(exIdx, setIdx)}
                        activeOpacity={0.6}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: set.completed }}
                        accessibilityLabel={`Log set ${setIdx + 1} of ${exercise.exerciseName}`}
                      >
                        <Ionicons
                          name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={set.completed ? CoachColors.accent : CoachColors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Finish Button */}
        <TouchableOpacity
          style={[s.finishBtn, progress >= 1 && s.finishBtnReady]}
          onPress={handleFinish}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={progress >= 1 ? 'Finish session' : 'Complete workout'}
          accessibilityHint={progress >= 1
            ? 'Saves this session'
            : `You still have ${totalSets - completedSets} set${totalSets - completedSets === 1 ? '' : 's'} left. Finishing now saves what you have done`}
        >
          <Ionicons name={progress >= 1 ? 'trophy' : 'flag'} size={20} color={progress >= 1 ? CoachColors.onAccent : CoachColors.textPrimary} />
          <Text style={[s.finishBtnText, progress >= 1 && { color: CoachColors.onAccent }]}>
            {progress >= 1 ? 'Finish session' : 'Complete workout'}
          </Text>
        </TouchableOpacity>

        {/* Clears the floating tab bar (paddingTop 11 + button ~44 +
            max(inset, 14)) plus the home indicator. A flat 60 left the finish
            button partly behind the bar. */}
        <View style={{ height: Math.max(insets.bottom, 14) + 70 }} />
      </ScrollView>

      {/* Video Modal */}
      <Modal
        visible={showVideoModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowVideoModal(false);
          setVideoUrl(null);
        }}
      >
        <View style={s.videoModalOverlay}>
          <View style={s.videoModalHeader}>
            <TouchableOpacity hitSlop={4}
              style={s.videoCloseBtn}
              onPress={() => {
                setShowVideoModal(false);
                setVideoUrl(null);
              }}
              accessibilityRole="button"
              accessibilityLabel="Close video"
            >
              <Ionicons name="close" size={22} color={CoachColors.textPrimary} />
            </TouchableOpacity>
            <Text style={s.videoModalTitle} numberOfLines={1}>
              {videoExerciseName}
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={s.videoModalCard}>
            {videoUrl && (
              <VideoView player={videoPlayer} style={s.videoPlayer} nativeControls />
            )}
          </View>
        </View>
      </Modal>

      {/* ── PR Celebration Overlay ─────────────────────────────────────────── */}
      {/* Rendered inside the player so it sits on top of everything mid-workout */}
      <PRCelebrationModal
        visible={pendingPr !== null}
        exerciseName={pendingPr?.exerciseName ?? ''}
        weight={pendingPr?.weight ?? 0}
        onDismiss={() => {
          setPendingPr(null);
          const rest = pendingRestRef.current;
          pendingRestRef.current = null;
          // Let the celebration finish dismissing before the next Modal opens.
          if (rest && rest > 0 && !skipAllRest) {
            setTimeout(() => openRestTimer(rest), 300);
          }
        }}
      />
    </View>
  );
}


const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: {
    backgroundColor: CoachColors.bg,
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerCenter: { flex: 1, marginHorizontal: 12 },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  workoutName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timerText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: CoachColors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: CoachColors.accent,
    borderRadius: 2,
  },
  progressLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  exCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  exCardDone: { borderColor: CoachColors.accent },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exIdxBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exIdxBoxDone: {
    backgroundColor: CoachColors.accentSofter,
    borderColor: CoachColors.accent,
  },
  exIdxText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textPrimary,
  },
  exName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  exMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  exTarget: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 0.8,
  },
  exRestTag: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textFaint,
  },
  watchDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
  },
  watchDemoText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 1,
  },
  setsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
    gap: 8,
  },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  setHeaderText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setRowDone: { opacity: 0.8 },
  setNumBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: CoachColors.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  setInputBox: {
    flex: 1,
    height: 43,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  setInput: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  setInputDone: { color: CoachColors.accent },
  checkBtn: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBtnDone: {},
  finishBtn: {
    height: 48,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  finishBtnReady: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  finishBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
    letterSpacing: 1,
  },
  restOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  restCard: {
    width: '100%',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  restTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  restTime: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 54,
    color: CoachColors.textPrimary,
    letterSpacing: -1,
    marginBottom: 4,
  },
  restHint: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textSecondary,
    marginBottom: 20,
  },
  restSkipBtn: {
    width: '100%',
    height: 44,
    backgroundColor: CoachColors.accent,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  restOffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 26,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    marginRight: 6,
  },
  restOffText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  restSkipAllBtn: {
    width: '100%',
    minHeight: 44,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restSkipAllText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textSecondary,
  },
  restSkipText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.onAccent,
    letterSpacing: 1,
  },
  videoModalOverlay: {
    flex: 1,
    backgroundColor: CoachColors.bg,
    paddingTop: 50,
  },
  videoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  videoCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModalTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
  },
  videoModalCard: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 40,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  videoPlayer: { flex: 1 },
  expandedContent: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
});
