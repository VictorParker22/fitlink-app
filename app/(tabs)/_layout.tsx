/**
 * (tabs)/_layout.tsx — Coach tab bar.
 *
 * Same flat pattern as the athlete bar (design turn 22 / mockup 22a):
 * a bar on the app background with a hairline top border — no glass, no
 * floating pill. One lime accent for the active tab; a numeric badge on
 * Messages for unread client threads.
 *
 * The old floating-pill bar died of geometry: five labelled tabs inside a
 * fixed-height pill whose fully-rounded ends curved into the outer labels
 * ("Messages" poked past the corner at any text size). The flat bar has
 * no fixed height and no rounded ends, so Dynamic Type just grows it.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';

// ─── Unread Messages Hook ─────────────────────────────────────────────────────
function useUnreadMessageCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;

    const load = async () => {
      if (!alive) return;
      const { data } = await supabase
        .from('conversations')
        .select('unread_count')
        .eq('trainer_id', user.id)
        .gt('unread_count', 0);
      if (alive) setCount(data ? data.reduce((s, c) => s + (c.unread_count || 0), 0) : 0);
    };

    load();

    // Use a unique channel name per mount so we never try to attach
    // postgres_changes listeners to an already-subscribed channel
    // (removeChannel is async, so a hardcoded name races on remount).
    const channelName = `tab-unread-badge-${user.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, load)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return count;
}

// ─── Tab config — Research-backed order ───────────────────────────────────────
// Order rationale:
//  1. Home     — command centre / business overview (always first)
//  2. Clients  — CRM, high daily frequency (who needs attention?)
//  3. Library  — CENTRE = prime real estate: everything the coach sells and
//     builds. It held no tab until 2026-08-23 and was reached only through
//     Home or a pill borrowed from the Clients header — a daily building
//     surface behind someone else's door.
//  4. Schedule — the calendar
//  5. Messages — client comms (persistent, rightmost by convention)
// Studio left the bar for Library: it is Elite-gated AND live broadcasting is
// iOS-only (lib/liveBroadcast.ts), so it was a dead tab for most Android
// coaches. It lives on as the Classes shelf inside Library plus the Home
// go-live quick action — an occasional feature shouldn't outrank a daily one.
const VISIBLE_TABS = [
  { name: 'index',    label: 'Home',     icon: 'home-outline',       iconFocused: 'home',       hint: 'Business overview' },
  { name: 'clients',  label: 'Clients',  icon: 'people-outline',     iconFocused: 'people',     hint: 'Your athletes' },
  { name: 'programs', label: 'Library',  icon: 'albums-outline',     iconFocused: 'albums',     hint: 'Passes, workouts, meal plans and classes' },
  { name: 'schedule', label: 'Schedule', icon: 'calendar-outline',   iconFocused: 'calendar',   hint: 'Your calendar' },
  { name: 'messages', label: 'Messages', icon: 'chatbubble-outline', iconFocused: 'chatbubble', hint: 'Client messages' },
] as const;

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function CoachTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 14);
  const unreadMessages = useUnreadMessageCount();

  const handlePress = useCallback(
    (routeName: string, routeKey: string) => {
      const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
      if (!event.defaultPrevented) navigation.navigate(routeName);
    },
    [navigation]
  );

  return (
    <View style={[styles.barWrap, { paddingBottom: bottomPad }]}>
      <View style={styles.bar}>
        {VISIBLE_TABS.map((tab) => {
          const route = state.routes.find((r: any) => r.name === tab.name);
          if (!route) return null;
          const globalIndex = state.routes.findIndex((r: any) => r.name === tab.name);
          const isFocused = state.index === globalIndex;
          const badge = tab.name === 'messages' && unreadMessages > 0 ? unreadMessages : 0;

          return (
            <Pressable hitSlop={{ top: 9, bottom: 9 }}
              key={route.key}
              onPress={() => handlePress(route.name, route.key)}
              style={styles.tabButton}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={
                badge > 0
                  ? `${tab.label} tab, ${badge > 99 ? 'more than 99' : badge} unread`
                  : `${tab.label} tab`
              }
              accessibilityHint={tab.hint}
            >
              <View>
                <Ionicons
                  name={isFocused ? (tab.iconFocused as any) : (tab.icon as any)}
                  size={21}
                  color={isFocused ? CoachColors.accent : CoachColors.textFaint}
                />
                {badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                      {badge > 99 ? '99+' : badge}
                    </Text>
                  </View>
                )}
              </View>
              {/* Dynamic Type: tab labels share a fixed-width fifth of the bar,
                  so they shrink to fit rather than wrap the whole bar taller.
                  Cap the multiplier too — otherwise each label shrinks by a
                  different amount (long words hit the width limit, short ones
                  don't) and the bar reads as five different font sizes. */}
              <Text
                style={[styles.tabLabel, isFocused && styles.tabLabelActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                maxFontSizeMultiplier={1.2}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CoachTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />     {/* 1. Home */}
      <Tabs.Screen name="clients" />   {/* 2. Clients — CRM */}
      <Tabs.Screen name="programs" />  {/* 3. Library — centre prime spot */}
      <Tabs.Screen name="schedule" />  {/* 4. Schedule */}
      <Tabs.Screen name="messages" />  {/* 5. Messages */}
      {/* Hidden from tab bar — accessible via navigation */}
      <Tabs.Screen name="studio"   options={{ href: null }} />
      <Tabs.Screen name="profile"  options={{ href: null }} />
    </Tabs>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  barWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: CoachColors.bg,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  bar: {
    flexDirection: 'row',
    paddingTop: 11,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  tabLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11,
    color: CoachColors.textFaint,
  },
  tabLabelActive: {
    fontFamily: CoachFonts.bodyBold,
    color: CoachColors.accent,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    // minHeight so the unread count is not clipped at large Dynamic Type sizes.
    minHeight: 16,
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: CoachColors.bg,
  },
  badgeText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10,
    color: CoachColors.onAccent,
    lineHeight: 15.5,
  },
});
