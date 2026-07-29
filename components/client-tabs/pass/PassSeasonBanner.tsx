import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, Spacing, Radius } from '../../../constants/theme';

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
    return { name: 'Winter Warrior', color: '#6C9BF2', icon: 'snow' as const, year };
  } else if (month >= 2 && month <= 4) { // Mar, Apr, May
    return { name: 'Spring Reset', color: '#22C55E', icon: 'leaf' as const, year };
  } else if (month >= 5 && month <= 7) { // Jun, Jul, Aug
    return { name: 'Summer Sculpt', color: '#FF6B35', icon: 'sunny' as const, year };
  } else { // Sep, Oct, Nov
    return { name: 'Fall Forge', color: '#FFD700', icon: 'flame' as const, year };
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
          <Ionicons name={season.icon} size={24} color={season.color} />
          <Text style={styles.tagText}>SEASON PASS</Text>
        </View>
        <Text style={[styles.daysLeft, { color: season.color }]}>
          {daysLeft} DAYS REMAINING
        </Text>
      </View>
      
      <Text style={styles.seasonName}>{season.name} {season.year}</Text>
      
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>TRACK PROGRESS</Text>
          <Text style={styles.progressText}>{unlockedNodes}/{totalNodes} Nodes</Text>
        </View>
        
        <View style={styles.progressBarBg}>
          <View 
            style={[
              styles.progressBarFill, 
              { width: `${Math.min(100, Math.max(0, trackProgress * 100))}%`, backgroundColor: season.color }
            ]} 
          />
        </View>
      </View>

      <View style={styles.bottomRow}>
        <View style={[styles.levelPill, { borderColor: season.color }]}>
          <Text style={[styles.levelPillText, { color: season.color }]}>Level {currentLevel}</Text>
        </View>
        <Text style={styles.tierName}>{tierName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  daysLeft: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
  },
  seasonName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: '#FFFFFF',
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
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  progressText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  levelPill: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing['2xs'],
  },
  levelPillText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
  },
  tierName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
