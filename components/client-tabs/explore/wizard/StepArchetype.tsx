import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { FontFamily, FontSize, Spacing, Radius } from '../../../../constants/theme';

interface StepArchetypeProps {
  onSelect: (archetype: string) => void;
  onContinue: () => void;
  selectedArchetype: string | null;
}

const ARCHETYPES = [
  {
    id: 'FORGE',
    title: 'FORGE',
    subtitle: 'Strength & Hypertrophy',
    icon: 'barbell' as const,
    accent: '#FF6B35',
    description: 'Raw power. Progressive overload. Built for lifters who chase the iron.'
  },
  {
    id: 'VELOCITY',
    title: 'VELOCITY',
    subtitle: 'Speed & Conditioning',
    icon: 'flash' as const,
    accent: '#4D94FF',
    description: 'Explosive speed. Cardio endurance. Built for athletes who dominate the field.'
  },
  {
    id: 'MERIDIAN',
    title: 'MERIDIAN',
    subtitle: 'Recovery & Mind-Body',
    icon: 'leaf' as const,
    accent: '#22C55E',
    description: 'Deep restoration. Flexibility. Built for those who master balance.'
  }
];

export default function StepArchetype({ onSelect, onContinue, selectedArchetype }: StepArchetypeProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>CHOOSE YOUR PATH</Text>
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
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueButton}
          >
            <Text style={styles.continueButtonText}>CONTINUE</Text>
            <Ionicons name="arrow-forward" size={20} color="#000000" />
          </LinearGradient>
        ) : (
          <View style={[styles.continueButton, styles.continueButtonDisabled]}>
            <Text style={styles.continueButtonTextDisabled}>CONTINUE</Text>
            <Ionicons name="arrow-forward" size={20} color="#444444" />
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
            { backgroundColor: isSelected ? `${archetype.accent}33` : `${archetype.accent}1A` } 
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
    backgroundColor: '#000000',
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontFamily: 'Epilogue-ExtraBold',
    fontSize: 28,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'Epilogue-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  cardsContainer: {
    gap: 16,
    flex: 1,
  },
  card: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#1C1C1E',
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
    fontFamily: 'Epilogue-Bold',
    fontSize: 18,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardDescription: {
    fontFamily: 'Epilogue-Regular',
    fontSize: 13,
    color: '#888888',
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
  },
  continueButtonDisabled: {
    backgroundColor: '#1C1C1E',
  },
  continueButtonText: {
    fontFamily: 'Epilogue-Bold',
    fontSize: 16,
    color: '#000000',
    letterSpacing: 1,
  },
  continueButtonTextDisabled: {
    fontFamily: 'Epilogue-Bold',
    fontSize: 16,
    color: '#444444',
    letterSpacing: 1,
  },
});
