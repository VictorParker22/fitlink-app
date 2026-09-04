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
 *
 * On the Editorial system (components/onboarding/Editorial.tsx) so the
 * athlete stays in one typographic voice — Instrument Serif headline,
 * Manrope everything else — from welcome through this, the last onboarding
 * screen before Home switches to the app's own Space Grotesk/Epilogue.
 */

import React from 'react';
import { View, Platform, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen, Wordmark, Headline, Sub, PrimaryButton } from '../../components/onboarding/Editorial';
import { OBSpace } from '../../constants/onboardingDesign';
import PermissionCards, { type PermissionItem } from '../../components/onboarding/PermissionCards';
import { getNotificationState, requestNotifications, type PermState } from '../../lib/permissions';
import { useHealth } from '../../context/HealthContext';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export default function AthletePermissionsScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const { user } = useAuth();
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

  const finish = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Remember that the asks were explained, so the AuthGuard never routes
    // this athlete back here. Best effort: routing does not wait on it.
    supabase.auth.updateUser({ data: { permissions_primed: true } }).catch(() => {});
    // The context user's metadata can be stale right here — this screen is
    // reached moments after signUp, and applyOnboardingDraft's onboarding_path
    // write may not have propagated to the cached AuthContext user yet. Read
    // the freshest metadata directly, falling back to the context user only
    // if that read fails.
    let chosePath = user?.user_metadata?.onboarding_path;
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) chosePath = data.user.user_metadata?.onboarding_path ?? chosePath;
    } catch {}
    // An athlete who chose Solo in onboarding goes straight to choosing a
    // voice; the coach path lands on Home, where Find a coach leads.
    const dest = typeof next === 'string' && next
      ? next
      : chosePath === 'solo' ? '/(client-tabs)/solo-setup' : '/(client-tabs)';
    router.replace(dest as any);
  };

  return (
    <Screen footer={<PrimaryButton label="Continue" onPress={finish} />}>
      <View style={{ height: 58, paddingHorizontal: OBSpace.screen - 12, justifyContent: 'center' }}>
        <Wordmark />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: OBSpace.screen, paddingTop: 12, paddingBottom: 24, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <Headline size={34} lineHeight={38}>Set up before{'\n'}your first session</Headline>
        <Sub>
          Two switches, each with one job. Say yes here and the app never has
          to interrupt a workout to ask.
        </Sub>
        <View style={{ marginTop: 8 }}>
          <PermissionCards items={items} variant="editorial" />
        </View>
      </ScrollView>
    </Screen>
  );
}
