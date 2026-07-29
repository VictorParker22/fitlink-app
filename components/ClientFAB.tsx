import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ClientRoute } from '../types/routes';
import { FontFamily } from '../constants/theme';
import * as Haptics from 'expo-haptics';
import { useClient } from '../context/ClientContext';
import { useWorkout } from '../context/WorkoutContext';

const TIMING_CONFIG = { duration: 250, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const BTN_SIZE = 56;
const ACTION_SIZE = 44;
const ACTION_GAP = 56;

export default function ClientFAB() {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  const { todayWorkout, trainer } = useClient();
  const { activeSession } = useWorkout();

  // Hide FAB during active workout session so WorkoutMiniPlayer takes center stage
  const isWorkoutActive = activeSession?.isActive && activeSession.setupComplete;

  const bottomPadding = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'android' ? 16 : 8);
  const tabBarHeight = 8 + 40 + bottomPadding;
  const fabBottom = tabBarHeight + 16;

  // Determine dynamic contextual actions based on client state
  const actions = useMemo(() => {
    const hour = new Date().getHours();
    const result = [];

    // Action 1: Today's Workout or Catalog
    if (todayWorkout) {
      result.push({
        label: `START: ${(todayWorkout.title || 'WORKOUT').toUpperCase()}`,
        icon: 'play-circle-outline' as const,
        route: ClientRoute.workouts,
      });
    } else {
      result.push({
        label: 'WORKOUT CATALOG',
        icon: 'barbell-outline' as const,
        route: ClientRoute.workouts,
      });
    }

    // Action 2: Diet Plan or Meal Log
    result.push({
      label: hour >= 18 ? 'LOG DINNER' : 'NUTRITION PLAN',
      icon: 'restaurant-outline' as const,
      route: ClientRoute.myDiet,
    });

    // Action 3: Message Coach (if paired) or Log Progress
    if (trainer) {
      result.push({
        label: `MESSAGE ${(trainer.name?.split(' ')[0] || 'COACH').toUpperCase()}`,
        icon: 'chatbubble-outline' as const,
        route: ClientRoute.myMessages,
      });
    } else {
      result.push({
        label: 'PERFORMANCE LOG',
        icon: 'stats-chart-outline' as const,
        route: ClientRoute.myProgress,
      });
    }

    return result;
  }, [todayWorkout, trainer]);

  const toggleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !isOpen;
    setIsOpen(next);
    progress.value = withTiming(next ? 1 : 0, TIMING_CONFIG);
  }, [isOpen]);

  const handleAction = useCallback((route: string) => {
    setIsOpen(false);
    progress.value = withTiming(0, { duration: 150 });
    setTimeout(() => {
      router.push(route as any);
    }, 160);
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0, 1]),
    pointerEvents: progress.value > 0.1 ? 'auto' : 'none',
  }));

  const mainBtnStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 45])}deg` }],
  }));

  if (isWorkoutActive) {
    return null;
  }

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, overlayStyle, { backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 99 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={toggleOpen} />
      </Animated.View>

      <View style={[st.container, { bottom: fabBottom }]} pointerEvents="box-none">
        {actions.map((action, index) => (
          <ActionItem
            key={action.label}
            label={action.label}
            icon={action.icon}
            index={index}
            progress={progress}
            onPress={() => handleAction(action.route)}
          />
        ))}

        <Pressable onPress={toggleOpen} hitSlop={0} style={st.mainBtnPressable}>
          <Animated.View style={[st.mainBtnBg, mainBtnStyle]}>
            <Ionicons name="add" size={28} color="#000000" />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

function ActionItem({
  label,
  icon,
  index,
  progress,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  index: number;
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const animStyle = useAnimatedStyle(() => {
    const offset = ACTION_GAP * (index + 1) + BTN_SIZE / 2 - ACTION_SIZE / 2;
    const translateY = interpolate(progress.value, [0, 1], [offset, 0], Extrapolation.CLAMP);
    const opacity = interpolate(progress.value, [0, 0.4, 1], [0, 0, 1], Extrapolation.CLAMP);
    const scale = interpolate(progress.value, [0, 0.4, 1], [0.6, 0.6, 1], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY }, { scale }],
      pointerEvents: progress.value > 0.5 ? 'auto' : 'none',
    };
  });

  return (
    <Animated.View style={[st.actionRow, animStyle]}>
      <View style={st.labelCard}>
        <Text style={st.actionLabel}>{label}</Text>
      </View>
      <Pressable style={st.actionBtn} onPress={onPress} hitSlop={4}>
        <Ionicons name={icon} size={20} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    alignItems: 'flex-end',
    zIndex: 100,
  },
  mainBtnPressable: {
    width: BTN_SIZE,
    height: BTN_SIZE,
  },
  mainBtnBg: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  labelCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginRight: 10,
  },
  actionLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 1.2,
  },
  actionBtn: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: 12,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: '#4D94FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
