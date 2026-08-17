import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { ClientRoute } from '../../../types/routes';

interface DaySummaryCardProps {
  workoutCompleted?: boolean;
  mealsLoggedCount?: number;
  totalMealsGoal?: number;
  streakDays?: number;
}

export default function DaySummaryCard({
  workoutCompleted = true,
  mealsLoggedCount = 3,
  totalMealsGoal = 4,
  streakDays = 5,
}: DaySummaryCardProps) {
  const router = useRouter();

  return (
    <View style={st.container}>
      <View style={st.topRow}>
        <Text style={st.sectionTag}>Evening recap // daily performance</Text>
        <View style={st.streakPill}>
          <Ionicons name="flame" size={11} color={CoachColors.accent} />
          <Text style={st.streakText}>{streakDays} day rhythm</Text>
        </View>
      </View>

      <View style={st.statsGrid}>
        {/* Workout stat */}
        <View style={st.statItem}>
          <View style={[st.iconBox, { backgroundColor: workoutCompleted ? CoachColors.accentSofter : CoachColors.bg, borderColor: workoutCompleted ? CoachColors.accent : CoachColors.borderMuted }]}>
            <Ionicons
              name={workoutCompleted ? 'checkmark' : 'barbell-outline'}
              size={18}
              color={workoutCompleted ? CoachColors.accent : CoachColors.textMuted}
            />
          </View>
          <Text style={st.statLabel}>Workout</Text>
          <Text style={st.statValue}>{workoutCompleted ? 'Logged' : 'Rest'}</Text>
        </View>

        {/* Nutrition stat */}
        <View style={st.statItem}>
          <View style={[st.iconBox, { backgroundColor: CoachColors.bg, borderColor: CoachColors.border }]}>
            <Ionicons name="restaurant-outline" size={20} color={CoachColors.textSecondary} />
          </View>
          <Text style={st.statLabel}>Nutrition</Text>
          <Text style={st.statValue}>{mealsLoggedCount}/{totalMealsGoal} meals</Text>
        </View>
      </View>

      <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
        style={st.viewDetailsBtn}
        activeOpacity={0.8}
        onPress={() => router.push(ClientRoute.myProgress as any)}
      >
        <Text style={st.viewDetailsText}>View full performance log</Text>
        <Ionicons name="chevron-forward" size={16} color={CoachColors.accent} />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: CoachColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTag: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CoachColors.accentSofter,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: CoachColors.accentSoft,
  },
  streakText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: CoachColors.bg,
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1,
  },
  statLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12.5,
    color: CoachColors.textPrimary,
    letterSpacing: 0.5,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: CoachColors.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  viewDetailsText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 11,
    color: CoachColors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
