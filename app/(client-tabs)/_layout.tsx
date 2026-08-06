/**
 * (client-tabs)/_layout.tsx — Glassmorphism Tab Bar (Klarna-style)
 *
 * Key decisions matching Klarna's execution:
 *  1. Bar is tall (~85px) — not a thin strip
 *  2. Active chip is a LARGE white-glass oval, nearly fills the bar height
 *     (NOT a colored tint — a brighter frosted glass within the darker glass)
 *  3. BlurView at high intensity with very low ambient fill — content bleeds through
 *  4. Active icon = white at full opacity, inactive = white at ~35%
 *  5. Chip has a white-ish glass background (rgba white ~13%) + brighter border
 *  6. Chip slides smoothly on tab switch
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';
import WorkoutMiniPlayer from '../../components/WorkoutMiniPlayer';
import OfflineBanner from '../../components/OfflineBanner';
import { useClient } from '../../context/ClientContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Tab config ───────────────────────────────────────────────────────────────
const VISIBLE_TABS = [
  { name: 'index',           label: 'Home',     icon: 'home-outline',        iconFocused: 'home',        hint: 'Your daily command centre' },
  { name: 'workouts',        label: 'Train',    icon: 'barbell-outline',     iconFocused: 'barbell',     hint: 'Browse and start your workouts' },
  { name: 'explore-classes', label: 'Explore',  icon: 'compass-outline',     iconFocused: 'compass',     hint: 'Discover classes, programs, coaches' },
  { name: 'my-progress',     label: 'Progress', icon: 'trending-up-outline', iconFocused: 'trending-up', hint: 'Track your fitness progress' },
  { name: 'my-messages',     label: 'Coach',    icon: 'chatbubble-outline',  iconFocused: 'chatbubble',  hint: 'Message your coach' },
] as const;

const TAB_COUNT = VISIBLE_TABS.length;
const BAR_H     = 84;                            // tall — Klarna-style
const MARGIN    = 14;
const BAR_WIDTH = SCREEN_WIDTH - MARGIN * 2;
const TAB_WIDTH = BAR_WIDTH / TAB_COUNT;

// Chip — white-glass oval, nearly fills bar height
const CHIP_H = 66;
const CHIP_W = TAB_WIDTH - 10;

const SPRING = { damping: 20, stiffness: 260, mass: 0.7 };

// ─── Glass Tab Bar ────────────────────────────────────────────────────────────
function GlassTabBar({ state, navigation }: any) {
  const insets    = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);
  const activeIdx = useSharedValue(state.index);
  const { todayWorkout, progressLogs } = useClient();

  // Derive workout completion from progressLogs — same logic as index.tsx
  const isWorkoutCompletedToday = useMemo(() => {
    if (!todayWorkout) return false;
    const today = new Date().toISOString().split('T')[0];
    // Check if todayWorkout status is completed OR if there's a progress log for today
    if (todayWorkout.status === 'completed') return true;
    if (!progressLogs || progressLogs.length === 0) return false;
    // Check for a workout log entry dated today
    return progressLogs.some((log: any) => {
      const logDate = (log.created_at || log.date || '').split('T')[0];
      return logDate === today && log.workout_id === todayWorkout.id;
    });
  }, [todayWorkout, progressLogs]);

  // White-glass chip slides across
  const chipStyle = useAnimatedStyle(() => {
    const x = activeIdx.value * TAB_WIDTH + (TAB_WIDTH - CHIP_W) / 2;
    return { transform: [{ translateX: withSpring(x, SPRING) }] };
  });

  const visibleRoutes = state.routes.filter((r: any) =>
    VISIBLE_TABS.some(t => t.name === r.name)
  );

  const handlePress = useCallback(
    (routeName: string, routeKey: string, tabIndex: number) => {
      activeIdx.value = tabIndex;
      Haptics.selectionAsync();
      const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
      if (!event.defaultPrevented) navigation.navigate(routeName);
    },
    [navigation, activeIdx]
  );

  return (
    <View style={[styles.outerContainer, { paddingBottom: bottomPad }]}>
      <WorkoutMiniPlayer />

      {/* THE PILL — overflow:hidden clips BlurView + chip to pill shape */}
      <View style={styles.pill}>

        {/* ① Dark frosted glass — high intensity, low fill = content bleeds through */}
        <BlurView
          intensity={Platform.OS === 'ios' ? 82 : 95}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />

        {/* ② Ambient fill — very light on iOS (blur does the work), heavier on Android */}
        <View style={styles.ambientFill} />

        {/* ③ 1px top-edge highlight — Apple's glass light-catch signature */}
        <View style={styles.topEdge} />

        {/*
          ④ White-glass chip — brighter frosted oval, slides with active tab.
             This IS the active indicator. Not colored — just brighter glass.
             Renders before tab buttons so icons paint on top.
        */}
        <Animated.View style={[styles.chip, chipStyle]} />

        {/* ⑤ Tab buttons */}
        {visibleRoutes.map((route: any) => {
          const tabConfig   = VISIBLE_TABS.find(t => t.name === route.name);
          if (!tabConfig) return null;
          const globalIndex = state.routes.findIndex((r: any) => r.name === route.name);
          const isFocused   = state.index === globalIndex;
          const tabIndex    = VISIBLE_TABS.findIndex(t => t.name === route.name);

          return (
            <GlassTabButton
              key={route.key}
              config={tabConfig}
              isFocused={isFocused}
              tabIndex={tabIndex}
              activeIdx={activeIdx}
              hasBadge={tabConfig.name === 'workouts' && !!todayWorkout && isWorkoutCompletedToday === false && !isFocused}
              onPress={() => handlePress(route.name, route.key, tabIndex)}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Tab Button ───────────────────────────────────────────────────────────────
interface TabButtonProps {
  config: typeof VISIBLE_TABS[number];
  isFocused: boolean;
  tabIndex: number;
  activeIdx: SharedValue<number>;
  hasBadge?: boolean;
  onPress: () => void;
}

function GlassTabButton({ config, isFocused, tabIndex, activeIdx, hasBadge, onPress }: TabButtonProps) {
  // Icon: gentle scale up when active
  const iconAnim = useAnimatedStyle(() => {
    const dist  = Math.abs(activeIdx.value - tabIndex);
    const scale = interpolate(dist, [0, 1], [1.1, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: withSpring(scale, SPRING) }] };
  });

  // Everything fades to 35% when inactive — matches Klarna
  const fadeAnim = useAnimatedStyle(() => {
    const dist    = Math.abs(activeIdx.value - tabIndex);
    const opacity = interpolate(dist, [0, 0.8, 1], [1, 0.5, 0.35], Extrapolation.CLAMP);
    return { opacity: withSpring(opacity, SPRING) };
  });

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={`${config.label} tab`}
      accessibilityHint={config.hint}
    >
      <Animated.View style={[styles.tabInner, fadeAnim]}>
        {/* Icon + optional badge dot */}
        <Animated.View style={[iconAnim, { position: 'relative' }]}>
          <Ionicons
            name={isFocused ? config.iconFocused : config.icon}
            size={isFocused ? 27 : 24}
            color="#FFFFFF"
          />
          {hasBadge && (
            <View style={styles.badgeDot} />
          )}
        </Animated.View>

        {/* Label */}
        <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
          {config.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function ClientTabsLayout() {
  return (
    <>
      <OfflineBanner />
      <Tabs
        tabBar={(props) => <GlassTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="workouts" />
        <Tabs.Screen name="explore-classes" />
        <Tabs.Screen name="my-progress" />
        <Tabs.Screen name="my-messages" />

        {/* Hidden screens — deep-linked, not in tab bar */}
        <Tabs.Screen name="studio"            options={{ href: null }} />
        <Tabs.Screen name="my-diet"           options={{ href: null }} />
        <Tabs.Screen name="health-insights"   options={{ href: null }} />
        <Tabs.Screen name="my-pass"           options={{ href: null }} />
        <Tabs.Screen name="my-subscription"   options={{ href: null }} />
        <Tabs.Screen name="connected-tech"    options={{ href: null }} />
        <Tabs.Screen name="my-profile"        options={{ href: null }} />
        <Tabs.Screen name="class-detail"      options={{ href: null }} />
        <Tabs.Screen name="class-player"      options={{ href: null }} />
        <Tabs.Screen name="collections"       options={{ href: null }} />
        <Tabs.Screen name="collection-detail" options={{ href: null }} />
        <Tabs.Screen name="articles"          options={{ href: null }} />
        <Tabs.Screen name="article-detail"    options={{ href: null }} />
        <Tabs.Screen name="programs"          options={{ href: null }} />
        <Tabs.Screen name="program-detail"    options={{ href: null }} />
        <Tabs.Screen name="strength-session"  options={{ href: null }} />
        <Tabs.Screen name="my-sessions"       options={{ href: null }} />
      </Tabs>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  // Pill — overflow:hidden is required for BlurView clipping
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    width: BAR_WIDTH,
    height: BAR_H,
    borderRadius: BAR_H / 2,       // full pill (half the height)
    overflow: 'hidden',             // clips BlurView + chip to pill shape
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.55,
        shadowRadius: 28,
      },
      android: { elevation: 20 },
    }),
  },

  // Very light ambient fill — let the blur breathe
  ambientFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Platform.OS === 'ios'
      ? 'rgba(8,8,12,0.18)'    // iOS: barely-there — blur carries legibility
      : 'rgba(8,8,12,0.78)',   // Android: compensation for weaker blur
  },

  // 1px top-edge — Apple glass signature
  topEdge: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },

  // White-glass chip — brighter glass oval within the darker pill
  chip: {
    position: 'absolute',
    left: 0,
    top: (BAR_H - CHIP_H) / 2,
    width: CHIP_W,
    height: CHIP_H,
    borderRadius: CHIP_H / 2,         // oval (fully rounded ends)
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },

  tabButton: {
    width: TAB_WIDTH,
    height: BAR_H,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  tabLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  tabLabelActive: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 10.5,
  },

  // Red dot badge — appears on Train tab when todayWorkout is assigned
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.6)',
  },
});
