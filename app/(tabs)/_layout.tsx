import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { FontFamily } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Tab config — Research-backed order ──
// Order rationale:
//  1. Home     — command centre / business overview (always first)
//  2. Clients  — CRM, high daily frequency (who needs attention?)
//  3. Schedule — CENTRE = prime real estate, coaches live by their calendar
//  4. Studio   — flagship live/content feature
//  5. Messages — client comms (persistent, rightmost by convention)
// Removed: Library/programs — medium freq, accessed via Home quick actions
const VISIBLE_TABS = [
  { name: 'index',    label: 'Home',     icon: 'home-outline',        iconFocused: 'home'        },
  { name: 'clients',  label: 'Clients',  icon: 'people-outline',      iconFocused: 'people'      },
  { name: 'schedule', label: 'Schedule', icon: 'calendar-outline',    iconFocused: 'calendar'    },
  { name: 'studio',   label: 'Studio',   icon: 'radio-outline',       iconFocused: 'radio'       },
  { name: 'messages', label: 'Messages', icon: 'chatbubble-outline',  iconFocused: 'chatbubble'  },
] as const;

const TAB_COUNT    = VISIBLE_TABS.length;
const BAR_H        = 80;                               // Slightly taller to fit label
const BAR_MARGIN   = 20;
const BAR_WIDTH    = SCREEN_WIDTH - BAR_MARGIN * 2;
const TAB_WIDTH    = BAR_WIDTH / TAB_COUNT;

const ACTIVE_SIZE  = 58;
const ACTIVE_LIFT  = -16;                              // Float higher — more dramatic isolation
const WELL_SIZE    = 46;

// Spring config — water-like flow
const FLOW_SPRING = { damping: 24, stiffness: 130, mass: 0.8, overshootClamping: false };
const ICON_SPRING = { damping: 18, stiffness: 200 };

// ════════════════════════════════════
//  Custom Tab Bar
// ════════════════════════════════════
function AnimatedTabBar({ state, descriptors, navigation }: any) {
  const insets     = useSafeAreaInsets();
  const bottomPad  = Math.max(insets.bottom, 12);
  const activeIndex = useSharedValue(state.index);

  const circleStyle = useAnimatedStyle(() => {
    const targetX = activeIndex.value * TAB_WIDTH + (TAB_WIDTH - ACTIVE_SIZE) / 2;
    return {
      transform: [{ translateX: withSpring(targetX, FLOW_SPRING) }],
    };
  });

  const visibleRoutes = state.routes.filter((r: any) =>
    VISIBLE_TABS.some(t => t.name === r.name)
  );

  const handlePress = useCallback((routeName: string, routeKey: string, tabIndex: number) => {
    setTimeout(() => { activeIndex.value = tabIndex; }, 30);
    Haptics.selectionAsync();
    const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(routeName);
  }, [navigation, activeIndex]);

  return (
    <View style={[styles.outerContainer, { paddingBottom: bottomPad }]}>
      <View style={styles.bar}>
        {/* Floating active circle */}
        <Animated.View style={[styles.activeCircle, circleStyle]} />

        {visibleRoutes.map((route: any) => {
          const tabConfig   = VISIBLE_TABS.find(t => t.name === route.name);
          if (!tabConfig) return null;
          const globalIndex = state.routes.findIndex((r: any) => r.name === route.name);
          const isFocused   = state.index === globalIndex;
          const tabIndex    = VISIBLE_TABS.findIndex(t => t.name === route.name);

          return (
            <TabButton
              key={route.key}
              config={tabConfig}
              isFocused={isFocused}
              tabIndex={tabIndex}
              activeIndex={activeIndex}
              onPress={() => handlePress(route.name, route.key, tabIndex)}
            />
          );
        })}
      </View>
    </View>
  );
}

// ════════════════════════════════════
//  Tab Button
// ════════════════════════════════════
interface TabButtonProps {
  config: typeof VISIBLE_TABS[number];
  isFocused: boolean;
  tabIndex: number;
  activeIndex: Animated.SharedValue<number>;
  onPress: () => void;
}

