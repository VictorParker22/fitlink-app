import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { FontFamily } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Unread Messages Hook ──
function useUnreadMessageCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('conversations')
        .select('unread_count')
        .eq('trainer_id', user.id)
        .gt('unread_count', 0);
      setCount(data ? data.reduce((s, c) => s + (c.unread_count || 0), 0) : 0);
    };
    load();
    // Realtime subscription for conversation updates
    const channel = supabase
      .channel('tab-unread-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  return count;
}

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
const WELL_SIZE    = 46;

// The Studio tab triggers a "compact mode" — bar shrinks to give the GO LIVE CTA full attention.
// When the user taps any other tab, the bar springs back to normal.
const STUDIO_TAB_NAME   = 'studio';
const BAR_COMPACT_SCALE = 0.42;  // ~147px wide — visible but clearly receded
const BAR_COMPACT_SLIDE = 8;     // drift slightly downward
const BAR_COMPACT_ALPHA = 0.48;  // semi-transparent

// Spring config — water-like flow
const FLOW_SPRING    = { damping: 24, stiffness: 130, mass: 0.8, overshootClamping: false };
const ICON_SPRING    = { damping: 18, stiffness: 200 };
const COMPACT_SPRING = { damping: 18, stiffness: 110, mass: 0.85, overshootClamping: false };

// ════════════════════════════════════
//  Custom Tab Bar
// ════════════════════════════════════
function AnimatedTabBar({ state, descriptors, navigation }: any) {
  const insets         = useSafeAreaInsets();
  const bottomPad      = Math.max(insets.bottom, 12);
  const activeIndex    = useSharedValue(state.index);
  const unreadMessages = useUnreadMessageCount();

  // ── Studio compact mode ──────────────────────────────────────────────────────
  // When on Studio tab: bar shrinks to give the GO LIVE CTA full visual priority.
  // On any other tab: bar springs back to full size.
  const barScale   = useSharedValue(1);
  const barOpacity = useSharedValue(1);
  const barSlideY  = useSharedValue(0);

  useEffect(() => {
    const isStudio = state.routes[state.index]?.name === STUDIO_TAB_NAME;
    barScale.value   = withSpring(isStudio ? BAR_COMPACT_SCALE : 1, COMPACT_SPRING);
    barOpacity.value = withTiming(isStudio ? BAR_COMPACT_ALPHA : 1, { duration: 280 });
    barSlideY.value  = withSpring(isStudio ? BAR_COMPACT_SLIDE : 0, COMPACT_SPRING);
  }, [state.index]);

  const barAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale:      barScale.value  },
      { translateY: barSlideY.value },
    ],
    opacity: barOpacity.value,
  }));
  // ────────────────────────────────────────────────────────────────────────────

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
      <Animated.View style={[styles.bar, barAnimStyle]}>
        {/* Floating active circle */}
        <Animated.View style={[styles.activeCircle, circleStyle]} />

        {visibleRoutes.map((route: any) => {
          const tabConfig   = VISIBLE_TABS.find(t => t.name === route.name);
          if (!tabConfig) return null;
          const globalIndex = state.routes.findIndex((r: any) => r.name === route.name);
          const isFocused   = state.index === globalIndex;
          const tabIndex    = VISIBLE_TABS.findIndex(t => t.name === route.name);
          const badge = tabConfig.name === 'messages' && unreadMessages > 0 ? unreadMessages : 0;

          return (
            <TabButton
              key={route.key}
              config={tabConfig}
              isFocused={isFocused}
              tabIndex={tabIndex}
              activeIndex={activeIndex}
              badge={badge}
              onPress={() => handlePress(route.name, route.key, tabIndex)}
            />
          );
        })}
      </Animated.View>
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
  activeIndex: SharedValue<number>;
  badge?: number;
  onPress: () => void;
}

function TabButton({ config, isFocused, tabIndex, activeIndex, badge = 0, onPress }: TabButtonProps) {

  const animatedContainer = useAnimatedStyle(() => {
    // No vertical lift — flat design.
    // Active state is communicated via the circle background + white icon.
    // Subtle scale-up on active gives just enough "alive" feeling without the pop.
    const distance = Math.abs(activeIndex.value - tabIndex);
    const scale    = interpolate(distance, [0, 1], [1.07, 1], Extrapolation.CLAMP);
    return {
      transform: [{ scale: withSpring(scale, ICON_SPRING) }],
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
        {/* Unread badge */}
        {badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
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

  // ── Floating active circle — glass chip ──
  // top is centred inside the bar; no ACTIVE_LIFT offset since we removed the icon float.
  activeCircle: {
    position: 'absolute',
    width: ACTIVE_SIZE,
    height: ACTIVE_SIZE,
    borderRadius: ACTIVE_SIZE / 2,
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    top: (BAR_H - ACTIVE_SIZE) / 2,  // centred — no float offset
    left: 0,
    ...Platform.select({
      ios: {
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
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

  // ── Unread badge ──
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#0C0C0E',
  },
  badgeText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9,
    color: '#FFFFFF',
    lineHeight: 14,
  },
});
