import { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useStripe } from '@stripe/stripe-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../constants/theme';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import Button from '../components/Button';
import Card from '../components/Card';

// Use the subscription endpoint for recurring monthly billing
const EDGE_FUNCTION_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co/functions/v1/create-subscription';

export default function CheckoutScreen() {
  const { planId, clientId } = useLocalSearchParams<{ planId: string; clientId: string }>();
  const router = useRouter();
  const { plans, clients, trainer, refreshData } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  const plan = plans.find((p) => p.id === planId);
  const client = clients.find((c) => c.id === clientId);

  const handlePayment = useCallback(async () => {
    if (!plan || !client || !trainer) {
      Alert.alert('Error', 'Missing plan, client, or trainer information.');
      return;
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
      await refreshData();

      // Show success and navigate back after delay
      setTimeout(() => {
        router.back();
      }, 2000);

    } catch (err: any) {
      console.error('Payment error:', err);
      setPaymentStatus('error');
      Alert.alert('Payment Failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [plan, client, trainer, initPaymentSheet, presentPaymentSheet]);

  if (!plan || !client) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorState}>
          <Ionicons name="alert-circle" size={48} color={colors.red} />
          <Text style={styles.errorText}>Plan or client not found.</Text>
          <Button title="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Button
          title=""
          onPress={() => router.back()}
          variant="secondary"
          size="sm"
          icon={<Ionicons name="arrow-back" size={20} color={colors.textPrimary} />}
        />
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {/* Plan Summary Card */}
        <Card style={styles.summaryCard}>
          <View style={styles.planBadge}>
            <Ionicons name="card" size={20} color={colors.accent} />
          </View>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planPrice}>
            ${Number(plan.price).toFixed(2)}
            <Text style={styles.planPeriod}> / {(plan as any).period || 'month'}</Text>
          </Text>
          <View style={styles.divider} />
          <View style={styles.clientRow}>
            <Ionicons name="person" size={16} color={colors.textTertiary} />
            <Text style={styles.clientName}>Billing: {client.name}</Text>
          </View>
        </Card>

        {/* Status Messages */}
        {paymentStatus === 'success' && (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: `${colors.green}20` }]}>
              <Ionicons name="checkmark-circle" size={32} color={colors.green} />
            </View>
            <Text style={styles.statusTitle}>Payment Successful!</Text>
            <Text style={styles.statusDesc}>
              {client.name} is now subscribed to {plan.name}. You'll be billed monthly. Redirecting...
            </Text>
          </View>
        )}

        {paymentStatus === 'error' && (
          <View style={styles.statusCard}>
            <View style={[styles.statusIcon, { backgroundColor: `${colors.red}20` }]}>
              <Ionicons name="close-circle" size={32} color={colors.red} />
            </View>
            <Text style={styles.statusTitle}>Payment Failed</Text>
            <Text style={styles.statusDesc}>
              Please check your payment details and try again.
            </Text>
          </View>
        )}

        {/* Security Notice */}
        <View style={styles.securityRow}>
          <Ionicons name="lock-closed" size={14} color={colors.textTertiary} />
          <Text style={styles.securityText}>
            Payments are securely processed by Stripe. FitLink never stores your card details.
          </Text>
        </View>

        {/* Pay Button */}
        {paymentStatus !== 'success' && (
          <Button
            title={loading ? 'Processing...' : `Subscribe — $${Number(plan.price).toFixed(2)}/mo`}
            onPress={handlePayment}
            loading={loading}
            full
            size="lg"
            icon={!loading ? <Ionicons name="card" size={18} color="white" /> : undefined}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },

  summaryCard: { alignItems: 'center', paddingVertical: Spacing['2xl'] },
  planBadge: {
    width: 48, height: 48, borderRadius: Radius.lg,
    backgroundColor: `${colors.accent}18`,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg,
  },
  planName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.xl, color: colors.textPrimary },
  planPrice: { fontFamily: FontFamily.headingExtraBold, fontSize: 36, color: colors.accent, marginTop: Spacing.xs },
  planPeriod: { fontFamily: FontFamily.body, fontSize: FontSize.lg, color: colors.textTertiary },
  divider: { height: 1, backgroundColor: colors.border, width: '100%', marginVertical: Spacing.lg },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  clientName: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.base, color: colors.textSecondary },

  statusCard: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.md },
  statusIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  statusDesc: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textSecondary, textAlign: 'center' },

  securityRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginVertical: Spacing.xl, paddingHorizontal: Spacing.sm,
  },
  securityText: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, flex: 1 },

  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.lg },
  errorText: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
});
