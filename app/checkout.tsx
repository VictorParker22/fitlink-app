import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import { isCohort, enrollmentState, formatDay, parseLocalDay } from '../lib/cohort';

// Use the subscription endpoint for recurring monthly billing
const EDGE_FUNCTION_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co/functions/v1/create-subscription';

export default function CheckoutScreen() {
  const { planId, clientId } = useLocalSearchParams<{ planId: string; clientId: string }>();
  const router = useRouter();
  const { plans, clients, trainer, refreshData } = useApp();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  const plan = plans.find((p) => p.id === planId);
  const client = clients.find((c) => c.id === clientId);

  const handlePayment = useCallback(async () => {
    if (!trainer?.stripe_onboarding_complete) {
      Alert.alert('Payment setup required', 'The coach needs to complete Stripe setup before accepting payments.');
      return;
    }

    if (!plan || !client || !trainer) {
      Alert.alert('Error', 'Missing plan, client, or trainer information.');
      return;
    }

    // Cohort gate — someone may have taken the last seat, or the deadline may
    // have passed, while this screen was open. Re-check against a fresh count
    // before the payment sheet opens. Evergreen passes skip this entirely.
    if (isCohort(plan as any)) {
      let enrolledCount = 0;
      const { count, error: countError } = await supabase
        .from('client_plan_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('plan_id', plan.id)
        .in('status', ['active', 'completed']);
      // If the count fails we can't verify seats, but the dates still hold.
      if (!countError && typeof count === 'number') enrolledCount = count;

      const state = enrollmentState(plan as any, enrolledCount);
      if (state === 'full') {
        Alert.alert(
          'This cohort just filled up',
          'The last seat went while you were looking. Message your coach about the next one.',
        );
        return;
      }
      if (state === 'closed-date') {
        const start = parseLocalDay((plan as any).starts_on);
        const startDay = formatDay(start);
        const started = !!start && start <= new Date();
        Alert.alert(
          'Enrollment closed',
          startDay
            ? `This cohort is no longer taking sign-ups. It ${started ? 'started' : 'starts'} on ${startDay}.`
            : 'This cohort is no longer taking sign-ups.',
        );
        return;
      }
    }

    setLoading(true);
    setPaymentStatus('processing');

    try {
      // Step 1: Get client secret from our Edge Function
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          planId: plan.id,
          clientId: client.id,
          trainerId: trainer.id,
        }),
      });

      const { clientSecret, customerId, subscriptionId, error: apiError } = await response.json();

      if (apiError || !clientSecret) {
        throw new Error(apiError || 'Failed to create payment intent');
      }

      // Step 2: Initialize the Payment Sheet
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: clientSecret,
        customerId: customerId,
        merchantDisplayName: 'FitLink',
        style: 'alwaysDark',
        returnURL: 'fitlink://checkout-return',
      });

      if (initError) {
        throw new Error(initError.message);
      }

      // Step 3: Present the Payment Sheet
      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === 'Canceled') {
          setPaymentStatus('idle');
          setLoading(false);
          return;
        }
        throw new Error(presentError.message);
      }

      // Payment succeeded!
      setPaymentStatus('success');

      // Fire autoflow (assign welcome workout + send welcome message + notify coach).
      // The Stripe webhook also triggers this, but we call it directly here so the
      // demo works instantly even if webhook delivery is delayed or not configured.
      // The autoflow function is idempotent — a double-fire is harmless.
      if (plan && client && trainer) {
        supabase.functions.invoke('client-autoflow', {
          body: { clientId: client.id, trainerId: trainer.id, planId: plan.id },
        }).then(({ error: afErr }) => {
          if (__DEV__ && afErr) console.warn('[Checkout] autoflow invoke error:', afErr);
        });
      }

      await refreshData();

      // Show success and navigate back after delay
      setTimeout(() => {
        router.back();
      }, 2000);

    } catch (err: any) {
      console.error('Payment error:', err);
      setPaymentStatus('error');
      Alert.alert('Payment failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [plan, client, trainer, initPaymentSheet, presentPaymentSheet]);

  if (!plan || !client) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={44} color={CoachColors.danger} />
          <Text style={styles.errorText}>Plan or client not found</Text>
          <TouchableOpacity
            style={styles.errorBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.errorBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={18} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {/* Plan summary card */}
        <View
          style={styles.summaryCard}
          accessible
          accessibilityLabel={`${plan.name}, $${Number(plan.price).toFixed(2)} per ${(plan as any).period || 'month'}. Coach receives $${(Number(plan.price) * 0.9).toFixed(2)} after the 10% platform fee. Billing ${client.name}.`}
        >
          <View style={styles.planBadge}>
            <Ionicons name="card-outline" size={20} color={CoachColors.accent} />
          </View>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planPrice}>
            ${Number(plan.price).toFixed(2)}
            <Text style={styles.planPeriod}> / {(plan as any).period || 'month'}</Text>
          </Text>
          <View style={styles.feeBreakdown}>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Platform fee (10%)</Text>
              <Text style={styles.feeValue}>${(Number(plan.price) * 0.10).toFixed(2)}</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Coach receives</Text>
              <Text style={styles.feeValueHighlight}>${(Number(plan.price) * 0.90).toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.clientRow}>
            <Ionicons name="person-outline" size={15} color={CoachColors.textFaint} />
            <Text style={styles.clientName}>Billing: {client.name}</Text>
          </View>
        </View>

        {/* Status messages */}
        {paymentStatus === 'success' && (
          <View style={styles.statusCard}>
            <View style={styles.statusIconSuccess}>
              <Ionicons name="checkmark" size={30} color={CoachColors.onAccent} />
            </View>
            <Text style={styles.statusTitle}>Payment successful</Text>
            <Text style={styles.statusDesc}>
              {client.name} is now subscribed to {plan.name}. You'll be billed monthly. Redirecting...
            </Text>
          </View>
        )}

        {paymentStatus === 'error' && (
          <View style={styles.statusCard}>
            <View style={styles.statusIconError}>
              <Ionicons name="close" size={30} color={CoachColors.danger} />
            </View>
            <Text style={styles.statusTitle}>Payment failed</Text>
            <Text style={styles.statusDesc}>
              Please check your payment details and try again.
            </Text>
          </View>
        )}

        {/* Security notice */}
        <View style={styles.securityRow}>
          <Ionicons name="lock-closed-outline" size={14} color={CoachColors.textFaint} />
          <Text style={styles.securityText}>
            Payments are securely processed by Stripe. FitLink never stores your card details.
          </Text>
        </View>

        {/* Pay button */}
        {paymentStatus !== 'success' && (
          <TouchableOpacity
            style={[styles.payBtn, loading && styles.payBtnDisabled]}
            onPress={handlePayment}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`Subscribe for $${Number(plan.price).toFixed(2)} per month`}
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator size="small" color={CoachColors.onAccent} />
            ) : (
              <>
                <Ionicons name="card-outline" size={18} color={CoachColors.onAccent} />
                <Text style={styles.payBtnText}>
                  Subscribe — ${Number(plan.price).toFixed(2)}/mo
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  headerTitle: { fontFamily: CoachFonts.headingBold, fontSize: 17, letterSpacing: -0.3, color: CoachColors.textPrimary },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },

  summaryCard: {
    alignItems: 'center', paddingVertical: 28, paddingHorizontal: 18, borderRadius: 16,
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  planBadge: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: CoachColors.accentSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  planName: { fontFamily: CoachFonts.headingBold, fontSize: 20, letterSpacing: -0.4, color: CoachColors.textPrimary, textAlign: 'center' },
  planPrice: { fontFamily: CoachFonts.headingBold, fontSize: 36, letterSpacing: -1, color: CoachColors.accent, marginTop: 4 },
  planPeriod: { fontFamily: CoachFonts.body, fontSize: 16, letterSpacing: 0, color: CoachColors.textMuted },
  feeBreakdown: {
    width: '100%', marginTop: 14, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: CoachColors.borderMuted, gap: 6,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 },
  feeLabel: { fontFamily: CoachFonts.body, fontSize: 13, color: CoachColors.textSecondary },
  feeValue: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.textPrimary },
  feeValueHighlight: { fontFamily: CoachFonts.bodySemiBold, fontSize: 13, color: CoachColors.accent },
  divider: { height: 1, backgroundColor: CoachColors.borderMuted, width: '100%', marginVertical: 16 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  clientName: { fontFamily: CoachFonts.body, fontSize: 13.5, color: CoachColors.textSecondary },

  statusCard: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  statusIconSuccess: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.accent,
  },
  statusIconError: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.dangerSoft,
  },
  statusTitle: { fontFamily: CoachFonts.headingBold, fontSize: 18, letterSpacing: -0.3, color: CoachColors.textPrimary },
  statusDesc: { fontFamily: CoachFonts.body, fontSize: 13.5, lineHeight: 19, color: CoachColors.textSecondary, textAlign: 'center', paddingHorizontal: 12 },

  securityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginVertical: 24, paddingHorizontal: 6,
  },
  securityText: { fontFamily: CoachFonts.body, fontSize: 12, lineHeight: 16, color: CoachColors.textFaint, flex: 1 },

  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 54, borderRadius: 27, backgroundColor: CoachColors.accent, paddingHorizontal: 20,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { fontFamily: CoachFonts.bodyBold, fontSize: 15.5, color: CoachColors.onAccent },

  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
  errorText: { fontFamily: CoachFonts.headingBold, fontSize: 17, color: CoachColors.textPrimary, textAlign: 'center' },
  errorBtn: {
    minHeight: 44, borderRadius: 22, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CoachColors.surface, borderWidth: 1, borderColor: CoachColors.borderMuted,
  },
  errorBtnText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 14, color: CoachColors.textPrimary },
});
