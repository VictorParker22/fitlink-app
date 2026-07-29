import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, Spacing, Radius } from '../../../constants/theme';

export interface PassDailyQuestsProps {
  todayWorkout: any;
  mealLogsCount: number;
  hasGymVisit: boolean;
}

const QUESTS = [
  { id: 'workout', title: 'Complete Today\'s Workout', xp: 50, icon: 'barbell', color: '#FF6B35' },
  { id: 'meals', title: 'Log 3 Meals Today', xp: 30, icon: 'restaurant', color: '#A78BFA' },
  { id: 'gym', title: 'Check In at the Gym', xp: 50, icon: 'fitness', color: '#22C55E' },
] as const;

export default function PassDailyQuests({ todayWorkout, mealLogsCount, hasGymVisit }: PassDailyQuestsProps) {
  const isWorkoutDone = todayWorkout?.status === 'completed';
  const isMealsDone = mealLogsCount >= 3;
  const isGymDone = hasGymVisit === true;
  
  const completionMap = {
    workout: isWorkoutDone,
    meals: isMealsDone,
    gym: isGymDone,
  };
  
  const completedCount = Object.values(completionMap).filter(Boolean).length;
  const isAllDone = completedCount === QUESTS.length;

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isAllDone) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: false,
          }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [isAllDone, glowAnim]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#1C1C1E', 'rgba(255,215,0,0.5)'],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>DAILY QUESTS</Text>
      
      <View style={styles.questsList}>
        {QUESTS.map((quest) => {
          const isDone = completionMap[quest.id];
          return (
            <View key={quest.id} style={[styles.questCard, isDone && styles.questCardDone]}>
              <View style={[styles.iconCircle, { backgroundColor: `${quest.color}1E` }]}>
                <Ionicons name={quest.icon as any} size={18} color={quest.color} />
              </View>
              
              <View style={styles.questContent}>
                <Text style={styles.questTitle}>{quest.title}</Text>
                <View style={styles.xpPill}>
                  <Text style={styles.xpText}>+{quest.xp} XP</Text>
                </View>
              </View>
              
              <View style={styles.statusCol}>
                {isDone ? (
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark-sharp" size={16} color="#000" />
                  </View>
                ) : (
                  <View style={styles.emptyCircle}>
                    {quest.id === 'meals' && mealLogsCount > 0 && (
                      <Text style={styles.progressText}>{mealLogsCount}/3</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <Animated.View style={[styles.vaultCard, isAllDone ? { borderColor, backgroundColor: 'rgba(255,215,0,0.05)' } : null]}>
        <View style={styles.vaultLeft}>
          <View style={[styles.vaultIconCircle, isAllDone && styles.vaultIconCircleDone]}>
            <Ionicons name={isAllDone ? "gift-sharp" : "lock-closed-sharp"} size={20} color={isAllDone ? "#000" : "rgba(255,255,255,0.5)"} />
          </View>
          <View>
            <Text style={styles.vaultTitle}>DAILY VAULT</Text>
            {isAllDone ? (
              <Text style={styles.vaultClaimText}>CLAIM BONUS</Text>
            ) : (
              <Text style={styles.vaultProgressText}>{completedCount}/3 Quests</Text>
            )}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing['3xl'],
  },
  sectionHeader: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    marginBottom: Spacing.md,
  },
  questsList: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.xl,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  questCardDone: {
    borderLeftColor: '#FFD700',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  questContent: {
    flex: 1,
  },
  questTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: Spacing['2xs'],
  },
  xpPill: {
    backgroundColor: 'rgba(255,107,53,0.15)',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  xpText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#FF6B35',
  },
  statusCol: {
    marginLeft: Spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    width: 28,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    color: 'rgba(255,255,255,0.5)',
  },
  vaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius['2xl'],
    padding: 16,
  },
  vaultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vaultIconCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  vaultIconCircleDone: {
    backgroundColor: '#FFD700',
  },
  vaultTitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  vaultProgressText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
  vaultClaimText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FFD700',
  },
});
