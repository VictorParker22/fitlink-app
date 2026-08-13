/**
 * (client-tabs)/_layout.tsx — Athlete tab bar (design turn 22).
 *
 * IA from mockup 22a: Today / Train / Food / Progress / Coach.
 * Flat bar on the app background with a hairline top border — no glass,
 * no floating pill. One lime accent for the active tab; a lime dot on
 * Coach when there are unread trainer messages.
 *
 * All previously registered routes stay registered (href: null) so
 * nothing deep-linked 404s.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import WorkoutMiniPlayer from '../../components/WorkoutMiniPlayer';
import { useClient } from '../../context/ClientContext';

// ─── Tab config — mockup 22a bottom bar ──────────────────────────────────────
const VISIBLE_TABS = [
  { name: 'index',       label: 'Today',    icon: 'home-outline',        iconFocused: 'home',        hint: "Today's session and your coach" },
  { name: 'workouts',    label: 'Train',    icon: 'barbell-outline',     iconFocused: 'barbell',     hint: 'Your workouts' },
  { name: 'my-diet',     label: 'Food',     icon: 'restaurant-outline',  iconFocused: 'restaurant',  hint: 'Your meal plan' },
  { name: 'my-progress', label: 'Progress', icon: 'trending-up-outline', iconFocused: 'trending-up', hint: 'Your progress' },
  { name: 'my-messages', label: 'Coach',    icon: 'chatbubble-outline',  iconFocused: 'chatbubble',  hint: 'Message your coach' },
] as const;

// ─── Unread trainer messages → lime dot on Coach tab ─────────────────────────
function useUnreadFromCoach() {
  const { conversation } = useClient();
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!conversation?.id) { setHasUnread(false); return; }
    let alive = true;

    const load = async () => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversation.id)
        .eq('sender_type', 'trainer')
        .eq('read', false);
      if (alive) setHasUnread((count ?? 0) > 0);
    };
    load();

    const channelName = `client-tab-unread-${conversation.id}-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` }, load)
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  return hasUnread;
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────
function AthleteTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 14);
  const unreadFromCoach = useUnreadFromCoach();

  const handlePress = useCallback(
    (routeName: string, routeKey: string) => {
      Haptics.selectionAsync();
      const event = navigation.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true });
      if (!event.defaultPrevented) navigation.navigate(routeName);
    },
    [navigation]
  );

  return (
    <View style={[styles.barWrap, { paddingBottom: bottomPad }]}>
      <WorkoutMiniPlayer />
      <View style={styles.bar}>
        {VISIBLE_TABS.map((tab) => {
          const route = state.routes.find((r: any) => r.name === tab.name);
          if (!route) return null;
          const globalIndex = state.routes.findIndex((r: any) => r.name === tab.name);
          const isFocused = state.index === globalIndex;
          const showDot = tab.name === 'my-messages' && unreadFromCoach && !isFocused;

          return (
            <Pressable
              key={route.key}
              onPress={() => handlePress(route.name, route.key)}
              style={styles.tabButton}
              accessibilityRole="tab"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={`${tab.label} tab`}
              accessibilityHint={tab.hint}
            >
              <View>
                <Ionicons
                  name={isFocused ? (tab.iconFocused as any) : (tab.icon as any)}
                  size={21}
                  color={isFocused ? CoachColors.accent : CoachColors.textFaint}
                />
                {showDot && <View style={styles.dot} />}
              </View>
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
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
export default function ClientTabsLayout() {
  return (
    <>
      {/* OfflineBanner is mounted once at the root (app/_layout.tsx) */}
      <Tabs
        tabBar={(props) => <AthleteTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        {/* Bar tabs — mockup 22a order */}
        <Tabs.Screen name="index" />
        <Tabs.Screen name="workouts" />
        <Tabs.Screen name="my-diet" />
        <Tabs.Screen name="my-progress" />
        <Tabs.Screen name="my-messages" />

        {/* Hidden screens — deep-linked, not in the bar. Nothing may 404. */}
        <Tabs.Screen name="explore-classes"   options={{ href: null }} />
        <Tabs.Screen name="studio"            options={{ href: null }} />
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
        <Tabs.Screen name="find-coach"        options={{ href: null }} />
      </Tabs>
    </>
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
    borderTopColor: '#1E211D',
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
    fontSize: 10,
    color: CoachColors.textFaint,
  },
  tabLabelActive: {
    fontFamily: CoachFonts.bodyBold,
    color: CoachColors.accent,
  },
  dot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CoachColors.accent,
    borderWidth: 1.5,
    borderColor: CoachColors.bg,
  },
});
