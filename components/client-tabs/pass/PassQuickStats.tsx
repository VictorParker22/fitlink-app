import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

interface PassQuickStatsProps {
  level: number;
  streak: number;
  workoutsThisMonth: number;
  totalXp: number;
  progressToNextLevel: number; // 0-1
}

export const PassQuickStats: React.FC<PassQuickStatsProps> = ({
  level,
  streak,
  workoutsThisMonth,
  totalXp,
  progressToNextLevel,
}) => {
  return (
    <View>
      <View style={styles.card}>
        <View style={styles.col}>
          <Ionicons name="shield" size={16} color={CoachColors.accent} style={styles.icon} />
          <Text style={styles.number}>{level}</Text>
          <Text style={styles.label}>Level</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Ionicons
            name="flame"
            size={16}
            color={streak > 0 ? CoachColors.accent : CoachColors.textFaint}
            style={styles.icon}
          />
          <Text style={styles.number}>{streak}</Text>
          <Text style={styles.label}>Streak</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Ionicons name="barbell" size={16} color={CoachColors.accent} style={styles.icon} />
          <Text style={styles.number}>{workoutsThisMonth}</Text>
          <Text style={styles.label}>This month</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.col}>
          <Ionicons name="flash" size={16} color={CoachColors.accent} style={styles.icon} />
          <Text style={styles.number}>{totalXp}</Text>
          <Text style={styles.label}>Total XP</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[styles.progressBar, { width: `${Math.max(0, Math.min(100, progressToNextLevel * 100))}%` }]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius['2xl'],
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: CoachColors.borderMuted,
  },
  icon: {
    marginBottom: Spacing.xs,
  },
  number: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24,
    color: CoachColors.textPrimary,
    marginBottom: Spacing['2xs'],
  },
  label: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 9,
    color: CoachColors.textFaint,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  progressTrack: {
    height: 4,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: CoachColors.accent,
  },
});
