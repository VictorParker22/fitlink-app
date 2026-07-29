import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { FontFamily } from '../../../constants/theme';
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
        <Text style={st.sectionTag}>EVENING RECAP // DAILY PERFORMANCE</Text>
        <View style={st.streakPill}>
          <Ionicons name="flame" size={10} color="#FF4757" />
          <Text style={st.streakText}>{streakDays} DAY RHYTHM</Text>
        </View>
      </View>

      <View style={st.statsGrid}>
        {/* Workout stat */}
        <View style={st.statItem}>
          <View style={[st.iconBox, { backgroundColor: workoutCompleted ? '#0C1C12' : '#141418', borderColor: workoutCompleted ? '#22C55E' : '#27272A' }]}>
            <Ionicons
              name={workoutCompleted ? 'checkmark' : 'barbell-outline'}
              size={18}
              color={workoutCompleted ? '#22C55E' : 'rgba(255,255,255,0.4)'}
            />
          </View>
          <Text style={st.statLabel}>WORKOUT</Text>
          <Text style={st.statValue}>{workoutCompleted ? 'LOGGED' : 'REST'}</Text>
        </View>

        {/* Nutrition stat */}
        <View style={st.statItem}>
          <View style={[st.iconBox, { backgroundColor: '#1A1500', borderColor: '#EAB308' }]}>
            <Ionicons name="restaurant-outline" size={18} color="#EAB308" />
          </View>
          <Text style={st.statLabel}>NUTRITION</Text>
          <Text style={st.statValue}>{mealsLoggedCount}/{totalMealsGoal} MEALS</Text>
        </View>

        {/* Recovery stat */}
        <View style={st.statItem}>
          <View style={[st.iconBox, { backgroundColor: '#1A0C0C', borderColor: '#FF6B6B' }]}>
            <Ionicons name="heart-outline" size={18} color="#FF6B6B" />
          </View>
          <Text style={st.statLabel}>RECOVERY</Text>
          <Text style={st.statValue}>OPTIMAL</Text>
        </View>
      </View>

      <TouchableOpacity
        style={st.viewDetailsBtn}
        activeOpacity={0.8}
        onPress={() => router.push(ClientRoute.myProgress as any)}
      >
        <Text style={st.viewDetailsText}>VIEW FULL PERFORMANCE LOG</Text>
        <Ionicons name="chevron-forward" size={14} color="#6C9BF2" />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#0C0C0E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1C1C1E',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTag: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 2,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1A0C0C',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  streakText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FF6B6B',
    letterSpacing: 1,
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
    backgroundColor: '#141418',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#22222A',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  statValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  viewDetailsText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 10,
    color: '#6C9BF2',
    letterSpacing: 1.5,
  },
});
