import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { FontFamily, FontSize } from '../constants/theme';

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
        <Defs>
          <LinearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={accentColor} />
            <Stop offset="100%" stopColor="#FF9F6B" />
          </LinearGradient>
        </Defs>
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
          stroke="url(#ringGradient)"
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
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 36,
    lineHeight: 40,
  },
  centerLabel: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
});
