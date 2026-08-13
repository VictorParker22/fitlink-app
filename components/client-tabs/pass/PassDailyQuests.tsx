import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

export interface PassDailyQuestsProps {
  todayWorkout: any;
  mealLogsCount: number;
  hasGymVisit: boolean;
}

const QUESTS = [
  { id: 'workout', title: "Complete today's workout", xp: 50, icon: 'barbell' },
  { id: 'meals', title: 'Log 3 meals today', xp: 30, icon: 'restaurant' },
  { id: 'gym', title: 'Check in at the gym', xp: 50, icon: 'fitness' },
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
    outputRange: [CoachColors.borderMuted, 'rgba(198,242,78,0.5)'],
  });

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>Daily quests</Text>

      <View style={styles.questsList}>
        {QUESTS.map((quest) => {
          const isDone = completionMap[quest.id];
          return (
            <View key={quest.id} style={[styles.questCard, isDone && styles.questCardDone]}>
              <View style={styles.iconCircle}>
                <Ionicons name={quest.icon as any} size={18} color={CoachColors.accent} />
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
                    <Ionicons name="checkmark-sharp" size={16} color={CoachColors.onAccent} />
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

      <Animated.View style={[styles.vaultCard, isAllDone ? { borderColor, backgroundColor: CoachColors.accentSofter } : null]}>
        <View style={styles.vaultLeft}>
          <View style={[styles.vaultIconCircle, isAllDone && styles.vaultIconCircleDone]}>
            <Ionicons name={isAllDone ? "gift-sharp" : "lock-closed-sharp"} size={20} color={isAllDone ? CoachColors.onAccent : CoachColors.textMuted} />
          </View>
          <View>
            <Text style={styles.vaultTitle}>Daily vault</Text>
            {isAllDone ? (
              <Text style={styles.vaultClaimText}>Claim bonus</Text>
            ) : (
              <Text style={styles.vaultProgressText}>{completedCount}/3 quests</Text>
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
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    marginBottom: Spacing.md,
  },
  questsList: {
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius.xl,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  questCardDone: {
    borderLeftColor: CoachColors.accent,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: CoachColors.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  questContent: {
    flex: 1,
  },
  questTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    marginBottom: Spacing['2xs'],
  },
  xpPill: {
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  xpText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
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
    backgroundColor: CoachColors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: CoachColors.borderMuted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 8,
    color: CoachColors.textMuted,
  },
  vaultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
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
    backgroundColor: CoachColors.borderMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  vaultIconCircleDone: {
    backgroundColor: CoachColors.accent,
  },
  vaultTitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  vaultProgressText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
  vaultClaimText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.accent,
  },
});
