import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

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
        {/* Trophy icon — purely decorative, the heading below says the same */}
        <View style={s.trophyCard} importantForAccessibility="no" accessibilityElementsHidden>
          <Ionicons name="trophy" size={45} color={CoachColors.accent} />
        </View>

        <Text style={s.tagHeader} importantForAccessibility="no">Session complete // performance review</Text>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Workout complete. ${activeWorkout?.workouts?.name || 'Workout'}.`}
        >
          <Text style={s.title}>Workout complete!</Text>
          <Text style={s.workoutName}>{activeWorkout?.workouts?.name || 'Workout'}</Text>
        </View>

        {/* Stats Grid */}
        <View style={s.grid}>
          <View style={s.statCard} accessible accessibilityLabel={`Duration, ${formatDuration(elapsedSeconds)}`}>
            <Ionicons name="time-outline" size={20} color={CoachColors.accent} />
            <Text style={s.statValue}>{formatDuration(elapsedSeconds)}</Text>
            <Text style={s.statLabel}>Duration</Text>
          </View>
          <View style={s.statCard} accessible accessibilityLabel={`${exercisesCompleted} exercises`}>
            <Ionicons name="barbell-outline" size={20} color={CoachColors.accent} />
            <Text style={s.statValue}>{exercisesCompleted}</Text>
            <Text style={s.statLabel}>Exercises</Text>
          </View>
          <View style={s.statCard} accessible accessibilityLabel={`${totalSetsCompleted} sets done`}>
            <Ionicons name="layers-outline" size={20} color={CoachColors.accent} />
            <Text style={s.statValue}>{totalSetsCompleted}</Text>
            <Text style={s.statLabel}>Sets done</Text>
          </View>
          <View style={s.statCard} accessible accessibilityLabel={`Volume, ${totalVolume.toLocaleString()} pounds`}>
            <Ionicons name="trending-up-outline" size={20} color={CoachColors.accent} />
            <Text style={s.statValue}>
              {totalVolume >= 1000 ? `${(totalVolume / 1000).toFixed(1)}k` : totalVolume.toLocaleString()}
            </Text>
            <Text style={s.statLabel}>Volume (lbs)</Text>
          </View>
        </View>

        {/* Exercise breakdown */}
        <Text style={s.breakdownHeader}>Exercise breakdown</Text>
        <View style={s.breakdownCard}>
          {exerciseStates.map((ex, i) => {
            const completedSets = ex.sets.filter((s) => s.completed).length;
            return (
              <View key={i} style={s.exRow} accessible accessibilityLabel={`${ex.exerciseName}, ${completedSets} of ${ex.targetSets} sets`}>
                <View style={[s.dot, { backgroundColor: completedSets > 0 ? CoachColors.accent : CoachColors.textFaint }]} />
                <Text style={s.exName} numberOfLines={1}>{ex.exerciseName}</Text>
                <Text style={s.exSets}>{completedSets}/{ex.targetSets} sets</Text>
              </View>
            );
          })}
        </View>

        {/* Action Buttons */}
        <TouchableOpacity
          style={s.finishBtn}
          onPress={onConfirmFinish}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Save and finish"
          accessibilityHint="Saves this session to your history and closes the workout"
        >
          <Ionicons name="checkmark-circle" size={20} color={CoachColors.onAccent} />
          <Text style={s.finishBtnText}>Save & finish →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.continueBtn}
          onPress={onContinueWorkout}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Continue workout"
          accessibilityHint="Goes back to the session without saving it yet"
        >
          <Text style={s.continueBtnText}>Continue workout</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  content: { padding: 20, alignItems: 'center' },
  trophyCard: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 20,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 31.5,
    color: CoachColors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  workoutName: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15.5,
    color: CoachColors.accent,
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
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
  },
  statLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  breakdownHeader: {
    alignSelf: 'flex-start',
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  breakdownCard: {
    width: '100%',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
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
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
  },
  exSets: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  finishBtn: {
    width: '100%',
    height: 48,
    backgroundColor: CoachColors.accent,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  finishBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.onAccent,
    letterSpacing: 1,
  },
  continueBtn: {
    width: '100%',
    height: 44,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textSecondary,
    letterSpacing: 1,
  },
});
