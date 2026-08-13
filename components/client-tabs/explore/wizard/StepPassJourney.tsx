import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, ScrollView } from 'react-native';
import { Spacing } from '../../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../../constants/coachDesign';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export type TrackNodeType = 'workout' | 'diet' | 'milestone';

export interface TrackNode {
  type: TrackNodeType;
  id?: string;
  label?: string;
  order: number;
}

interface StepPassJourneyProps {
  track?: TrackNode[];
  onContinue: () => void;
}

const DEFAULT_TRACK: TrackNode[] = [
  { type: 'workout', order: 1 },
  { type: 'diet', order: 2 },
  { type: 'milestone', label: 'First reward', order: 3 },
  { type: 'workout', order: 4 },
  { type: 'diet', order: 5 },
  { type: 'milestone', label: 'Ultimate goal', order: 6 },
];

const NodeConfig = {
  workout: { icon: 'barbell', color: CoachColors.accent, label: 'Workout' },
  diet: { icon: 'restaurant', color: CoachColors.accent, label: 'Nutrition' },
  milestone: { icon: 'trophy', color: CoachColors.accent, label: 'Reward' },
} as const;

export const StepPassJourney: React.FC<StepPassJourneyProps> = ({ track, onContinue }) => {
  const activeTrack = track && track.length > 0 ? track : DEFAULT_TRACK;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.5,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, [pulseAnim]);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onContinue();
  };

  const workoutsCount = activeTrack.filter(n => n.type === 'workout').length;
  const dietsCount = activeTrack.filter(n => n.type === 'diet').length;
  const milestonesCount = activeTrack.filter(n => n.type === 'milestone').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your FitLink Pass</Text>
        <Text style={styles.subtitle}>
          A structured journey of workouts, nutrition, and milestone rewards
        </Text>
      </View>

      <View style={styles.trackWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trackContent}
        >
          <View style={styles.trackLineContainer}>
            <View style={styles.trackLine} />
          </View>

          {activeTrack.map((node, index) => {
            const config = NodeConfig[node.type];
            const isUnlocked = index < 2;
            const isMilestone = node.type === 'milestone';

            return (
              <View key={node.id || `node-${index}`} style={styles.nodeItem}>
                <View style={[
                  styles.nodeCircleWrapper,
                  !isUnlocked && { opacity: 0.4 }
                ]}>
                  {isMilestone && (
                    <Animated.View style={[
                      styles.nodeGlow,
                      {
                        backgroundColor: config.color,
                        transform: [{ scale: pulseAnim }],
                        opacity: pulseAnim.interpolate({
                          inputRange: [1, 1.5],
                          outputRange: [0.3, 0]
                        })
                      }
                    ]} />
                  )}

                  <View style={[
                    styles.nodeCircle,
                    { backgroundColor: CoachColors.accentSoft }
                  ]}>
                    <Ionicons name={config.icon as any} size={24} color={config.color} />
                  </View>

                  {!isUnlocked && (
                    <View style={styles.lockIconContainer}>
                      <Ionicons name="lock-closed" size={10} color={CoachColors.textPrimary} />
                    </View>
                  )}
                </View>

                <Text style={styles.nodeLabel}>
                  {isMilestone ? (node.label || config.label) : config.label}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.content}>
        <View style={styles.statsCard}>
          <View style={styles.statColumn}>
            <Ionicons name="barbell" size={20} color={CoachColors.accent} />
            <Text style={styles.statCount}>{workoutsCount}</Text>
            <Text style={styles.statLabel}>Workouts</Text>
          </View>

          <View style={styles.statColumn}>
            <Ionicons name="restaurant" size={20} color={CoachColors.accent} />
            <Text style={styles.statCount}>{dietsCount}</Text>
            <Text style={styles.statLabel}>Meal plans</Text>
          </View>

          <View style={styles.statColumn}>
            <Ionicons name="trophy" size={20} color={CoachColors.accent} />
            <Text style={styles.statCount}>{milestonesCount}</Text>
            <Text style={styles.statLabel}>Rewards</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable onPress={handleContinue} style={styles.continueButtonWrapper}>
          <View style={styles.continueButton}>
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color={CoachColors.onAccent} />
          </View>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['2xl'],
    marginBottom: Spacing.xl,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
  },
  subtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    marginTop: Spacing.xs,
  },
  trackWrapper: {
    height: 140,
    justifyContent: 'center',
  },
  trackContent: {
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    flexDirection: 'row',
  },
  trackLineContainer: {
    position: 'absolute',
    left: Spacing.xl + 28, // center of first node
    right: Spacing.xl + 28,
    top: 28, // center of node vertically
    height: 2,
    zIndex: -1,
  },
  trackLine: {
    flex: 1,
    height: 2,
    backgroundColor: CoachColors.borderMuted,
  },
  nodeItem: {
    alignItems: 'center',
    marginRight: Spacing.xl,
    width: 64, // to ensure consistent spacing and centering
  },
  nodeCircleWrapper: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  nodeCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  lockIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: CoachColors.surface,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeLabel: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 10,
    color: CoachColors.textPrimary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  statsCard: {
    backgroundColor: CoachColors.surface,
    borderColor: CoachColors.borderMuted,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statColumn: {
    alignItems: 'center',
    flex: 1,
  },
  statCount: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 24,
    color: CoachColors.textPrimary,
    marginTop: Spacing.xs,
    marginBottom: Spacing['2xs'],
  },
  statLabel: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 10,
    color: CoachColors.textSecondary,
    textTransform: 'uppercase',
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['2xl'],
    paddingTop: Spacing.md,
  },
  continueButtonWrapper: {
    width: '100%',
  },
  continueButton: {
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.accent,
    gap: Spacing.sm,
  },
  continueButtonText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.onAccent,
  },
});
