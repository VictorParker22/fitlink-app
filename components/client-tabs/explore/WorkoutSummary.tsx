import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily } from '../../../constants/theme';

interface SetLog {
  weight: string;
  reps: string;
  completed: boolean;
}

interface ExerciseState {
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  sets: SetLog[];
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

interface WorkoutSummaryProps {
  activeWorkout: any;
  elapsedSeconds: number;
  exerciseStates: ExerciseState[];
  onConfirmFinish: () => void;
  onContinueWorkout: () => void;
}

export default function WorkoutSummary({
  activeWorkout,
  elapsedSeconds,
  exerciseStates,
  onConfirmFinish,
  onContinueWorkout,
}: WorkoutSummaryProps) {
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

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Trophy icon */}
        <View style={s.trophyCard}>
          <Ionicons name="trophy" size={40} color="#FFD700" />
        </View>

        <Text style={s.tagHeader}>SESSION COMPLETE // PERFORMANCE REVIEW</Text>
        <Text style={s.title}>Workout Complete!</Text>
        <Text style={s.workoutName}>{activeWorkout?.workouts?.name || 'Workout'}</Text>

        {/* Stats Grid */}
        <View style={s.grid}>
          <View style={s.statCard}>
            <Ionicons name="time-outline" size={18} color="#4D94FF" />
            <Text style={s.statValue}>{formatDuration(elapsedSeconds)}</Text>
            <Text style={s.statLabel}>DURATION</Text>
          </View>
          <View style={s.statCard}>
            <Ionicons name="barbell-outline" size={18} color="#22C55E" />
            <Text style={s.statValue}>{exercisesCompleted}</Text>
            <Text style={s.statLabel}>EXERCISES</Text>
          </View>
          <View style={s.statCard}>
            <Ionicons name="layers-outline" size={18} color="#A78BFA" />
            <Text style={s.statValue}>{totalSetsCompleted}</Text>
            <Text style={s.statLabel}>SETS DONE</Text>
          </View>
          <View style={s.statCard}>
            <Ionicons name="trending-up-outline" size={18} color="#FFD700" />
            <Text style={s.statValue}>
              {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume.toLocaleString()}
            </Text>
            <Text style={s.statLabel}>VOLUME (LBS)</Text>
          </View>
        </View>

        {/* Exercise breakdown */}
        <Text style={s.breakdownHeader}>EXERCISE BREAKDOWN</Text>
        <View style={s.breakdownCard}>
          {exerciseStates.map((ex, i) => {
            const completedSets = ex.sets.filter((s) => s.completed).length;
            return (
              <View key={i} style={s.exRow}>
                <View style={[s.dot, { backgroundColor: completedSets > 0 ? '#22C55E' : 'rgba(255,255,255,0.2)' }]} />
                <Text style={s.exName} numberOfLines={1}>{ex.exerciseName}</Text>
                <Text style={s.exSets}>{completedSets}/{ex.targetSets} SETS</Text>
              </View>
            );
          })}
        </View>

        {/* Action Buttons */}
        <TouchableOpacity style={s.finishBtn} onPress={onConfirmFinish} activeOpacity={0.8}>
          <Ionicons name="checkmark-circle" size={18} color="#000000" />
          <Text style={s.finishBtnText}>SAVE & FINISH →</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.continueBtn} onPress={onContinueWorkout} activeOpacity={0.7}>
          <Text style={s.continueBtnText}>CONTINUE WORKOUT</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  content: { padding: 20, alignItems: 'center' },
  trophyCard: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: '#1A1500',
    borderWidth: 1,
    borderColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 20,
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 4,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  workoutName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#4D94FF',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
  },
  statLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  breakdownHeader: {
    alignSelf: 'flex-start',
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
    marginBottom: 8,
  },
  breakdownCard: {
    width: '100%',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 24,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  exName: {
    flex: 1,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  exSets: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
  },
  finishBtn: {
    width: '100%',
    height: 48,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  finishBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#000000',
    letterSpacing: 1,
  },
  continueBtn: {
    width: '100%',
    height: 44,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueBtnText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
  },
});
