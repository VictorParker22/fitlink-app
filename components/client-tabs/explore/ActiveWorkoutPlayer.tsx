import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Vibration, Platform, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FontFamily } from '../../../constants/theme';
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

  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showRestTimer, setShowRestTimer] = useState(false);
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
      if (weight > 0 && checkAndUpdatePr(exercise.exerciseId, weight)) {
        setPendingPr({ exerciseName: exercise.exerciseName, weight });
        // Notify coach — fire-and-forget, never block the workout UI
        if (clientData?.trainer_id) {
          // Insert notification row for the coach dashboard
          (async () => {
            const { error } = await supabase.from('notifications').insert({
              trainer_id: clientData.trainer_id,
              type: 'score',
              title: '🏆 New Personal Record!',
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
                title: '🏆 New PR!',
                body: `${clientData.name} just hit a new ${exercise.exerciseName} PR at ${weight} lbs!`,
                data: { url: `/client/${clientData.id}` },
              },
            }).catch(() => { /* silent fail */ });
          }
        }
      }
      if (exercise.restSeconds > 0) {
        setRestTimeLeft(exercise.restSeconds);
        setShowRestTimer(true);
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
    Alert.alert('End Workout?', 'Your progress will be lost.', [
      { text: 'Keep Going', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          clearExerciseLogs();
          onCancelWorkout();
        },
      },
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
      setVideoExerciseName(exerciseName || 'Exercise Demo');
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
            <Text style={s.restTag}>INTERVAL // REST TIMER</Text>
            <Text style={s.restTime}>{formatTime(restTimeLeft)}</Text>
            <Text style={s.restHint}>Breathe and prepare for next set</Text>
            <TouchableOpacity
              style={s.restSkipBtn}
              onPress={() => {
                setShowRestTimer(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="play-skip-forward" size={14} color="#000000" />
              <Text style={s.restSkipText}>SKIP REST →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTop}>
          <TouchableOpacity onPress={handleConfirmCancel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={s.tagHeader}>ACTIVE SESSION // LIVE TRACKING</Text>
            <Text style={s.workoutName} numberOfLines={1}>
              {activeWorkout?.workouts?.name || 'Workout'}
            </Text>
          </View>
          <View style={s.timerPill}>
            <Ionicons name="time-outline" size={12} color="#4D94FF" />
            <Text style={s.timerText}>{formatDuration(elapsedSeconds)}</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={s.progressRow}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.progressLabel}>{completedSets}/{totalSets} SETS</Text>
        </View>
      </View>

      {/* Exercise List */}
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {exerciseStates.map((exercise, exIdx) => {
          const completedInEx = exercise.sets.filter((s) => s.completed).length;
          const allDone = completedInEx === exercise.sets.length;

          return (
            <View key={exIdx} style={[s.exCard, allDone && s.exCardDone]}>
              <TouchableOpacity
                style={s.exHeader}
                onPress={() => toggleExercise(exIdx)}
                activeOpacity={0.7}
              >
                <View style={{ position: 'relative' }}>
                  <ExerciseThumbnail 
                    imageUrl={exercise.imageUrl} 
                    hasVideo={!!exercise.videoUrl} 
                    size={44} 
                  />
                  {allDone && (
                    <View style={{ position: 'absolute', top: -4, right: -4, backgroundColor: '#0C0C0E', borderRadius: 10, padding: 2 }}>
                      <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.exName}>{exercise.exerciseName}</Text>
                  <View style={s.exMeta}>
                    <Text style={s.exTarget}>
                      {exercise.targetSets} SETS • {exercise.targetReps} REPS
                    </Text>
                    {exercise.restSeconds > 0 && (
                      <Text style={s.exRestTag}>
                        • {exercise.restSeconds}S REST
                      </Text>
                    )}
                  </View>
                </View>

                <Ionicons
                  name={exercise.expanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="rgba(255,255,255,0.4)"
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
                      <Text style={[s.setHeaderText, { width: 36 }]}>SET</Text>
                      <Text style={[s.setHeaderText, { flex: 1 }]}>WEIGHT (LBS)</Text>
                      <Text style={[s.setHeaderText, { flex: 1 }]}>REPS</Text>
                      <Text style={[s.setHeaderText, { width: 44, textAlign: 'center' }]}>LOG</Text>
                    </View>

                    {exercise.sets.map((set, setIdx) => (
                      <View key={setIdx} style={[s.setRow, set.completed && s.setRowDone]}>
                      <View style={s.setNumBox}>
                        <Text style={[s.setNumText, set.completed && { color: '#22C55E' }]}>{setIdx + 1}</Text>
                      </View>

                      <View style={s.setInputBox}>
                        <TextInput
                          style={[s.setInput, set.completed && s.setInputDone]}
                          value={set.weight}
                          onChangeText={(v) => updateSetValue(exIdx, setIdx, 'weight', v)}
                          placeholder="0"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          keyboardType="numeric"
                          editable={!set.completed}
                          selectTextOnFocus
                        />
                      </View>

                      <View style={s.setInputBox}>
                        <TextInput
                          style={[s.setInput, set.completed && s.setInputDone]}
                          value={set.reps}
                          onChangeText={(v) => updateSetValue(exIdx, setIdx, 'reps', v)}
                          placeholder="0"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          keyboardType="numeric"
                          editable={!set.completed}
                          selectTextOnFocus
                        />
                      </View>

                      <TouchableOpacity
                        style={[s.checkBtn, set.completed && s.checkBtnDone]}
                        onPress={() => completeSet(exIdx, setIdx)}
                        activeOpacity={0.6}
                      >
                        <Ionicons
                          name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
                          size={24}
                          color={set.completed ? '#22C55E' : 'rgba(255,255,255,0.4)'}
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
        >
          <Ionicons name={progress >= 1 ? 'trophy' : 'flag'} size={18} color={progress >= 1 ? '#000000' : '#FFFFFF'} />
          <Text style={[s.finishBtnText, progress >= 1 && { color: '#000000' }]}>
            {progress >= 1 ? 'FINISH SESSION 🎉' : 'COMPLETE WORKOUT'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
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
            <TouchableOpacity
              style={s.videoCloseBtn}
              onPress={() => {
                setShowVideoModal(false);
                setVideoUrl(null);
              }}
            >
              <Ionicons name="close" size={20} color="#FFF" />
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
        onDismiss={() => setPendingPr(null)}
      />
    </View>
  );
}


const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  header: {
    backgroundColor: '#0C0C0E',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
  },
  workoutName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18,
    color: '#FFFFFF',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timerText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: '#141418',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4D94FF',
    borderRadius: 2,
  },
  progressLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  exCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  exCardDone: { borderColor: '#22C55E' },
  exHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exIdxBox: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exIdxBoxDone: {
    backgroundColor: '#0C1C12',
    borderColor: '#22C55E',
  },
  exIdxText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: '#FFFFFF',
  },
  exName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  exMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  exTarget: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.8,
  },
  exRestTag: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  watchDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 6,
  },
  watchDemoText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#4D94FF',
    letterSpacing: 1,
  },
  setsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
    gap: 8,
  },
  setHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  setHeaderText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
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
    backgroundColor: '#141418',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  setInputBox: {
    flex: 1,
    height: 36,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  setInput: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  setInputDone: { color: '#22C55E' },
  checkBtn: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBtnDone: {},
  finishBtn: {
    height: 48,
    backgroundColor: '#141418',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  finishBtnReady: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  finishBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FFFFFF',
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  restTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#4D94FF',
    letterSpacing: 2,
    marginBottom: 8,
  },
  restTime: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 48,
    color: '#FFFFFF',
    letterSpacing: -1,
    marginBottom: 4,
  },
  restHint: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 20,
  },
  restSkipBtn: {
    width: '100%',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  restSkipText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: '#000000',
    letterSpacing: 1,
  },
  videoModalOverlay: {
    flex: 1,
    backgroundColor: '#000000',
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoModalTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  videoModalCard: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 40,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  videoPlayer: { flex: 1 },
  expandedContent: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
});
