import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

interface PassSeasonBannerProps {
  trackProgress: number; // 0-1, ratio of unlocked/total track nodes
  totalNodes: number;
  unlockedNodes: number;
  currentLevel: number;
}

const getSeasonInfo = () => {
  const month = new Date().getMonth();
  const year = new Date().getFullYear();

  if (month === 11 || month === 0 || month === 1) { // Dec, Jan, Feb
    return { name: 'Winter warrior', icon: 'snow' as const, year };
  } else if (month >= 2 && month <= 4) { // Mar, Apr, May
    return { name: 'Spring reset', icon: 'leaf' as const, year };
  } else if (month >= 5 && month <= 7) { // Jun, Jul, Aug
    return { name: 'Summer sculpt', icon: 'sunny' as const, year };
  } else { // Sep, Oct, Nov
    return { name: 'Fall forge', icon: 'flame' as const, year };
  }
};

const getDaysRemaining = () => {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const diffTime = Math.abs(lastDay.getTime() - today.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export const PassSeasonBanner: React.FC<PassSeasonBannerProps> = ({
  trackProgress,
  totalNodes,
  unlockedNodes,
  currentLevel,
}) => {
  const season = getSeasonInfo();
  const daysLeft = getDaysRemaining();

  // Calculate tier name based on level
  const tierName = currentLevel < 10 ? 'Novice' : currentLevel < 20 ? 'Challenger' : 'Champion';

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.seasonBadge}>
          <Ionicons name={season.icon} size={27} color={CoachColors.accent} />
          <Text style={styles.tagText}>Season pass</Text>
        </View>
        <Text style={styles.daysLeft}>
          {daysLeft} days remaining
        </Text>
      </View>

      <Text style={styles.seasonName}>{season.name} {season.year}</Text>

      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Track progress</Text>
          <Text style={styles.progressText}>{unlockedNodes}/{totalNodes} nodes</Text>
        </View>

        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, Math.max(0, trackProgress * 100))}%` }
            ]}
          />
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.levelPill}>
          <Text style={styles.levelPillText}>Level {currentLevel}</Text>
        </View>
        <Text style={styles.tierName}>{tierName}</Text>
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
    padding: 20,
    marginBottom: Spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  seasonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tagText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  daysLeft: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12.5,
    color: CoachColors.accent,
  },
  seasonName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24.5,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.xl,
  },
  progressSection: {
    marginBottom: Spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progressText: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textFaint,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: CoachColors.accent,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  levelPill: {
    borderWidth: 1,
    borderColor: CoachColors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing['2xs'],
  },
  levelPillText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.accent,
  },
  tierName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
});
