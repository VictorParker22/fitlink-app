import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { FontFamily, FontSize, Spacing, Radius } from '../../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../../context/ThemeContext';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

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
  const { colors } = useTheme();

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
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <Text style={styles.tagHeader}>DAILY PROGRESS // RINGS</Text>
      
      <View style={styles.ringsContainer}>
        <Svg width={size} height={size} style={styles.svg}>
          {renderRing(outerRadius, '#FF6B35', animWorkout)}
          {stepsToday !== null && renderRing(midRadius, '#22C55E', animSteps)}
          {renderRing(innerRadius, '#4D94FF', animMeals)}
        </Svg>
        
        <View style={styles.centerContent}>
          {isComplete ? (
            <View style={styles.completeBadge}>
              <Ionicons name="checkmark" size={24} color="#FFD700" />
            </View>
          ) : (
            <Text style={styles.centerText}>{Math.round(maxProgress * 100)}%</Text>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(255,107,53,0.12)' }]}>
            <Ionicons name="flame" size={14} color="#FF6B35" />
          </View>
          <View>
            <Text style={styles.legendLabel}>Workout</Text>
            <Text style={styles.legendValue}>{todayWorkoutMinutes}/{targetMinutes} m</Text>
          </View>
        </View>

        {stepsToday !== null && (
          <View style={styles.legendItem}>
            <View style={[styles.iconContainer, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
              <Ionicons name="footsteps" size={14} color="#22C55E" />
            </View>
            <View>
              <Text style={styles.legendLabel}>Steps</Text>
              <Text style={styles.legendValue}>{stepsToday}/{targetSteps}</Text>
            </View>
          </View>
        )}

        <View style={styles.legendItem}>
          <View style={[styles.iconContainer, { backgroundColor: 'rgba(77,148,255,0.12)' }]}>
            <Ionicons name="restaurant" size={14} color="#4D94FF" />
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
  },
  tagHeader: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.35)',
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: FontSize.xl,
    color: '#FFFFFF',
  },
  completeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,215,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.35)',
  },
  legendValue: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.xs,
    color: '#FFFFFF',
    marginTop: Spacing['2xs'],
  }
});
