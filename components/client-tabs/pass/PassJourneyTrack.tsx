import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FontFamily, Spacing, Radius } from '../../../constants/theme';
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
        <Text style={styles.sectionHeader}>YOUR JOURNEY</Text>
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
      <Text style={styles.sectionHeader}>YOUR JOURNEY</Text>
      <Text style={styles.summaryText}>
        {claimedCount} Claimed · {remainingCount} Remaining
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
          let color = '#FFFFFF';
          if (node.type === 'workout') {
            iconName = 'barbell';
            color = '#FF6B35';
          } else if (node.type === 'diet') {
            iconName = 'nutrition';
            color = '#A78BFA';
          } else if (node.type === 'milestone') {
            iconName = 'trophy';
            color = '#FFD700';
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
                      backgroundColor: isUnlocked ? `${color}4D` : 'rgba(255,255,255,0.06)',
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
                        borderColor: '#FFD700',
                        opacity: pulseAnim,
                      },
                    ]}
                  />
                )}
                
                <View
                  style={[
                    styles.circle,
                    isUnlocked ? { backgroundColor: `${color}26` } : null,
                    isLocked ? { backgroundColor: 'rgba(255,255,255,0.05)', opacity: 0.3 } : null,
                    isNextUnlock ? { backgroundColor: `${color}1A` } : null,
                  ]}
                >
                  <Ionicons
                    name={iconName}
                    size={24}
                    color={isUnlocked || isNextUnlock ? color : 'rgba(255,255,255,0.2)'}
                  />
                  {isLocked && (
                    <View style={styles.lockOverlay}>
                      <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.5)" />
                    </View>
                  )}
                </View>

                {isUnlocked && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={10} color="#000000" />
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
                    style={[styles.claimButton, { backgroundColor: color }]}
                    onPress={() => onClaim(node)}
                    disabled={!!claiming}
                  >
                    <Text style={styles.claimButtonText}>
                      {isClaimingThis ? '...' : 'CLAIM'}
                    </Text>
                  </TouchableOpacity>
                )}

                {isNextUnlock && (
                  <View style={styles.nextBadge}>
                    <Text style={styles.nextBadgeText}>NEXT</Text>
                  </View>
                )}

                {(isLocked || isNextUnlock) && (
                  <Text style={[styles.levelLabel, isNextUnlock && { color: '#FFD700' }]}>
                    LVL {reqLevel}
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
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius['2xl'],
    padding: 20,
    paddingBottom: 16,
  },
  sectionHeader: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  summaryText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
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
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
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
    backgroundColor: '#FFD700',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeContent: {
    alignItems: 'center',
    height: 40,
  },
  nodeName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  claimButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing['2xs'],
    borderRadius: Radius.full,
  },
  claimButtonText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FFFFFF',
  },
  nextBadge: {
    backgroundColor: '#FFD700',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing['2xs'],
    borderRadius: Radius.full,
    marginBottom: 2,
  },
  nextBadgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#000000',
  },
  levelLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
  },
});

export default PassJourneyTrack;
