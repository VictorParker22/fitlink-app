import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

export interface PassTrophyCabinetProps {
  totalWorkouts: number;
  currentStreak: number;
  bestStreak: number;
  totalXp: number;
  currentLevel: number;
  memberSinceDays: number;
  gymVisits: number;
}

export interface BadgeItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  xpReward: number;
  condition: (p: PassTrophyCabinetProps) => boolean;
  getProgress: (p: PassTrophyCabinetProps) => { current: number; target: number; label: string };
}

const BADGES: BadgeItem[] = [
  {
    id: 'first_steps',
    name: 'First steps',
    desc: 'Complete 1 workout session',
    icon: 'footsteps',
    color: CoachColors.accent,
    xpReward: 100,
    condition: (p) => p.totalWorkouts >= 1,
    getProgress: (p) => ({ current: Math.min(1, p.totalWorkouts), target: 1, label: 'workouts' }),
  },
  {
    id: 'iron_will',
    name: 'Iron will',
    desc: 'Maintain a 7-day streak',
    icon: 'flame',
    color: CoachColors.accent,
    xpReward: 250,
    condition: (p) => p.currentStreak >= 7 || p.bestStreak >= 7,
    getProgress: (p) => ({ current: Math.min(7, Math.max(p.currentStreak, p.bestStreak)), target: 7, label: 'days' }),
  },
  {
    id: 'centurion',
    name: 'Centurion',
    desc: 'Complete 100 total workouts',
    icon: 'trophy',
    color: CoachColors.accent,
    xpReward: 1000,
    condition: (p) => p.totalWorkouts >= 100,
    getProgress: (p) => ({ current: Math.min(100, p.totalWorkouts), target: 100, label: 'workouts' }),
  },
  {
    id: 'meal_master',
    name: 'Meal master',
    desc: 'Reach athlete level 3',
    icon: 'restaurant',
    color: CoachColors.accent,
    xpReward: 300,
    condition: (p) => p.currentLevel >= 3,
    getProgress: (p) => ({ current: Math.min(3, p.currentLevel), target: 3, label: 'level' }),
  },
  {
    id: 'gym_rat',
    name: 'Gym rat',
    desc: 'Complete 10 gym visits',
    icon: 'fitness',
    color: CoachColors.accent,
    xpReward: 400,
    condition: (p) => p.gymVisits >= 10,
    getProgress: (p) => ({ current: Math.min(10, p.gymVisits), target: 10, label: 'visits' }),
  },
  {
    id: 'early_bird',
    name: 'Early bird',
    desc: 'Active member for 30+ days',
    icon: 'sunny',
    color: CoachColors.accent,
    xpReward: 500,
    condition: (p) => p.memberSinceDays >= 30,
    getProgress: (p) => ({ current: Math.min(30, p.memberSinceDays), target: 30, label: 'days' }),
  },
  {
    id: 'level_5',
    name: 'Level 5 club',
    desc: 'Reach athlete level 5',
    icon: 'diamond',
    color: CoachColors.accent,
    xpReward: 750,
    condition: (p) => p.currentLevel >= 5,
    getProgress: (p) => ({ current: Math.min(5, p.currentLevel), target: 5, label: 'level' }),
  },
  {
    id: 'streak_blazer',
    name: 'Streak blazer',
    desc: 'Maintain a 30-day streak',
    icon: 'bonfire',
    color: CoachColors.accent,
    xpReward: 1500,
    condition: (p) => p.currentStreak >= 30 || p.bestStreak >= 30,
    getProgress: (p) => ({ current: Math.min(30, Math.max(p.currentStreak, p.bestStreak)), target: 30, label: 'days' }),
  },
];

