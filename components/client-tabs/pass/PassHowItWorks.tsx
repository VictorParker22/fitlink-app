import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../../constants/theme';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

export const PassHowItWorks: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const toValue = expanded ? 0 : 1;
    setExpanded(!expanded);

    Animated.timing(expandAnim, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const rotateInterpolation = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const contentHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200], // Approximate max height needed
  });

  const contentOpacity = expandAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View style={styles.container}>
      <Pressable style={styles.headerRow} onPress={toggleExpand}>
        <Text style={styles.headerText}>How it works</Text>
        <Animated.View style={{ transform: [{ rotate: rotateInterpolation }] }}>
          <Ionicons name="chevron-down" size={20} color={CoachColors.textMuted} />
        </Animated.View>
      </Pressable>

      <Animated.View
        style={[
          styles.contentContainer,
          { height: contentHeight, opacity: contentOpacity }
        ]}
      >
        <View style={styles.row}>
          <View style={styles.iconCircle}>
            <Ionicons name="barbell" size={18} color={CoachColors.accent} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Complete workouts</Text>
            <Text style={styles.description}>+50 XP per workout</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.iconCircle}>
            <Ionicons name="restaurant" size={18} color={CoachColors.accent} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Log your meals</Text>
            <Text style={styles.description}>+10 XP per meal logged</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.iconCircle}>
            <Ionicons name="fitness" size={18} color={CoachColors.accent} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Gym check-ins</Text>
            <Text style={styles.description}>+50 XP per check-out</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing['2xs'],
  },
  headerText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 10,
    color: CoachColors.textFaint,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  contentContainer: {
    paddingTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textMuted,
  },
});

export default PassHowItWorks;
