/**
 * /payouts — the coach's one Stripe payouts screen (design canvas "FitLink
 * Payouts"). Every entry point lands here: the home setup card, Profile >
 * Earnings & payouts, Settings, plan-detail's "collect payment" gate, and
 * the fitlink://stripe-return / stripe-refresh links when the router (not
 * the in-app auth session) receives them.
 *
 * Stripe opens inside the app; whatever the coach did there, this screen
 * asks the server what Stripe now says (on return, on focus, and when the
 * app comes back to the foreground) and shows the matching state.
 */
import { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { CoachColors as C, CoachFonts as F } from '../constants/coachDesign';
import { usePayouts } from '../hooks/usePayouts';
import { usePaymentSplit } from '../lib/platformFee';
import { PayoutsActions, PayoutsPanel } from '../components/payouts/PayoutsPanel';

export default function PayoutsScreen() {
  const router = useRouter();
  const payouts = usePayouts();
  const { split } = usePaymentSplit(payouts.trainerId);
  const wasConnected = useRef(payouts.state === 'connected');

  // Fresh from Stripe every time the screen is looked at.
  useFocusEffect(useCallback(() => { payouts.refresh(); }, [payouts.refresh]));

  // A coach who finished in external Safari (Android, or a link that escaped
  // the auth session) comes back to a foregrounded app, not a focus event.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') payouts.refresh(); });
    return () => sub.remove();
  }, [payouts.refresh]);

  // The moment it turns on: one success haptic, once.
  useEffect(() => {
    if (payouts.state === 'connected' && !wasConnected.current) {
      wasConnected.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [payouts.state]);

  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as any);
  }, [router]);

  const busy = payouts.busy !== 'none' && payouts.busy !== 'refreshing';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={leave} style={styles.backBtn} hitSlop={6} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.eyebrow} maxFontSizeMultiplier={1.2}>PAYOUTS</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <PayoutsPanel
          state={payouts.state}
          due={payouts.due}
          pendingVerification={payouts.pendingVerification}
          split={split}
          error={payouts.error}
        />
      </ScrollView>

      <View style={styles.footer}>
        <PayoutsActions
          state={payouts.state}
          busy={busy}
          onStart={payouts.start}
          onDone={leave}
          onSkip={leave}
          onDashboard={payouts.openDashboard}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, paddingHorizontal: 20, marginTop: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderMuted, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2, color: C.textFaint },
  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 },
});