function TabButton({ config, isFocused, tabIndex, activeIndex, onPress }: TabButtonProps) {

  const animatedContainer = useAnimatedStyle(() => {
    const distance   = Math.abs(activeIndex.value - tabIndex);
    const translateY = interpolate(distance, [0, 0.5, 1], [ACTIVE_LIFT, -4, 0], Extrapolation.CLAMP);
    const scale      = interpolate(distance, [0, 0.5, 1], [1.1, 1.05, 1],      Extrapolation.CLAMP);
    return {
      transform: [
        { translateY: withSpring(translateY, FLOW_SPRING) },
        { scale:      withSpring(scale,      ICON_SPRING) },
      ],
    };
  });

  const wellStyle = useAnimatedStyle(() => {
    const distance = Math.abs(activeIndex.value - tabIndex);
    const opacity  = interpolate(distance, [0, 0.8, 1], [0, 0.6, 1], Extrapolation.CLAMP);
    return { opacity: withSpring(opacity, ICON_SPRING) };
  });

  // Label fades out when active (replaced by lifted icon on circle)
  const labelStyle = useAnimatedStyle(() => {
    const distance = Math.abs(activeIndex.value - tabIndex);
    const opacity  = interpolate(distance, [0, 0.6, 1], [0, 0.5, 1], Extrapolation.CLAMP);
    return { opacity: withSpring(opacity, ICON_SPRING) };
  });

  return (
    <Pressable
      onPress={onPress}
      style={styles.tabButton}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={`${config.label} tab`}
    >
      <Animated.View style={[styles.iconOuter, animatedContainer]}>
        {/* Inactive well */}
        <Animated.View style={[styles.well, wellStyle]} />
        {/* Icon */}
        <Ionicons
          name={isFocused ? config.iconFocused : config.icon}
          size={24}
          color={isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.4)'}
        />
      </Animated.View>

      {/* Micro-label — fades out when active (icon lifts to show it is selected) */}
      <Animated.Text style={[styles.tabLabel, labelStyle]}>
        {config.label}
      </Animated.Text>
    </Pressable>
  );
}

// ════════════════════════════════════
//  Tab Layout
// ════════════════════════════════════
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />    {/* 1. Home */}
      <Tabs.Screen name="clients" />   {/* 2. Clients — CRM */}
      <Tabs.Screen name="schedule" />  {/* 3. Schedule — centre prime spot */}
      <Tabs.Screen name="studio" />    {/* 4. Studio — flagship */}
      <Tabs.Screen name="messages" />  {/* 5. Messages */}
      {/* Hidden from tab bar — accessible via navigation */}
      <Tabs.Screen name="programs" options={{ href: null }} />
      <Tabs.Screen name="diets"    options={{ href: null }} />
      <Tabs.Screen name="profile"  options={{ href: null }} />
    </Tabs>
  );
}

// ════════════════════════════════════
//  Styles
// ════════════════════════════════════
const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    width: BAR_WIDTH,
    height: BAR_H,
    backgroundColor: '#0C0C0E',
    borderRadius: BAR_H / 2,
    borderWidth: 1,
    borderColor: '#1C1C1E',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
      },
      android: { elevation: 16 },
    }),
  },

  // ── Floating active circle — glass chip (was neon green, too heavy) ──
  activeCircle: {
    position: 'absolute',
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,
    borderRadius: ACTIVE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    top: (BAR_H - ACTIVE_SIZE) / 2 + ACTIVE_LIFT,
    left: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },

  // ── Tab button ──
  tabButton: {
    width: TAB_WIDTH,
    height: BAR_H,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  // ── Icon outer ──
  iconOuter: {
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Inactive well ──
  well: {
    position: 'absolute',
    width: WELL_SIZE,
    height: WELL_SIZE,
    borderRadius: WELL_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  // ── Micro-label (accessibility + glanceability) ──
  tabLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: -4,
  },
});
