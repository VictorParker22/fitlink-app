import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { TrackNode } from '../../../context/AppContext';

interface PassJourneyTrackProps {
  trackNodes: TrackNode[];
  currentLevel: number;
  workouts: any[];
  diets: any[];
  onClaim: (node: TrackNode) => void;
  onSelectNode?: (node: TrackNode) => void;
  claiming: string | null;
}

export const PassJourneyTrack: React.FC<PassJourneyTrackProps> = ({
  trackNodes,
  currentLevel,
  workouts,
  diets,
  onClaim,
  onSelectNode,
  claiming,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.8,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    if (trackNodes.length > 0) {
      const nextUnlockIndex = trackNodes.findIndex((_, index) => currentLevel < index + 2);
      if (nextUnlockIndex !== -1 && scrollViewRef.current) {
        // Approximate width of a node + spacing is 80px
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ x: Math.max(0, nextUnlockIndex * 80 - 100), animated: true });
        }, 500);
      }
    }
  }, [trackNodes, currentLevel]);

  if (!trackNodes || trackNodes.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.sectionHeader}>Your journey</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Your coach hasn't set up a reward track yet.</Text>
        </View>
      </View>
    );
  }

  const claimedCount = trackNodes.filter((_, index) => currentLevel >= index + 2).length;
  const remainingCount = trackNodes.length - claimedCount;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeader}>Your journey</Text>
      <Text style={styles.summaryText}>
        {claimedCount} claimed · {remainingCount} remaining
      </Text>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {trackNodes.map((node, index) => {
          const reqLevel = index + 2;
          const isUnlocked = currentLevel >= reqLevel;
          const isNextUnlock = !isUnlocked && (index === 0 || currentLevel >= index + 1); // first locked node
          const isLocked = !isUnlocked && !isNextUnlock;

          let iconName: keyof typeof Ionicons.glyphMap = 'help';
          if (node.type === 'workout') {
            iconName = 'barbell';
          } else if (node.type === 'diet') {
            iconName = 'nutrition';
          } else if (node.type === 'milestone') {
            iconName = 'trophy';
          }

          let nodeName = node.label || node.type;
          if (node.type === 'workout' && node.id) {
            const w = workouts.find((w) => w.id === node.id);
            if (w?.name) nodeName = w.name;
          } else if (node.type === 'diet' && node.id) {
            const d = diets.find((d) => d.id === node.id);
            if (d?.name) nodeName = d.name;
          }

          const isClaimingThis = claiming === `${node.type}-${node.id}`;

          return (
            <View key={`${node.id || index}-${index}`} style={styles.nodeColumn}>
              {index < trackNodes.length - 1 && (
                <View
                  style={[
                    styles.connector,
                    {
                      backgroundColor: isUnlocked ? 'rgba(198,242,78,0.3)' : CoachColors.borderMuted,
                    },
                  ]}
                />
              )}

              <TouchableOpacity
                style={styles.circleContainer}
                activeOpacity={0.75}
                onPress={() => onSelectNode && onSelectNode(node)}
              >
                {isNextUnlock && (
                  <Animated.View
                    style={[
                      styles.pulseRing,
                      {
                        borderColor: CoachColors.accent,
                        opacity: pulseAnim,
                      },
                    ]}
                  />
                )}

                <View
                  style={[
                    styles.circle,
                    isUnlocked ? { backgroundColor: CoachColors.accentSoft } : null,
                    isLocked ? { backgroundColor: CoachColors.borderMuted, opacity: 0.3 } : null,
                    isNextUnlock ? { backgroundColor: CoachColors.accentSofter } : null,
                  ]}
                >
                  <Ionicons
                    name={iconName}
                    size={24}
                    color={isUnlocked || isNextUnlock ? CoachColors.accent : CoachColors.textFaint}
                  />
                  {isLocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={10} color={CoachColors.textMuted} />
                    </View>
                  )}
                </View>

                {isUnlocked && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={10} color={CoachColors.onAccent} />
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.nodeContent}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => onSelectNode && onSelectNode(node)}>
                  <Text style={styles.nodeName} numberOfLines={1}>
                    {nodeName}
                  </Text>
                </TouchableOpacity>

                {isUnlocked && node.type !== 'milestone' && (
                  <TouchableOpacity
                    style={styles.claimButton}
                    onPress={() => onClaim(node)}
                    disabled={!!claiming}
                  >
                    <Text style={styles.claimButtonText}>
                      {isClaimingThis ? '...' : 'Claim'}
                    </Text>
                  </TouchableOpacity>
                )}

                {isNextUnlock && (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>Next</Text>
                  </View>
                )}

                {(isLocked || isNextUnlock) && (
                  <Text style={[styles.levelLabel, isNextUnlock && { color: CoachColors.accent }]}>
                    Lvl {reqLevel}
                  </Text>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius['2xl'],
    padding: 20,
    paddingBottom: 16,
  },
  sectionHeader: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  summaryText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xl,
  },
  scrollContent: {
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  emptyContainer: {
    paddingVertical: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
  },
  nodeColumn: {
    width: 80,
    alignItems: 'center',
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    height: 2,
    width: 80,
    top: 28, // Half of 56px circle
    left: 40,
    zIndex: -1,
  },
  circleContainer: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
  },
  lockOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeContent: {
    alignItems: 'center',
    height: 40,
  },
  nodeName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  claimButton: {
    backgroundColor: CoachColors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing['2xs'],
    borderRadius: Radius.full,
  },
  claimButtonText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.onAccent,
  },
  nextBadge: {
    backgroundColor: CoachColors.accent,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing['2xs'],
    borderRadius: Radius.full,
    marginBottom: 2,
  },
  nextBadgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 9,
    color: CoachColors.onAccent,
  },
  levelLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.textFaint,
  },
});

export default PassJourneyTrack;
