import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../../constants/coachDesign';

interface StepArchetypeProps {
  onSelect: (archetype: string) => void;
  onContinue: () => void;
  selectedArchetype: string | null;
}

const ARCHETYPES = [
  {
    id: 'FORGE',
    title: 'Forge',
    subtitle: 'Strength & hypertrophy',
    icon: 'barbell' as const,
    accent: CoachColors.accent,
    description: 'Raw power. Progressive overload. Built for lifters who chase the iron.'
  },
  {
    id: 'VELOCITY',
    title: 'Velocity',
    subtitle: 'Speed & conditioning',
    icon: 'flash' as const,
    accent: CoachColors.accent,
    description: 'Explosive speed. Cardio endurance. Built for athletes who dominate the field.'
  },
  {
    id: 'MERIDIAN',
    title: 'Meridian',
    subtitle: 'Recovery & mind-body',
    icon: 'leaf' as const,
    accent: CoachColors.accent,
    description: 'Deep restoration. Flexibility. Built for those who master balance.'
  }
];

export default function StepArchetype({ onSelect, onContinue, selectedArchetype }: StepArchetypeProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose your path</Text>
        <Text style={styles.subtitle}>Select the archetype that defines your training philosophy</Text>
      </View>

      <View style={styles.cardsContainer}>
        {ARCHETYPES.map((arch) => (
          <ArchetypeCard
            key={arch.id}
            archetype={arch}
            isSelected={selectedArchetype === arch.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(arch.id);
            }}
          />
        ))}
      </View>

      <Pressable
        style={styles.continueButtonContainer}
        disabled={!selectedArchetype}
        onPress={() => {
          if (selectedArchetype) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onContinue();
          }
        }}
      >
        {selectedArchetype ? (
          <View style={styles.continueButton}>
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color={CoachColors.onAccent} />
          </View>
        ) : (
          <View style={[styles.continueButton, styles.continueButtonDisabled]}>
            <Text style={styles.continueButtonTextDisabled}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color={CoachColors.textFaint} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

function ArchetypeCard({ archetype, isSelected, onPress }: { archetype: any; isSelected: boolean; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isSelected ? 1.02 : 1.0,
      friction: 5,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [isSelected, scaleAnim]);

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[
          styles.card,
          { transform: [{ scale: scaleAnim }] },
          isSelected && { borderColor: archetype.accent },
        ]}
      >
        {isSelected && (
          <View style={[styles.activeBorderLeft, { backgroundColor: archetype.accent }]} />
        )}

        <View
          style={[
            styles.iconContainer,
            { backgroundColor: isSelected ? CoachColors.accentSoft : CoachColors.accentSofter }
          ]}
        >
          <Ionicons name={archetype.icon} size={24} color={archetype.accent} />
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{archetype.title}</Text>
          <Text style={styles.cardDescription}>{archetype.description}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CoachColors.bg,
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    color: CoachColors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  cardsContainer: {
    gap: 16,
    flex: 1,
  },
  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  activeBorderLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginBottom: 4,
  },
  cardDescription: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    lineHeight: 18,
  },
  continueButtonContainer: {
    marginTop: 24,
    marginBottom: 20,
  },
  continueButton: {
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: CoachColors.accent,
  },
  continueButtonDisabled: {
    backgroundColor: CoachColors.surface,
  },
  continueButtonText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.onAccent,
    letterSpacing: 1,
  },
  continueButtonTextDisabled: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.textFaint,
    letterSpacing: 1,
  },
});
