import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, Vibration, Platform, Linking, Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { useClient } from '../../../context/ClientContext';

import ExerciseMediaDemo from '../../../components/shared/exercise/ExerciseMediaDemo';
import ExerciseInstructions from '../../../components/shared/exercise/ExerciseInstructions';
import PRCelebrationModal from './PRCelebrationModal';
import MuscleMap from '../../anatomy/MuscleMap';
import SessionSetRow from '../workout/SessionSetRow';
import { muscleInfoForExercise, targetsLine, type WorkoutMuscleInfo } from '../season/workoutMuscles';
import { supabase } from '../../../lib/supabase';

interface SetLog {
  weight: string;
  reps: string;
  completed: boolean;
  /** Stopwatch time, only when the athlete chose to time this set. */
  seconds?: number;
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
  /** This exercise's own regions — the card's portrait. Null when unmappable. */
  muscleInfo: WorkoutMuscleInfo | null;
  /** Which face the expanded card shows: what it does to you, or how to do it. */
  mediaView: 'muscles' | 'demo';
  sets: SetLog[];
  expanded: boolean;
}

/** Which set owns the single running stopwatch. Only one set can, ever. */
type RunningSet = { exIdx: number; setIdx: number; startedAt: number };

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
  // "Skip rest for this workout" is offered on EVERY rest, not just the first.
  // It used to appear once and never again, on the theory that the athlete had
  // already decided — but the decision people actually want to make is "I have
  // had enough of resting NOW", four sets in, and by then the only control was
  // gone. Offering it every time costs one line in a sheet that is already
  // open; hiding it costs the athlete the choice.
  const openRestTimer = useCallback((seconds: number) => {
    setRestTimeLeft(seconds);
    setShowRestTimer(true);
  }, []);

  // ── The set stopwatch ────────────────────────────────────────────────────
  // One timer for the whole session, held here rather than inside the row:
  // collapsing an exercise unmounts its rows, and a timer that dies when you
  // look at the next exercise is a timer you cannot trust. You also cannot do
  // two sets at once, so a single running set is the honest model.
  const [runningSet, setRunningSet] = useState<RunningSet | null>(null);
  const [runningElapsed, setRunningElapsed] = useState(0);
  // Auto-time carries across sets once the athlete turns it on — same spirit as
  // "skip rest for this workout": decide once, mid-flow, no repeated taps.
  const [autoTime, setAutoTime] = useState(false);
  // The set to auto-start once rest finishes, when auto-time is on.
  const pendingAutoRef = useRef<{ exIdx: number; setIdx: number } | null>(null);
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
      const states: ExerciseState[] = exercises.map((ex: any) => {
        const muscleInfo = muscleInfoForExercise(ex);
        return {
          exerciseId: ex.exercise_id || ex.exercises?.id || `ex-${Math.random()}`,
          exerciseName: ex.exercises?.name || 'Exercise',
          muscleGroup: ex.exercises?.muscle_group || '',
          targetSets: ex.sets || 3,
          targetReps: ex.reps || 10,
          restSeconds: ex.rest_seconds || 60,
          imageUrl: ex.exercises?.image_url,
          videoUrl: ex.video_url,
          instructionText: ex.exercises?.instructions || '',
          muscleInfo,
          // Opens on the DEMO. The first question at the rack is "what am I
          // actually doing", and you answer it by watching the movement — the
          // body is the follow-up. Falls back to muscles only when there is no
          // demo media at all, so the panel is never empty.
          mediaView:
            ex.video_url || ex.exercises?.image_url ? ('demo' as const) : ('muscles' as const),
          sets: Array.from({ length: ex.sets || 3 }, () => ({
            weight: '',
            reps: String(ex.reps || 10),
            completed: false,
          })),
          expanded: false,
        };
      });
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

  // Ticks the visible stopwatch. The VALUE is always derived from the start
  // timestamp, never accumulated from ticks — a JS thread that stalls (or a
  // phone that sleeps mid-set) drops ticks, and a counter built from them would
  // quietly under-report the athlete's real time under tension.
  useEffect(() => {
    if (!runningSet) return;
    const tick = () => setRunningElapsed(Math.floor((Date.now() - runningSet.startedAt) / 1000));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [runningSet]);

  /** Stops the stopwatch and writes its seconds onto the set it belonged to. */
  const stopSetTimer = useCallback((): number => {
    if (!runningSet) return 0;
    const elapsed = Math.max(0, Math.floor((Date.now() - runningSet.startedAt) / 1000));
    const { exIdx, setIdx } = runningSet;
    setExerciseStates((prev) =>
      prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        const sets = [...ex.sets];
        sets[setIdx] = { ...sets[setIdx], seconds: elapsed > 0 ? elapsed : undefined };
        return { ...ex, sets };
      })
    );
    setRunningSet(null);
    setRunningElapsed(0);
    return elapsed;
  }, [runningSet]);

  const startSetTimer = useCallback((exIdx: number, setIdx: number) => {
    // Starting a new set's timer ends the previous one rather than racing it.
    if (runningSet && (runningSet.exIdx !== exIdx || runningSet.setIdx !== setIdx)) stopSetTimer();
    setRunningSet({ exIdx, setIdx, startedAt: Date.now() });
    setRunningElapsed(0);
  }, [runningSet, stopSetTimer]);

  const toggleSetTimer = useCallback((exIdx: number, setIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (runningSet && runningSet.exIdx === exIdx && runningSet.setIdx === setIdx) stopSetTimer();
    else startSetTimer(exIdx, setIdx);
  }, [runningSet, startSetTimer, stopSetTimer]);

  /**
   * Closes the rest sheet and, when auto-time is on, starts the next set's
   * stopwatch. Every way out of rest funnels through here — countdown expiry,
   * "Skip rest", and "Skip rest for this workout" — so the athlete cannot end
   * up back on the floor with a timer that silently did not start.
   */
  const closeRest = useCallback(() => {
    setShowRestTimer(false);
    const next = pendingAutoRef.current;
    pendingAutoRef.current = null;
    if (next && autoTime) startSetTimer(next.exIdx, next.setIdx);
  }, [autoTime, startSetTimer]);

  // Rest countdown. Declared after closeRest because it depends on it —
  // referencing it any earlier would hit the temporal dead zone on first render.
  useEffect(() => {
    if (showRestTimer && restTimeLeft > 0) {
      restTimerRef.current = setInterval(() => {
        setRestTimeLeft((t) => {
          if (t <= 1) {
            closeRest();
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
  }, [showRestTimer, restTimeLeft, closeRest]);

  const setMediaView = useCallback((index: number, view: 'muscles' | 'demo') => {
    Haptics.selectionAsync();
    setExerciseStates((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, mediaView: view } : ex))
    );
  }, []);

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
    // Logging a set that is being timed stops its stopwatch — pressing "log"
    // IS the end of the set, and making the athlete stop the timer separately
    // would just record their reaction time on top of their work.
    //
    // Folded into the same state update rather than calling stopSetTimer():
    // that helper writes through setExerciseStates, and the `updated` array
    // below is built from the pre-update `exerciseStates`, so the two writes
    // would race and the last one would win. This is exactly the shape that
    // loses data silently.
    let timedSeconds: number | undefined;
    if (runningSet && runningSet.exIdx === exIdx && runningSet.setIdx === setIdx) {
      const elapsed = Math.max(0, Math.floor((Date.now() - runningSet.startedAt) / 1000));
      if (elapsed > 0) timedSeconds = elapsed;
      setRunningSet(null);
      setRunningElapsed(0);
    }

    const updated = exerciseStates.map((ex, i) => {
      if (i !== exIdx) return ex;
      const newSets = [...ex.sets];
      const wasCompleted = newSets[setIdx].completed;
      newSets[setIdx] = {
        ...newSets[setIdx],
        completed: !wasCompleted,
        ...(timedSeconds ? { seconds: timedSeconds } : {}),
      };
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
        parseInt(set.reps) || 0,
        undefined,
        set.seconds
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
      // ── Auto-time hand-off ────────────────────────────────────────────────
      // When auto-time is on, the next set in this exercise starts its own
      // stopwatch as soon as rest is over (or immediately, when rest is off).
      //
      // It deliberately does NOT start when an exercise is merely expanded:
      // opening a card is a look, and this app's preview-before-commit rule
      // says nothing that runs a clock may begin on a bare tap. Logging a set
      // is an explicit commit, so chaining from there is fair.
      const nextIdx = exercise.sets.findIndex((sl, i) => i > setIdx && !sl.completed);
      const willRest = exercise.restSeconds > 0 && !skipAllRest;
      if (autoTime && nextIdx !== -1) {
        if (willRest) pendingAutoRef.current = { exIdx, setIdx: nextIdx };
        else startSetTimer(exIdx, nextIdx);
      }

      if (willRest) {
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
      // Carry the weight forward to every later set of this exercise that the
      // athlete has not already given a value. This is what makes sets 2 and 3
      // a single tap on "Log set": the same load is the overwhelmingly common
      // case, and re-typing it three times was most of the cost of logging.
      // Only EMPTY sets are filled — a value they entered themselves is never
      // overwritten, including one they deliberately dropped for a back-off set.
      // Rebuilt rather than mutated: the untouched set objects in `updated` are
      // still the same references the previous state holds, and writing through
      // them would edit rendered state in place — the shape that produces "it
      // only updates when something else re-renders" bugs.
      if (set.weight) {
        updated[exIdx] = {
          ...exercise,
          sets: exercise.sets.map((later, i) =>
            i > setIdx && !later.completed && !later.weight
              ? { ...later, weight: set.weight }
              : later
          ),
        };
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
    // Full dependency list. The old one named three of these and got away with
    // it only because `exerciseStates` changes on every set, rebuilding the
    // callback often enough to hide the stale reads — `skipAllRest` in
    // particular was captured from a render before the athlete turned rest off.
  }, [
    exerciseStates, activeWorkout, logExerciseSet, checkAndUpdatePr, clientData, trainer,
    skipAllRest, openRestTimer, runningSet, autoTime, startSetTimer,
  ]);

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
      <Modal visible={showRestTimer} transparent animationType="fade" onRequestClose={closeRest}>
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
                closeRest();
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

            {/* Offered on EVERY rest. The mind people change is "I have had
                enough of resting" four sets in — offering this only on the
                first rest put the control furthest from the moment it is
                wanted. Session-scoped: the coach's rest targets are untouched
                and it resets next workout, and the header pill turns it back
                on the instant they want rest again. */}
            <TouchableOpacity
              style={s.restSkipAllBtn}
              onPress={() => {
                setSkipAllRest(true);
                closeRest();
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Skip rest for the rest of this workout"
              accessibilityHint="Rest timers stop opening for this session. You can turn them back on from the header at any time"
            >
              <Text style={s.restSkipAllText}>Skip rest for this workout</Text>
            </TouchableOpacity>
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

        {/* Session controls. Both live here rather than appearing only when
            already switched on: a preference you can reach at any point is a
            preference you can change your mind about mid-workout, which is the
            whole point of them. */}
        <View style={s.controlRow}>
          <TouchableOpacity
            style={[s.controlPill, autoTime && s.controlPillOn]}
            onPress={() => {
              setAutoTime((v) => !v);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="switch"
            accessibilityState={{ checked: autoTime }}
            accessibilityLabel="Auto-time sets"
            accessibilityHint="Starts the stopwatch on your next set as soon as rest ends"
          >
            <Ionicons
              name="stopwatch-outline"
              size={14}
              color={autoTime ? CoachColors.accent : CoachColors.textMuted}
            />
            <Text style={[s.controlText, autoTime && s.controlTextOn]}>Auto-time sets</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.controlPill, skipAllRest && s.controlPillOff]}
            onPress={() => {
              setSkipAllRest((v) => !v);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="switch"
            accessibilityState={{ checked: !skipAllRest }}
            accessibilityLabel={skipAllRest ? 'Rest timers off' : 'Rest timers on'}
            accessibilityHint={
              skipAllRest
                ? 'Turns your coach’s rest timers back on'
                : 'Stops rest timers opening for the rest of this session'
            }
          >
            <Ionicons
              name={skipAllRest ? 'ban-outline' : 'timer-outline'}
              size={14}
              color={skipAllRest ? CoachColors.textMuted : CoachColors.textSecondary}
            />
            <Text style={[s.controlText, skipAllRest && { color: CoachColors.textMuted }]}>
              {skipAllRest ? 'Rest off' : 'Rest on'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Exercise List */}
      {/* Typing is the secondary path now, but when it does happen the keyboard
          must not sit on top of the field. `padding` is iOS-only on purpose:
          on Android it double-compensates against adjustResize and pushes the
          content off screen instead. `on-drag` dismissal means scrolling to the
          next exercise puts the keyboard away without a second tap. */}
      <KeyboardAvoidingView
        style={s.scroll}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {exerciseStates.map((exercise, exIdx) => {
          const completedInEx = exercise.sets.filter((s) => s.completed).length;
          const allDone = completedInEx === exercise.sets.length;
          // Which face the panel can actually show. Resolved here rather than
          // trusted from state: an exercise with no demo media must never land
          // on the demo face, whatever the stored preference says.
          const hasDemo = !!(exercise.videoUrl || exercise.imageUrl);
          const showMuscles = !!exercise.muscleInfo && (exercise.mediaView === 'muscles' || !hasDemo);

          return (
            <View key={exIdx} style={[s.exCard, allDone && s.exCardDone]}>
              {/* The card head, in the same anatomy as MealCard/WorkoutCard —
                  round portrait, oversized title, meta line — laid out
                  horizontally because six of these stack on one screen
                  mid-session and the browse card's vertical stack would push
                  the sets you are working on below the fold. */}
              <TouchableOpacity
                style={s.exHeader}
                onPress={() => toggleExercise(exIdx)}
                activeOpacity={0.75}
                accessible
                accessibilityRole="button"
                accessibilityState={{ expanded: exercise.expanded }}
                accessibilityLabel={`${exercise.exerciseName}, ${exercise.targetSets} sets of ${exercise.targetReps} reps${exercise.restSeconds > 0 ? `, ${exercise.restSeconds} seconds rest` : ''}, ${completedInEx} of ${exercise.sets.length} sets logged${allDone ? ', all done' : ''}`}
                accessibilityHint={exercise.expanded ? 'Collapses this exercise' : 'Expands this exercise to log your sets'}
              >
                {/* The portrait, on COLLAPSED cards only. Once the card opens,
                    the body gets the full media panel below and a thumbnail of
                    the same thing beside the title would be a smaller, worse
                    copy of it. Nothing at all when the muscles do not map and
                    there is no photo — a blank silhouette would be a
                    placeholder pretending to be information. */}
                {!exercise.expanded && (
                  exercise.muscleInfo ? (
                    <View style={s.portrait}>
                      <MuscleMap
                        primary={exercise.muscleInfo.primary}
                        secondary={exercise.muscleInfo.secondary}
                        view={exercise.muscleInfo.view}
                        height={72}
                      />
                    </View>
                  ) : exercise.imageUrl ? (
                    <Image source={{ uri: exercise.imageUrl }} style={s.portrait} resizeMode="cover" />
                  ) : null
                )}

                <View style={{ flex: 1 }}>
                  <Text style={s.exEyebrow}>
                    Exercise {exIdx + 1} of {exerciseStates.length}
                  </Text>
                  <Text style={s.exName} numberOfLines={2}>{exercise.exerciseName}</Text>
                  <Text style={s.exTarget} numberOfLines={1}>
                    {exercise.targetSets} sets · {exercise.targetReps} reps
                    {exercise.restSeconds > 0 ? ` · ${exercise.restSeconds}s rest` : ''}
                  </Text>
                </View>

                {/* The card language's circular action, carrying this
                    exercise's real progress rather than a decorative chevron.
                    The chevron survives underneath it, small: the circle says
                    where you are, but nothing else on a collapsed card says
                    "this opens", and an undiscoverable card is worse than a
                    slightly busier one. */}
                <View style={s.exAction}>
                  <View style={[s.exProgress, allDone && s.exProgressDone]}>
                    {allDone ? (
                      <Ionicons name="checkmark" size={24} color={CoachColors.onAccent} />
                    ) : (
                      <Text style={s.exProgressText}>
                        {completedInEx}/{exercise.sets.length}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name={exercise.expanded ? 'chevron-up' : 'chevron-down'}
                    size={15}
                    color={CoachColors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {/* Expanded Media & Sets */}
              {exercise.expanded && (
                <View style={s.expandedContent}>
                  <View style={{ marginBottom: 16 }}>
                    {/* ── The media panel ──────────────────────────────────
                        The body and the demo are two answers to two different
                        questions — "what will this do to me" and "how do I do
                        it" — and they were competing for the same vertical
                        space, which is how the anatomy ended up a 72pt
                        thumbnail beside a full-width GIF. One panel, two
                        faces: each gets the whole width, and the card gets no
                        taller. The switch only appears when both faces exist. */}
                    {/* Both faces, or no switch. A tab pair where one tab leads
                        nowhere is worse than no tabs — and "Demo" is first
                        because watching the movement is the first question. */}
                    {hasDemo && exercise.muscleInfo && (
                      <View style={s.mediaTabs}>
                        {(['demo', 'muscles'] as const).map((view) => {
                          const on = showMuscles === (view === 'muscles');
                          return (
                            <TouchableOpacity
                              key={view}
                              style={[s.mediaTab, on && s.mediaTabOn]}
                              onPress={() => setMediaView(exIdx, view)}
                              activeOpacity={0.8}
                              accessibilityRole="tab"
                              accessibilityState={{ selected: on }}
                              accessibilityLabel={view === 'muscles' ? 'Muscles worked' : 'Movement demo'}
                            >
                              <Ionicons
                                name={view === 'muscles' ? 'body-outline' : 'play-circle-outline'}
                                size={15}
                                color={on ? CoachColors.onAccent : CoachColors.textMuted}
                              />
                              <Text style={[s.mediaTabText, on && s.mediaTabTextOn]}>
                                {view === 'muscles' ? 'Muscles' : 'Demo'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}

                    {showMuscles && exercise.muscleInfo ? (
                      <View style={s.anatomyPanel}>
                        <MuscleMap
                          primary={exercise.muscleInfo.primary}
                          secondary={exercise.muscleInfo.secondary}
                          view={exercise.muscleInfo.view}
                          height={196}
                        />
                        {/* The picture said in words — for anyone who cannot
                            see it, and for anyone who does not read anatomy. */}
                        {targetsLine(exercise.muscleInfo) ? (
                          <Text style={s.anatomyCaption}>
                            {targetsLine(exercise.muscleInfo)}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <ExerciseMediaDemo
                        imageUrl={exercise.imageUrl}
                        videoUrl={exercise.videoUrl}
                        exerciseName={exercise.exerciseName}
                        onPlayVideo={handlePlayVideo}
                      />
                    )}

                    <ExerciseInstructions
                      exerciseId={exercise.exerciseId}
                      instructionText={exercise.instructionText}
                      muscleGroup={exercise.muscleGroup}
                    />
                  </View>

                  <View style={s.setsContainer}>
                    {exercise.sets.map((set, setIdx) => (
                      <SessionSetRow
                        key={setIdx}
                        setNumber={setIdx + 1}
                        exerciseName={exercise.exerciseName}
                        weight={set.weight}
                        reps={set.reps}
                        completed={set.completed}
                        seconds={set.seconds}
                        timerRunning={
                          !!runningSet && runningSet.exIdx === exIdx && runningSet.setIdx === setIdx
                        }
                        timerElapsed={runningElapsed}
                        onChange={(field, value) => updateSetValue(exIdx, setIdx, field, value)}
                        onLog={() => completeSet(exIdx, setIdx)}
                        onToggleTimer={() => toggleSetTimer(exIdx, setIdx)}
                      />
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
      </KeyboardAvoidingView>

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
  controlRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  controlPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    backgroundColor: CoachColors.surface,
  },
  controlPillOn: { borderColor: CoachColors.accent, backgroundColor: CoachColors.accentSoft },
  controlPillOff: { backgroundColor: 'transparent' },
  controlText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },
  controlTextOn: { color: CoachColors.accent },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  // Card language: 30 radius, 20 padding — the same shell as MealCard and
  // WorkoutCard, so browsing a session and doing one look like one product.
  exCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 30,
    padding: 20,
    marginBottom: 14,
  },
  exCardDone: { borderColor: CoachColors.accentSoft },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // The round portrait, on collapsed cards. 96 — the browse card's 92 plus a
  // little, because in a scrolling list of six exercises this silhouette is
  // the thing the eye lands on, and at 72 it read as an afterthought.
  portrait: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  exEyebrow: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // ── The media panel ────────────────────────────────────────────────────
  mediaTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  mediaTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  mediaTabOn: { backgroundColor: CoachColors.accent, borderColor: CoachColors.accent },
  mediaTabText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.textMuted,
  },
  mediaTabTextOn: { color: CoachColors.onAccent },
  anatomyPanel: {
    alignItems: 'center',
    paddingVertical: 22,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    // Matches the demo's own marginBottom (Spacing.xl) so the gap down to the
    // instructions row is identical whichever face is showing — switching tabs
    // must not make the card below it jump.
    marginBottom: 20,
  },
  anatomyCaption: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },

  exAction: { alignItems: 'center', gap: 3 },
  exProgress: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.accentSoft,
  },
  exProgressDone: { backgroundColor: CoachColors.accent },
  exProgressText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15,
    color: CoachColors.accent,
  },
  // Oversized, tight-leading title — the card language's loudest signal, and
  // the thing you need to read from arm's length with a bar in your hands.
  exName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
    marginTop: 3,
  },
  exTarget: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 5,
  },
  setsContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
    gap: 10,
  },
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
