import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Spacing } from '../../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../../constants/coachDesign';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';

interface Coach {
  id: string;
  name: string;
  role: string;
  avatar: string;
  specialty: string;
  bio: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
  period?: string;
  features?: string[];
  color?: string;
}

interface StepCoachProfileProps {
  coach: Coach | null;
  plan: Plan;
  archetype: string | null;
  onContinue: () => void;
}

const DEFAULT_FEATURES = [
  'Custom weekly workout plan',
  'Direct coach messaging',
  'Unlock FitLink Pass track'
];

export const StepCoachProfile: React.FC<StepCoachProfileProps> = ({ coach, plan, archetype, onContinue }) => {
  const features = plan.features && plan.features.length > 0 ? plan.features : DEFAULT_FEATURES;
  const animatedValues = useRef(features.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = features.map((_, index) => {
      return Animated.timing(animatedValues[index], {
        toValue: 1,
        duration: 400,
        delay: index * 150,
        useNativeDriver: true,
      });
    });

    Animated.stagger(150, animations).start();
  }, [features, animatedValues]);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onContinue();
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          {coach?.avatar ? (
            <Image
              source={{ uri: coach.avatar }}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={60} color={CoachColors.textFaint} />
            </View>
          )}
        </View>

        <Text style={styles.coachName}>{coach?.name || 'Coach'}</Text>
        <Text style={styles.coachRole}>{coach?.role || 'Elite trainer'}</Text>
        <Text style={styles.coachSpecialty}>{coach?.specialty || 'General fitness'}</Text>

        <View style={styles.badgesContainer}>
          <View style={styles.badge}>
            <Ionicons name="shield-checkmark" size={12} color={CoachColors.accent} />
            <Text style={styles.badgeText}>Verified coach</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="barbell" size={12} color={CoachColors.accent} />
            <Text style={styles.badgeText}>Elite trainer</Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={12} color={CoachColors.accent} />
            <Text style={styles.badgeText}>Certified</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.unlockHeader}>What you unlock</Text>

        <View style={styles.featuresList}>
          {features.map((feature, index) => {
            const translateY = animatedValues[index].interpolate({
              inputRange: [0, 1],
              outputRange: [20, 0]
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.featureRow,
                  {
                    opacity: animatedValues[index],
                    transform: [{ translateY }]
                  }
                ]}
              >
                <Ionicons name="checkmark-circle" size={20} color={CoachColors.accent} style={styles.featureIcon} />
                <Text style={styles.featureText}>{feature}</Text>
              </Animated.View>
            );
          })}
        </View>

        {archetype && coach?.name && (
          <Text style={styles.archetypeText}>
            Coach {coach.name} has crafted a program for {archetype} athletes
          </Text>
        )}
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['2xl'],
  },
  avatarContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: CoachColors.accent,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: CoachColors.accent,
    backgroundColor: CoachColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
    textAlign: 'center',
  },
  coachRole: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing['2xs'],
  },
  coachSpecialty: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.accent,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  badge: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 11,
    color: CoachColors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginVertical: 24,
  },
  unlockHeader: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13,
    color: CoachColors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.lg,
  },
  featuresList: {
    gap: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureIcon: {
    marginRight: Spacing.sm,
  },
  featureText: {
    fontFamily: CoachFonts.body,
    fontSize: 15,
    color: CoachColors.textPrimary,
    flex: 1,
  },
  archetypeText: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: Spacing['2xl'],
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
