import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { FontSize, Spacing, Radius } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

// Single accent, distinguished by tone: accent for the outer ring, neutral
// grays for the inner rings.
const RING_WORKOUT = CoachColors.accent;
const RING_STEPS = CoachColors.textSecondary;
const RING_MEALS = CoachColors.textFaint;

export interface ActivityTripleRingsProps {
  todayWorkoutMinutes: number;
  stepsToday: number | null;
  mealsLoggedToday: number;
  targetMinutes?: number;
  targetSteps?: number;
  targetMeals?: number;
}

export const ActivityTripleRings: React.FC<ActivityTripleRingsProps> = ({
  todayWorkoutMinutes,
  stepsToday,
  mealsLoggedToday,
  targetMinutes = 30,
  targetSteps = 8000,
  targetMeals = 3,
}) => {
  const workoutProgress = Math.min(todayWorkoutMinutes / targetMinutes, 1);
  const stepsProgress = stepsToday !== null ? Math.min(stepsToday / targetSteps, 1) : null;
  const mealsProgress = Math.min(mealsLoggedToday / targetMeals, 1);

  const isComplete = workoutProgress >= 1 && (stepsProgress === null || stepsProgress >= 1) && mealsProgress >= 1;
  const maxProgress = Math.max(workoutProgress, stepsProgress || 0, mealsProgress);

  const animWorkout = useRef(new Animated.Value(0)).current;
  const animSteps = useRef(new Animated.Value(0)).current;
  const animMeals = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animations = [
      Animated.timing(animWorkout, {
        toValue: workoutProgress,
        duration: 600,
        useNativeDriver: false,
      }),
      Animated.timing(animMeals, {
        toValue: mealsProgress,
        duration: 600,
        useNativeDriver: false,
      })
    ];

    if (stepsProgress !== null) {
      animations.splice(1, 0, Animated.timing(animSteps, {
        toValue: stepsProgress,
        duration: 600,
        useNativeDriver: false,
      }));
    }

    Animated.stagger(200, animations).start(({ finished }) => {
      if (finished) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    });
  }, [workoutProgress, stepsProgress, mealsProgress]);

  const size = 160;
  const strokeWidth = 10;
  const center = size / 2;

  const outerRadius = 70;
  const midRadius = 55;
  const innerRadius = stepsToday !== null ? 40 : 55;

  const renderRing = (radius: number, color: string, animValue: Animated.Value) => {
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [circumference, 0]
    });

    return (
      <React.Fragment key={color}>
        <SvgCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeOpacity={0.1}
        />
        <AnimatedCircle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </React.Fragment>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.tagHeader}>Daily progress</Text>

      <View style={styles.ringsContainer}>
        <Svg width={size} height={size} style={styles.svg}>
          {renderRing(outerRadius, RING_WORKOUT, animWorkout)}
          {stepsToday !== null && renderRing(midRadius, RING_STEPS, animSteps)}
          {renderRing(innerRadius, RING_MEALS, animMeals)}
        </Svg>

        <View style={styles.centerContent}>
          {isComplete ? (
            <View style={styles.completeBadge}>
              <Ionicons name="checkmark" size={24} color={CoachColors.accent} />
            </View>
          ) : (
            <Text style={styles.centerText}>{Math.round(maxProgress * 100)}%</Text>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.iconContainer, { backgroundColor: CoachColors.accentSoft }]}>
            <Ionicons name="flame" size={14} color={RING_WORKOUT} />
          </View>
          <View>
            <Text style={styles.legendLabel}>Workout</Text>
            <Text style={styles.legendValue}>{todayWorkoutMinutes}/{targetMinutes} m</Text>
          </View>
        </View>

        {stepsToday !== null && (
          <View style={styles.legendItem}>
            <View style={[styles.iconContainer, { backgroundColor: CoachColors.borderMuted }]}>
              <Ionicons name="footsteps" size={14} color={RING_STEPS} />
            </View>
            <View>
              <Text style={styles.legendLabel}>Steps</Text>
              <Text style={styles.legendValue}>{stepsToday}/{targetSteps}</Text>
            </View>
          </View>
        )}

        <View style={styles.legendItem}>
          <View style={[styles.iconContainer, { backgroundColor: CoachColors.borderMuted }]}>
            <Ionicons name="restaurant" size={14} color={RING_MEALS} />
          </View>
          <View>
            <Text style={styles.legendLabel}>Meals</Text>
            <Text style={styles.legendValue}>{mealsLoggedToday}/{targetMeals}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Radius['2xl'],
    padding: Spacing.xl,
    width: '100%',
    backgroundColor: CoachColors.surface,
    borderColor: CoachColors.borderMuted,
  },
  tagHeader: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: Spacing.xl,
  },
  ringsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
    marginBottom: 24,
  },
  svg: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }]
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    fontFamily: CoachFonts.headingBold,
    fontSize: FontSize.xl,
    color: CoachColors.textPrimary,
  },
  completeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CoachColors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(198,242,78,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: CoachColors.borderMuted,
    marginBottom: 20,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: Spacing.lg,
  },
  legendItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.xs,
    color: CoachColors.textMuted,
  },
  legendValue: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: FontSize.xs,
    color: CoachColors.textPrimary,
    marginTop: Spacing['2xs'],
  }
});
