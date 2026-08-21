/**
 * athlete-permissions.tsx — the athlete's one priming screen.
 *
 * Shown once, right after intake finishes (client-onboarding routes here
 * with ?next=<destination>), so every OS ask happens in one explained
 * moment instead of ambushing the athlete mid-session later. Continue
 * always works — granting nothing is a fine way through.
 *
 * Items: notifications (coach replies, session reminders) and health
 * (Apple Health / Health Connect — native only, hidden on web).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
import PermissionCards, { type PermissionItem } from '../../components/onboarding/PermissionCards';
import { getNotificationState, requestNotifications, type PermState } from '../../lib/permissions';
import { useHealth } from '../../context/HealthContext';

export default function AthletePermissionsScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { isConnected, connectHealth } = useHealth();

  const items: PermissionItem[] = [
    {
      key: 'notifications',
      icon: 'notifications-outline',
      title: 'Notifications',
      why: 'Your coach replies, a session is coming up, it’s check-in day. The nudges you’d actually want — nothing else.',
      getState: getNotificationState,
      request: requestNotifications,
    },
  ];

  if (Platform.OS !== 'web') {
    items.push({
      key: 'health',
      icon: 'heart-outline',
      title: Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect',
      why: 'Steps, sleep and heart rate give your coach the full picture between sessions. Read-only, and only your coach sees it.',
      getState: async (): Promise<PermState> => (isConnected ? 'granted' : 'ask'),
      request: async (): Promise<PermState> => {
        try {
          await connectHealth();
          return 'granted';
        } catch {
          return 'ask';
        }
      },
    });
  }

  const finish = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace((typeof next === 'string' && next ? next : '/(client-tabs)') as any);
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.kicker} maxFontSizeMultiplier={1.4}>One last thing</Text>
        <Text style={s.title} maxFontSizeMultiplier={1.4}>Set up before{'\n'}your first session</Text>
        <Text style={s.sub} maxFontSizeMultiplier={1.4}>
          Two switches, each with one job. Say yes here and the app never has
          to interrupt a workout to ask.
        </Text>
        <PermissionCards items={items} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={s.continueBtn}
          onPress={finish}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Continue to the app"
        >
          <Text style={s.continueText} maxFontSizeMultiplier={1.2}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  body: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, gap: 0 },
  kicker: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: CoachColors.accent,
    marginBottom: 12,
  },
  title: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 28,
    lineHeight: 34,
    color: CoachColors.textPrimary,
    marginBottom: 12,
  },
  sub: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: CoachColors.textMuted,
    marginBottom: 24,
  },
  footer: { paddingHorizontal: 24, paddingBottom: 12, paddingTop: 8 },
  continueBtn: {
    height: 54,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: CoachColors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 16,
    color: CoachColors.onAccent,
  },
});