export const PassTrophyCabinet: React.FC<PassTrophyCabinetProps> = (props) => {
  const [selectedBadge, setSelectedBadge] = useState<BadgeItem | null>(null);
  const earnedBadges = BADGES.filter((b) => b.condition(props));
  const progressRatio = earnedBadges.length / BADGES.length;

  const handleBadgePress = (badge: BadgeItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBadge(badge);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.sectionHeader}>Trophy cabinet</Text>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {earnedBadges.length}/{BADGES.length} badges unlocked
        </Text>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progressRatio * 100}%` }]} />
        </View>
      </View>

      <View style={styles.grid}>
        {BADGES.map((badge) => {
          const isEarned = badge.condition(props);
          return (
            <TouchableOpacity
              key={badge.id}
              style={styles.badgeCell}
              onPress={() => handleBadgePress(badge)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.circle,
                  isEarned ? { backgroundColor: CoachColors.accentSoft } : styles.circleLocked,
                ]}
              >
                <Ionicons
                  name={badge.icon as any}
                  size={24}
                  color={isEarned ? badge.color : CoachColors.textFaint}
                />
                {!isEarned && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={11} color={CoachColors.onAccent} />
                  </View>
                )}
              </View>
              <Text
                style={[styles.badgeName, isEarned ? styles.badgeNameEarned : styles.badgeNameLocked]}
                numberOfLines={1}
              >
                {badge.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Interactive Trophy Detail Drawer Modal */}
      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        {selectedBadge && (
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectedBadge(null)}
          >
            <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={styles.modalIconWrap}>
                <View
                  style={[
                    styles.modalCircle,
                    selectedBadge.condition(props)
                      ? { backgroundColor: CoachColors.accentSoft }
                      : { backgroundColor: CoachColors.borderMuted },
                  ]}
                >
                  <Ionicons
                    name={selectedBadge.icon as any}
                    size={40}
                    color={selectedBadge.condition(props) ? selectedBadge.color : CoachColors.textFaint}
                  />
                </View>
              </View>

              <Text style={styles.modalTitle}>{selectedBadge.name}</Text>
              <Text style={styles.modalDesc}>{selectedBadge.desc}</Text>

              {/* Progress metrics */}
              {(() => {
                const isEarned = selectedBadge.condition(props);
                const prog = selectedBadge.getProgress(props);
                const pct = Math.round((prog.current / prog.target) * 100);

                return (
                  <View style={styles.modalProgressSection}>
                    <View style={styles.modalProgressRow}>
                      <Text style={styles.modalProgressLabel}>
                        {isEarned ? 'Unlocked' : `Progress: ${prog.current}/${prog.target} ${prog.label}`}
                      </Text>
                      <Text style={styles.modalProgressPct}>{pct}%</Text>
                    </View>
                    <View style={styles.modalBarBg}>
                      <View
                        style={[
                          styles.modalBarFill,
                          { width: `${pct}%`, backgroundColor: CoachColors.accent },
                        ]}
                      />
                    </View>

                    {/* Reward Pill */}
                    <View style={styles.rewardRow}>
                      <Ionicons name="flash" size={16} color={CoachColors.accent} />
                      <Text style={styles.rewardText}>+{selectedBadge.xpReward} XP reward</Text>
                    </View>
                  </View>
                );
              })()}

              <TouchableOpacity hitSlop={{ top: 2, bottom: 2 }}
                style={styles.modalCloseBtn}
                onPress={() => setSelectedBadge(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      </Modal>
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
  sectionHeader: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 11,
    color: CoachColors.textFaint,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  progressContainer: {
    marginBottom: Spacing.xl,
  },
  progressText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: CoachColors.accent,
    borderRadius: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  badgeCell: {
    width: '21%',
    alignItems: 'center',
  },
  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  circleLocked: {
    backgroundColor: CoachColors.bg,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: CoachColors.accent,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontFamily: CoachFonts.body,
    fontSize: 11,
    textAlign: 'center',
  },
  badgeNameEarned: {
    color: CoachColors.textPrimary,
  },
  badgeNameLocked: {
    color: CoachColors.textFaint,
  },
  // Modal Drawer Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalContent: {
    backgroundColor: CoachColors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalIconWrap: {
    marginBottom: 16,
  },
  modalCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  modalDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    color: CoachColors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalProgressSection: {
    width: '100%',
    backgroundColor: CoachColors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    padding: 16,
    marginBottom: 20,
  },
  modalProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalProgressLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  modalProgressPct: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13.5,
    color: CoachColors.accent,
  },
  modalBarBg: {
    height: 6,
    backgroundColor: CoachColors.borderMuted,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  modalBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  rewardText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 12.5,
    color: CoachColors.accent,
    letterSpacing: 1,
  },
  modalCloseBtn: {
    backgroundColor: CoachColors.borderMuted,
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  modalCloseText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
    letterSpacing: 1.5,
  },
});
