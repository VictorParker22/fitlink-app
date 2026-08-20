import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useClient } from '../../context/ClientContext';
import { useAlert } from '../../context/AlertContext';
import { Radius } from '../../constants/theme';
import { CoachColors, CoachFonts } from '../../constants/coachDesign';
// Platform-split — @stripe/stripe-react-native cannot be imported on web.
// See lib/stripe-checkout.ts (base is the web-safe one, .native carries the
// real hook, so a resolution miss degrades instead of breaking the build).
import { useStripe } from '../../lib/stripe-checkout';
import { ClientRoute, SharedRoute } from '../../types/routes';
import * as Haptics from 'expo-haptics';

export default function MySubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clientData, subscription, paymentHistory, plans, cancelSubscription, setupPaymentMethod, refreshData } = useClient();
  const { showAlert } = useAlert();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [refreshing, setRefreshing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [managingCard, setManagingCard] = useState(false);

  const memberYear = clientData?.created_at ? new Date(clientData.created_at).getFullYear() : new Date().getFullYear();

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleCancel = () => {
    if (!subscription) return;

    Alert.alert(
      'Cancel Subscription?',
      `Are you sure you want to cancel? You will retain access until the end of your current billing period (${new Date(subscription.current_period_end).toLocaleDateString()}).`,
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            setCanceling(true);
            try {
              await cancelSubscription(subscription.id);
              showAlert({ type: 'success', title: 'Canceled', message: 'Your subscription has been canceled.' });
            } catch (err: any) {
              showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to cancel subscription.' });
            } finally {
              setCanceling(false);
            }
          }
        }
      ]
    );
  };

  const handleManageCard = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setManagingCard(true);
    try {
      // Create SetupIntent (with timeout so the button doesn't spin forever)
      const timeoutMs = 15_000;
      const setupPromise = setupPaymentMethod();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out. Please check your connection and try again.')), timeoutMs)
      );
      const { clientSecret } = await Promise.race([setupPromise, timeoutPromise]);

      if (!clientSecret) {
        throw new Error('Unable to set up payment. The server returned an invalid response.');
      }

      // Initialize Stripe UI
      const initRes = await initPaymentSheet({
        setupIntentClientSecret: clientSecret,
        merchantDisplayName: 'FitLink Coaching',
        returnURL: 'fitlink://stripe-redirect',
        allowsDelayedPaymentMethods: true,
      });

      if (initRes.error) throw new Error(initRes.error.message);

      // Present Stripe UI
      const presentRes = await presentPaymentSheet();

      if (presentRes.error) {
        if (presentRes.error.code !== 'Canceled') {
          throw new Error(presentRes.error.message);
        }
      } else {
        showAlert({ type: 'success', title: 'Card Updated', message: 'Your payment method has been updated successfully.' });
      }

    } catch (err: any) {
      console.error('[MySubscription] handleManageCard error:', err);
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to manage card.' });
    } finally {
      setManagingCard(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ── HEADER ── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(ClientRoute.myProfile); }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-back" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Membership</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 130 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.accent} colors={[CoachColors.accent]} />}
      >
        {/* ── HERO: ACTIVE PLAN ── */}
        {subscription && subscription.plans ? (
          <View style={styles.heroCard}>
            {/* Accent top line */}
            <View style={[styles.heroAccentLine, subscription.status === 'canceled' && { backgroundColor: CoachColors.danger }]} />

            <View style={styles.heroContent}>
              <View style={styles.heroTop}>
                <View style={styles.heroIconBadge}>
                  <Ionicons name="star" size={20} color={CoachColors.accent} />
                </View>
                <View style={[styles.statusBadge, subscription.status === 'canceled' && styles.statusBadgeCanceled]}>
                  <Text style={[styles.statusText, subscription.status === 'canceled' && styles.statusTextCanceled]}>
                    {subscription.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              <Text style={styles.planName}>{subscription.plans.name}</Text>
              <Text style={styles.planPrice}>
                <Text style={styles.planPriceAccent}>${subscription.plans.price}</Text>
                <Text style={styles.planInterval}> / month</Text>
              </Text>

              <View style={styles.heroDivider} />

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>NEXT BILLING</Text>
                <Text style={styles.detailValue}>
                  {subscription.status === 'canceled' ? 'Cancels ' : 'Renews '}
                  {new Date(subscription.current_period_end).toLocaleDateString()}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>MEMBER SINCE</Text>
                <Text style={styles.detailValue}>{memberYear}</Text>
              </View>
            </View>
          </View>
        ) : (
          /* ── EMPTY STATE ── */
          <View style={styles.emptySection}>
            <Text style={styles.sectionLabel}>{'NO ACTIVE MEMBERSHIP'}</Text>
            <View style={styles.sectionDivider} />
            <Text style={styles.emptyText}>You don't have an active coaching plan.</Text>
            <Text style={styles.emptySubtext}>Browse available plans below to get started.</Text>
          </View>
        )}

        {/* ── PAYMENT METHOD ── */}
        {subscription && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
            <View style={styles.sectionDivider} />
            <View style={styles.paymentCard}>
              <View style={styles.paymentLeft}>
                <View style={styles.paymentIconBox}>
                  <Ionicons name="card" size={20} color={CoachColors.textSecondary} />
                </View>
                <View>
                  <Text style={styles.paymentCardTitle}>Card on file</Text>
                  <Text style={styles.paymentCardSub}>Managed by Stripe</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={handleManageCard}
                disabled={managingCard}
                accessibilityRole="button"
                accessibilityLabel={managingCard ? 'Updating payment method' : 'Update payment method'}
                activeOpacity={0.6}
              >
                <Text style={styles.updateCardText}>{managingCard ? 'Updating…' : 'Update'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PAYMENT HISTORY ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PAYMENT HISTORY</Text>
          <View style={styles.sectionDivider} />
          {paymentHistory.length === 0 ? (
            <Text style={styles.emptyText}>No payment history yet.</Text>
          ) : (
            <View style={styles.historyContainer}>
              {paymentHistory.map((payment, index) => (
                <View
                  key={payment.id}
                  style={[styles.historyRow, index < paymentHistory.length - 1 && styles.historyRowBorder]}
                  accessibilityLabel={`Payment on ${new Date(payment.created_at).toLocaleDateString()}, $${(payment.amount / 100).toFixed(2)}, ${payment.status}`}
                >
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyDate}>{new Date(payment.created_at).toLocaleDateString()}</Text>
                    <Text style={styles.historyPlan}>{payment.plans?.name || 'Coaching Plan'}</Text>
                  </View>
                  <View style={styles.historyRight}>
                    <Text style={styles.historyAmount}>${(payment.amount / 100).toFixed(2)}</Text>
                    <View style={[
                      styles.historyStatusBadge,
                      payment.status === 'succeeded' && { backgroundColor: CoachColors.accentSoft },
                      payment.status === 'failed' && { backgroundColor: CoachColors.dangerSoft }
                    ]}>
                      <Text style={[
                        styles.historyStatusText,
                        payment.status === 'succeeded' && { color: CoachColors.accent },
                        payment.status === 'failed' && { color: CoachColors.danger }
                      ]}>
                        {payment.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── AVAILABLE PLANS (no subscription) ── */}
        {!subscription && plans && plans.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>AVAILABLE PLANS</Text>
            <View style={styles.sectionDivider} />
            {plans.map((plan) => (
              <View
                key={plan.id}
                style={styles.tierCard}
                accessibilityLabel={`${plan.name} plan, $${plan.price} per month`}
              >
                <View style={styles.tierTop}>
                  <Text style={styles.tierName}>{plan.name}</Text>
                  <Text style={styles.tierPrice}>${plan.price}<Text style={styles.tierInterval}>/mo</Text></Text>
                </View>
                {plan.description && <Text style={styles.tierDescription}>{plan.description}</Text>}
                {plan.features && plan.features.length > 0 && (
                  <View style={styles.tierFeatures}>
                    {plan.features.slice(0, 3).map((feature: string, fi: number) => (
                      <View key={fi} style={styles.tierFeatureRow}>
                        <View style={styles.tierFeatureDot} />
                        <Text style={styles.tierFeatureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <TouchableOpacity
                  style={styles.subscribeBtn}
                  onPress={() => {
                    if (!clientData) return;
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push({ pathname: SharedRoute.checkout as any, params: { planId: plan.id, clientId: clientData.id } });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.subscribeBtnText}>Subscribe</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── DANGER ZONE: CANCEL ── */}
        {subscription && subscription.status === 'active' && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: CoachColors.danger }]}>DANGER ZONE</Text>
            <View style={[styles.sectionDivider, { backgroundColor: CoachColors.dangerSoft }]} />
            <Text style={styles.dangerText}>
              Cancel your subscription. You'll retain access until{' '}
              {new Date(subscription.current_period_end).toLocaleDateString()}.
            </Text>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); handleCancel(); }}
              disabled={canceling}
              accessibilityRole="button"
              accessibilityLabel={canceling ? 'Canceling subscription' : 'Cancel subscription'}
              activeOpacity={0.6}
            >
              <Text style={styles.cancelBtnText}>{canceling ? 'Canceling…' : 'Cancel plan'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20, color: CoachColors.textPrimary, letterSpacing: 0.5,
  },

  scrollContent: { paddingHorizontal: 24, paddingBottom: 100, paddingTop: 8 },

  // ── Brutalist Section Pattern (matches my-profile.tsx)
  section: { marginBottom: 32 },
  sectionLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10, color: CoachColors.textMuted,
    textTransform: 'uppercase', letterSpacing: 2,
    marginBottom: 10,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginBottom: 16,
  },

  // ── Hero Card (Active Plan)
  heroCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: Radius.xl,
    borderCurve: 'continuous',
    overflow: 'hidden',
    marginBottom: 32,
  },
  heroAccentLine: {
    height: 2,
    backgroundColor: CoachColors.accent,
  },
  heroContent: {
    padding: 20,
  },
  heroTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroIconBadge: {
    width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous',
    backgroundColor: CoachColors.accentSofter,
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
  },
  statusText: {
    fontFamily: CoachFonts.bodySemiBold, fontSize: 10,
    color: CoachColors.accent, letterSpacing: 1.5,
  },
  statusBadgeCanceled: { backgroundColor: CoachColors.dangerSoft },
  statusTextCanceled: { color: CoachColors.danger },

  planName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 27, color: CoachColors.textPrimary, marginBottom: 4,
  },
  planPrice: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 31.5, color: CoachColors.textPrimary,
  },
  planPriceAccent: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 31.5, color: CoachColors.accent,
  },
  planInterval: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5, color: CoachColors.textMuted,
  },

  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CoachColors.borderMuted,
    marginVertical: 16,
  },

  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 11, color: CoachColors.textMuted,
    letterSpacing: 1.5,
  },
  detailValue: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 14.5, color: CoachColors.textPrimary,
  },

  // ── Empty State
  emptySection: {
    marginBottom: 32,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 15.5, color: CoachColors.textSecondary,
    marginBottom: 4,
  },
  emptySubtext: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5, color: CoachColors.textFaint,
  },

  // ── Payment Method
  paymentCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: 16,
  },
  paymentLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  paymentIconBox: {
    width: 36, height: 36, borderRadius: 18, borderCurve: 'continuous',
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center', justifyContent: 'center',
  },
  paymentCardTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 17, color: CoachColors.textPrimary,
  },
  paymentCardSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5, color: CoachColors.textMuted,
    marginTop: 2,
  },
  updateCardText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 13.5, color: CoachColors.accent,
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },

  // ── Payment History (Timeline)
  historyContainer: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.border,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16,
  },
  historyRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CoachColors.borderMuted,
  },
  historyLeft: { flex: 1 },
  historyDate: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15.5, color: CoachColors.textPrimary,
  },
  historyPlan: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5, color: CoachColors.textMuted,
    marginTop: 2,
  },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyAmount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17, color: CoachColors.textPrimary,
  },
  historyStatusBadge: {
    backgroundColor: CoachColors.accentSoft,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
  },
  historyStatusText: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 10, color: CoachColors.accent,
    letterSpacing: 1,
  },

  // ── Available Plan Tier Cards
  tierCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1, borderColor: CoachColors.borderMuted,
    borderLeftWidth: 3,
    borderLeftColor: CoachColors.border,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: 20,
    marginBottom: 12,
  },
  tierTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 6,
  },
  tierName: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18, color: CoachColors.textPrimary,
  },
  tierPrice: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24.5,
    color: CoachColors.accent,
  },
  tierInterval: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5, color: CoachColors.textMuted,
  },
  tierDescription: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5, color: CoachColors.textSecondary,
    marginBottom: 12,
  },
  tierFeatures: {
    marginBottom: 16,
  },
  tierFeatureRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 6,
  },
  tierFeatureDot: {
    width: 4, height: 4, borderRadius: 2, borderCurve: 'continuous',
    marginRight: 10,
    backgroundColor: CoachColors.textMuted,
  },
  tierFeatureText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5, color: CoachColors.textSecondary,
  },
  subscribeBtn: {
    paddingVertical: 14,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    backgroundColor: CoachColors.accent,
  },
  subscribeBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15.5, color: CoachColors.onAccent,
  },

  // ── Danger Zone (Cancel)
  dangerText: {
    fontFamily: CoachFonts.body,
    fontSize: 14.5, color: CoachColors.textMuted,
    marginBottom: 16,
    lineHeight: 22.5,
  },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    borderWidth: 1, borderColor: CoachColors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CoachColors.dangerSoft,
  },
  cancelBtnText: {
    fontFamily: CoachFonts.headingSemiBold,
    fontSize: 14.5, color: CoachColors.danger,
    letterSpacing: 0.3,
  },
});
