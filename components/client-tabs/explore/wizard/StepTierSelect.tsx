import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing, Radius } from '../../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../../constants/coachDesign';

export interface Plan {
  id: string;
  name: string;
  price: number;
  period?: string;
  features?: string[];
  isPopular?: boolean;
  coachName: string;
  coachRole: string;
  coachAvatar: string;
  color?: string;
}

interface StepTierSelectProps {
  plans: Plan[];
  selectedPlanId: string;
  archetype: string | null;
  onSelectPlan: (planId: string) => void;
  onContinue: () => void;
}

export const StepTierSelect: React.FC<StepTierSelectProps> = ({
  plans,
  selectedPlanId,
  archetype,
  onSelectPlan,
  onContinue,
}) => {
  const shimmerValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerValue, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerValue, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  const getTierBadge = (price: number) => {
    if (price >= 200) return { label: 'Diamond' };
    if (price >= 100) return { label: 'Gold' };
    if (price >= 50) return { label: 'Silver' };
    return { label: 'Bronze' };
  };

  const sortedPlans = [...plans].sort((a, b) => b.price - a.price);

  const handleSelect = (id: string) => {
    if (id !== selectedPlanId) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSelectPlan(id);
    }
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onContinue();
  };

  const shimmerTranslateX = shimmerValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select your tier</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Reserved for you</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {sortedPlans.map((plan) => {
          const isSelected = plan.id === selectedPlanId;
          const tier = getTierBadge(plan.price);
          const perSession = Math.round(plan.price / 16);

          return (
            <TouchableOpacity
              key={plan.id}
              activeOpacity={0.9}
              onPress={() => handleSelect(plan.id)}
            >
              <Animated.View
                style={[
                  styles.card,
                  isSelected && styles.cardSelected,
                  isSelected && { transform: [{ scale: 1.02 }] }
                ]}
              >
                {isSelected && (
                  <View style={styles.recommendedRibbon}>
                    <Text style={styles.recommendedText}>Selected</Text>
                  </View>
                )}

                <View style={styles.cardHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <View style={styles.tierBadge}>
                    <Text style={styles.tierText}>{tier.label}</Text>
                  </View>
                </View>

                <View style={styles.priceContainer}>
                  <Text style={styles.price}>${plan.price}</Text>
                  <Text style={styles.period}>/mo</Text>
                </View>
                <Text style={styles.perSession}>~${perSession} per session</Text>

                <View style={styles.features}>
                  {plan.features?.slice(0, 3).map((feature, idx) => (
                    <View key={idx} style={styles.featureRow}>
                      <Ionicons name="checkmark" size={16} color={isSelected ? CoachColors.accent : CoachColors.textMuted} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.selectButton, isSelected && styles.selectButtonActive]}>
                  <Text style={[styles.selectButtonText, isSelected && styles.selectButtonTextActive]}>
                    {isSelected ? 'Selected' : 'Select'}
                  </Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={0.8} onPress={handleContinue} style={styles.ctaWrapper}>
          <View style={styles.cta}>
            <View style={styles.ctaContent}>
              <Text style={styles.ctaText}>Claim your access</Text>
              <Ionicons name="arrow-forward" size={20} color={CoachColors.onAccent} />
            </View>
            <Animated.View
              style={[
                styles.shimmerContainer,
                { transform: [{ translateX: shimmerTranslateX }] },
              ]}
            >
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        </TouchableOpacity>
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
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
    marginBottom: Spacing.xs,
  },
  badge: {
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: CoachColors.accent,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing['2xs'],
  },
  badgeText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    padding: 20,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  cardSelected: {
    borderWidth: 3,
    borderColor: CoachColors.accent,
  },
  recommendedRibbon: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: CoachColors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing['2xs'],
    borderBottomLeftRadius: 8,
  },
  recommendedText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.onAccent,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  planName: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
  },
  tierBadge: {
    borderWidth: 1,
    borderColor: CoachColors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  tierText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.accent,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 32,
    color: CoachColors.textPrimary,
  },
  period: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textSecondary,
    marginLeft: 4,
  },
  perSession: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textSecondary,
    marginBottom: Spacing.lg,
  },
  features: {
    marginBottom: Spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  featureText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textPrimary,
    marginLeft: Spacing.sm,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  selectButtonActive: {
    backgroundColor: CoachColors.accent,
    borderColor: CoachColors.accent,
  },
  selectButtonText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },
  selectButtonTextActive: {
    color: CoachColors.onAccent,
  },
  footer: {
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    backgroundColor: CoachColors.bg,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  ctaWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cta: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CoachColors.accent,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
    gap: Spacing.xs,
  },
  ctaText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.onAccent,
  },
  shimmerContainer: {
    ...StyleSheet.absoluteFillObject,
    width: 200,
  },
});
