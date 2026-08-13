import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { CoachColors, CoachFonts } from '../../../../constants/coachDesign';

interface WizardProgressBarProps {
  currentStep: number;
  totalSteps?: number;
}

export default function WizardProgressBar({ currentStep, totalSteps = 5 }: WizardProgressBarProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <View style={styles.barContainer}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <React.Fragment key={index}>
              <View style={styles.dotContainer}>
                {isCurrent ? (
                  <Animated.View
                    style={[
                      styles.dot,
                      styles.dotCurrent,
                      { transform: [{ scale: pulseAnim }] }
                    ]}
                  />
                ) : (
                  <View
                    style={[
                      styles.dot,
                      isCompleted ? styles.dotCompleted : styles.dotFuture
                    ]}
                  />
                )}
              </View>
              {index < totalSteps - 1 && (
                <View
                  style={[
                    styles.line,
                    index < currentStep ? styles.lineCompleted : styles.lineFuture
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.text}>
        Step {currentStep + 1} of {totalSteps}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    width: '100%',
    paddingHorizontal: 20,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    width: '100%',
  },
  dotContainer: {
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotCompleted: {
    backgroundColor: CoachColors.accent,
    shadowColor: CoachColors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  dotCurrent: {
    backgroundColor: CoachColors.accent,
    shadowColor: CoachColors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  dotFuture: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: CoachColors.border,
  },
  line: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
  },
  lineCompleted: {
    backgroundColor: CoachColors.accent,
  },
  lineFuture: {
    backgroundColor: CoachColors.borderMuted,
  },
  text: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 11,
    color: CoachColors.textMuted,
    letterSpacing: 1,
  },
});
