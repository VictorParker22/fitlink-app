import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily, Spacing, Radius } from '../../../constants/theme';

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
    name: 'First Steps',
    desc: 'Complete 1 workout session',
    icon: 'footsteps',
    color: '#FF6B35',
    xpReward: 100,
    condition: (p) => p.totalWorkouts >= 1,
    getProgress: (p) => ({ current: Math.min(1, p.totalWorkouts), target: 1, label: 'workouts' }),
  },
  {
    id: 'iron_will',
    name: 'Iron Will',
    desc: 'Maintain a 7-day streak',
    icon: 'flame',
    color: '#FFD700',
    xpReward: 250,
    condition: (p) => p.currentStreak >= 7 || p.bestStreak >= 7,
    getProgress: (p) => ({ current: Math.min(7, Math.max(p.currentStreak, p.bestStreak)), target: 7, label: 'days' }),
  },
  {
    id: 'centurion',
    name: 'Centurion',
    desc: 'Complete 100 total workouts',
    icon: 'trophy',
    color: '#B9F2FF',
    xpReward: 1000,
    condition: (p) => p.totalWorkouts >= 100,
    getProgress: (p) => ({ current: Math.min(100, p.totalWorkouts), target: 100, label: 'workouts' }),
  },
  {
    id: 'meal_master',
    name: 'Meal Master',
    desc: 'Reach Athlete Level 3',
    icon: 'restaurant',
    color: '#A78BFA',
    xpReward: 300,
    condition: (p) => p.currentLevel >= 3,
    getProgress: (p) => ({ current: Math.min(3, p.currentLevel), target: 3, label: 'level' }),
  },
  {
    id: 'gym_rat',
    name: 'Gym Rat',
    desc: 'Complete 10 gym visits',
    icon: 'fitness',
    color: '#22C55E',
    xpReward: 400,
    condition: (p) => p.gymVisits >= 10,
    getProgress: (p) => ({ current: Math.min(10, p.gymVisits), target: 10, label: 'visits' }),
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    desc: 'Active member for 30+ days',
    icon: 'sunny',
    color: '#FBBF24',
    xpReward: 500,
    condition: (p) => p.memberSinceDays >= 30,
    getProgress: (p) => ({ current: Math.min(30, p.memberSinceDays), target: 30, label: 'days' }),
  },
  {
    id: 'level_5',
    name: 'Level 5 Club',
    desc: 'Reach Athlete Level 5',
    icon: 'diamond',
    color: '#FFD700',
    xpReward: 750,
    condition: (p) => p.currentLevel >= 5,
    getProgress: (p) => ({ current: Math.min(5, p.currentLevel), target: 5, label: 'level' }),
  },
  {
    id: 'streak_blazer',
    name: 'Streak Blazer',
    desc: 'Maintain a 30-day streak',
    icon: 'bonfire',
    color: '#FF6B35',
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
      <Text style={styles.sectionHeader}>TROPHY CABINET</Text>

      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>
          {earnedBadges.length}/{BADGES.length} Badges Unlocked
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
                  isEarned ? { backgroundColor: `${badge.color}26` } : styles.circleLocked,
                ]}
              >
                <Ionicons
                  name={badge.icon as any}
                  size={24}
                  color={isEarned ? badge.color : 'rgba(255,255,255,0.15)'}
                />
                {!isEarned && (
                  <View style={styles.lockOverlay}>
                    <Ionicons name="lock-closed" size={10} color="#000" />
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
                      ? { backgroundColor: `${selectedBadge.color}25` }
                      : { backgroundColor: 'rgba(255,255,255,0.05)' },
                  ]}
                >
                  <Ionicons
                    name={selectedBadge.icon as any}
                    size={40}
                    color={selectedBadge.condition(props) ? selectedBadge.color : 'rgba(255,255,255,0.3)'}
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
                        {isEarned ? 'Unlocked 🎉' : `Progress: ${prog.current}/${prog.target} ${prog.label}`}
                      </Text>
                      <Text style={styles.modalProgressPct}>{pct}%</Text>
                    </View>
                    <View style={styles.modalBarBg}>
                      <View
                        style={[
                          styles.modalBarFill,
                          { width: `${pct}%`, backgroundColor: isEarned ? selectedBadge.color : '#FFD700' },
                        ]}
                      />
                    </View>

                    {/* Reward Pill */}
                    <View style={styles.rewardRow}>
                      <Ionicons name="flash" size={14} color="#FFD700" />
                      <Text style={styles.rewardText}>+{selectedBadge.xpReward} XP Reward</Text>
                    </View>
                  </View>
                );
              })()}

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedBadge(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCloseText}>CLOSE</Text>
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius['2xl'],
    padding: 20,
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.md,
  },
  progressContainer: {
    marginBottom: Spacing.xl,
  },
  progressText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    color: '#FFF',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFD700',
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  lockOverlay: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFD700',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    textAlign: 'center',
  },
  badgeNameEarned: {
    color: '#FFF',
  },
  badgeNameLocked: {
    color: 'rgba(255,255,255,0.3)',
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
    backgroundColor: '#0C0C0E',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.3)',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  modalDesc: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalProgressSection: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 16,
    marginBottom: 20,
  },
  modalProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalProgressLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    color: '#FFFFFF',
  },
  modalProgressPct: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFD700',
  },
  modalBarBg: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 11,
    color: '#FFD700',
    letterSpacing: 1,
  },
  modalCloseBtn: {
    backgroundColor: '#1C1C1E',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  modalCloseText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
