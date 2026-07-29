import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { FontFamily, FontSize, Spacing, Radius } from '../../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
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
              <Ionicons name="person" size={60} color="rgba(255,255,255,0.2)" />
            </View>
          )}
        </View>
        
        <Text style={styles.coachName}>{coach?.name || 'Coach'}</Text>
        <Text style={styles.coachRole}>{coach?.role || 'Elite Trainer'}</Text>
        <Text style={styles.coachSpecialty}>{coach?.specialty || 'General Fitness'}</Text>

        <View style={styles.badgesContainer}>
          <View style={[styles.badge, { borderColor: '#FFD700' }]}>
            <Text style={styles.badgeText}>⭐ 4.9 Rating</Text>
          </View>
          <View style={[styles.badge, { borderColor: '#A78BFA' }]}>
            <Text style={styles.badgeText}>🏆 Verified Coach</Text>
          </View>
          <View style={[styles.badge, { borderColor: '#FF6B35' }]}>
            <Text style={styles.badgeText}>💪 Elite Trainer</Text>
          </View>
          <View style={[styles.badge, { borderColor: '#22C55E' }]}>
            <Text style={styles.badgeText}>✓ Certified</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.unlockHeader}>WHAT YOU UNLOCK</Text>

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
                <Ionicons name="checkmark-circle" size={20} color="#FFD700" style={styles.featureIcon} />
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
          <LinearGradient
            colors={['#FFD700', '#B89B00']}
            style={styles.continueButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={styles.continueButtonText}>CONTINUE</Text>
            <Ionicons name="arrow-forward" size={20} color="#000000" />
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
    borderColor: '#FFD700',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#FFD700',
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachName: {
    fontFamily: 'Epilogue-ExtraBold',
    fontSize: 28,
    color: '#FFFFFF',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  coachRole: {
    fontFamily: 'Epilogue-Medium',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: Spacing['2xs'],
  },
  coachSpecialty: {
    fontFamily: 'Epilogue-Regular',
    fontSize: 13,
    color: '#FFD700',
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
    backgroundColor: '#111114',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontFamily: 'Epilogue-Medium',
    fontSize: 11,
    color: '#FFFFFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#1C1C1E',
    marginVertical: 24,
  },
  unlockHeader: {
    fontFamily: 'Epilogue-Bold',
    fontSize: 13,
    color: '#FFD700',
    letterSpacing: 2,
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
    fontFamily: 'Epilogue-Regular',
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },
  archetypeText: {
    fontFamily: 'Epilogue-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
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
  },
  continueButtonText: {
    fontFamily: 'Epilogue-Bold',
    fontSize: 16,
    color: '#000000',
    marginRight: Spacing.sm,
  },
});
