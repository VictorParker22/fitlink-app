import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { CoachFonts } from '../constants/coachDesign';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface WeeklyRingProps {
  completed: number;
  total: number;
  size?: number;
  strokeWidth?: number;
  accentColor: string;
  bgColor: string;
  textColor: string;
  subtextColor: string;
}

export default function WeeklyRing({
  completed,
  total,
  size = 160,
  strokeWidth = 12,
  accentColor,
  bgColor,
  textColor,
  subtextColor,
}: WeeklyRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.min(completed / total, 1) : 0;

  const animatedProgress = useSharedValue(0);

  useEffect(() => {
    animatedProgress.value = withTiming(progress, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated progress arc */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={accentColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {/* Center text overlay */}
      <View style={[styles.centerText, { width: size, height: size }]}>
        <Text style={[styles.centerValue, { color: textColor }]}>{completed}</Text>
        <Text style={[styles.centerLabel, { color: subtextColor }]}>of {total} this week</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 40.5,
    lineHeight: 45,
  },
  centerLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5,
    marginTop: 2,
  },
});
