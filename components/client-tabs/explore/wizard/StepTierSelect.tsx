import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily, FontSize, Spacing, Radius } from '../../../../constants/theme';

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
    if (price >= 200) return { label: 'DIAMOND', color: '#B9F2FF' };
    if (price >= 100) return { label: 'GOLD', color: '#FFD700' };
    if (price >= 50) return { label: 'SILVER', color: '#C0C0C0' };
    return { label: 'BRONZE', color: '#CD7F32' };
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
        <Text style={styles.title}>SELECT YOUR TIER</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>RESERVED FOR YOU</Text>
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
                    <Text style={styles.recommendedText}>RECOMMENDED</Text>
                  </View>
                )}

                <View style={styles.cardHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <View style={[styles.tierBadge, { borderColor: tier.color }]}>
                    <Text style={[styles.tierText, { color: tier.color }]}>{tier.label}</Text>
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
                      <Ionicons name="checkmark" size={16} color={isSelected ? '#FFD700' : 'rgba(255,255,255,0.5)'} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.selectButton, isSelected && styles.selectButtonActive]}>
                  <Text style={[styles.selectButtonText, isSelected && styles.selectButtonTextActive]}>
                    {isSelected ? 'SELECTED' : 'SELECT'}
                  </Text>
                </View>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
        
        <Text style={styles.lossAversion}>
          Your custom {archetype || "training"} blueprint expires when you leave this screen
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity activeOpacity={0.8} onPress={handleContinue} style={styles.ctaWrapper}>
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cta}
          >
            <View style={styles.ctaContent}>
              <Text style={styles.ctaText}>CLAIM YOUR ACCESS</Text>
              <Ionicons name="arrow-forward" size={20} color="#000" />
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
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
  },
  title: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28,
    color: '#FFFFFF',
    marginBottom: Spacing.xs,
  },
  badge: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#FFD700',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing['2xs'],
  },
  badgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#FFD700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  card: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  cardSelected: {
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  recommendedRibbon: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FFD700',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing['2xs'],
    borderBottomLeftRadius: 8,
  },
  recommendedText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#000000',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  planName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 20,
    color: '#FFFFFF',
  },
  tierBadge: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  tierText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 32,
    color: '#FFFFFF',
  },
  period: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 4,
  },
  perSession: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
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
    fontFamily: FontFamily.body,
    fontSize: 14,
    color: '#FFFFFF',
    marginLeft: Spacing.sm,
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#1C1C1E',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  selectButtonActive: {
    backgroundColor: '#FFD700',
    borderColor: '#FFD700',
  },
  selectButtonText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  selectButtonTextActive: {
    color: '#000000',
  },
  lossAversion: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: Spacing.lg,
  },
  footer: {
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'],
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1C1C1E',
  },
  ctaWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  cta: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  ctaText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 16,
    color: '#000000',
    marginRight: Spacing.xs,
  },
  shimmerContainer: {
    ...StyleSheet.absoluteFillObject,
    width: 200,
  },
});
