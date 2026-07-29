import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import type { ThemeColors } from '../../context/ThemeContext';
import Button from '../../components/Button';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { useStripe } from '@stripe/stripe-react-native';
import { ClientRoute, SharedRoute } from '../../types/routes';
import * as Haptics from 'expo-haptics';

// ─── TIER ACCENT COLORS ────────────────────────────────────────
const PLAN_ACCENTS = ['#FFD700', '#22D3EE', '#A78BFA', '#22C55E', '#FF6B35'];

export default function MySubscriptionScreen() {
  const router = useRouter();
  const { clientData, subscription, paymentHistory, plans, cancelSubscription, setupPaymentMethod, refreshData } = useClient();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
          <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">Membership</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        {/* ── HERO: ACTIVE PLAN ── */}
        {subscription && subscription.plans ? (
          <View style={styles.heroCard}>
            {/* Accent top line */}
            <View style={[styles.heroAccentLine, subscription.status === 'canceled' && { backgroundColor: colors.red }]} />

            <View style={styles.heroContent}>
              <View style={styles.heroTop}>
                <View style={styles.heroIconBadge}>
                  <Ionicons name="star" size={18} color={colors.accent} />
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
                  <Ionicons name="card" size={18} color="#A78BFA" />
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
                <Text style={styles.updateCardText}>{managingCard ? 'UPDATING...' : 'UPDATE'}</Text>
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
                      payment.status === 'succeeded' && { backgroundColor: `${colors.green}18` },
                      payment.status === 'failed' && { backgroundColor: `${colors.red}18` }
                    ]}>
                      <Text style={[
                        styles.historyStatusText,
                        payment.status === 'succeeded' && { color: colors.green },
                        payment.status === 'failed' && { color: colors.red }
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
            {plans.map((plan, index) => {
              const accentColor = plan.color || PLAN_ACCENTS[index % PLAN_ACCENTS.length];
              return (
                <View
                  key={plan.id}
                  style={[styles.tierCard, { borderLeftColor: accentColor }]}
                  accessibilityLabel={`${plan.name} plan, $${plan.price} per month`}
                >
                  <View style={styles.tierTop}>
                    <Text style={styles.tierName}>{plan.name.toUpperCase()}</Text>
                    <Text style={[styles.tierPrice, { color: accentColor }]}>${plan.price}<Text style={styles.tierInterval}>/mo</Text></Text>
                  </View>
                  {plan.description && <Text style={styles.tierDescription}>{plan.description}</Text>}
                  {plan.features && plan.features.length > 0 && (
                    <View style={styles.tierFeatures}>
                      {plan.features.slice(0, 3).map((feature: string, fi: number) => (
                        <View key={fi} style={styles.tierFeatureRow}>
                          <View style={[styles.tierFeatureDot, { backgroundColor: accentColor }]} />
                          <Text style={styles.tierFeatureText}>{feature}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    style={[styles.subscribeBtn, { backgroundColor: accentColor }]}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push({ pathname: SharedRoute.checkout as any, params: { planId: plan.id } }); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.subscribeBtnText}>SUBSCRIBE</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* ── DANGER ZONE: CANCEL ── */}
        {subscription && subscription.status === 'active' && (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: `${colors.red}99` }]}>DANGER ZONE</Text>
            <View style={[styles.sectionDivider, { backgroundColor: `${colors.red}20` }]} />
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
              <Text style={styles.cancelBtnText}>{canceling ? 'CANCELING...' : 'CANCEL PLAN'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  
  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 12,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: '#1C1C1E',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 18, color: '#FFFFFF', letterSpacing: 0.5,
  },
  
  scrollContent: { paddingHorizontal: 24, paddingBottom: 100, paddingTop: 8 },
  
  // ── Brutalist Section Pattern (matches my-profile.tsx)
  section: { marginBottom: 32 },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9, color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase', letterSpacing: 2,
    marginBottom: 10,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: 16,
  },

  // ── Hero Card (Active Plan)
  heroCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1, borderColor: '#1C1C1E',
    borderRadius: Radius.xl,
    overflow: 'hidden',
    marginBottom: 32,
  },
  heroAccentLine: {
    height: 2,
    backgroundColor: colors.accent,
  },
  heroContent: {
    padding: 20,
  },
  heroTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroIconBadge: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${colors.accent}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    backgroundColor: `${colors.green}18`,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: Radius.xs,
  },
  statusText: {
    fontFamily: FontFamily.bodySemiBold, fontSize: 9,
    color: colors.green, letterSpacing: 1.5,
  },
  statusBadgeCanceled: { backgroundColor: `${colors.red}18` },
  statusTextCanceled: { color: colors.red },
  
  planName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 24, color: '#FFFFFF', marginBottom: 4,
  },
  planPrice: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28, color: '#FFFFFF',
  },
  planPriceAccent: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 28, color: '#FFD700',
  },
  planInterval: {
    fontFamily: FontFamily.body,
    fontSize: 14, color: 'rgba(255,255,255,0.35)',
  },
  
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 16,
  },
  
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10, color: 'rgba(255,255,255,0.35)',
    letterSpacing: 1.5,
  },
  detailValue: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13, color: '#FFFFFF',
  },

  // ── Empty State
  emptySection: {
    marginBottom: 32,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 14, color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
  },
  emptySubtext: {
    fontFamily: FontFamily.body,
    fontSize: 13, color: 'rgba(255,255,255,0.25)',
  },

  // ── Payment Method
  paymentCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0C0C0E',
    borderWidth: 1, borderColor: '#1C1C1E',
    borderRadius: Radius.lg,
    padding: 16,
  },
  paymentLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  paymentIconBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(167,139,250,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  paymentCardTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15, color: '#FFFFFF',
  },
  paymentCardSub: {
    fontFamily: FontFamily.body,
    fontSize: 11, color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
  updateCardText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11, color: colors.accent,
    letterSpacing: 1.5,
    textDecorationLine: 'underline',
  },

  // ── Payment History (Timeline)
  historyContainer: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1, borderColor: '#1C1C1E',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16,
  },
  historyRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  historyLeft: { flex: 1 },
  historyDate: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14, color: '#FFFFFF',
  },
  historyPlan: {
    fontFamily: FontFamily.body,
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
    marginTop: 2,
  },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyAmount: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15, color: '#FFFFFF',
  },
  historyStatusBadge: {
    backgroundColor: `${colors.accent}18`,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  historyStatusText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 9, color: colors.accent,
    letterSpacing: 1,
  },

  // ── Available Plan Tier Cards
  tierCard: {
    backgroundColor: '#0C0C0E',
    borderWidth: 1, borderColor: '#1C1C1E',
    borderLeftWidth: 3,
    borderRadius: Radius.lg,
    padding: 20,
    marginBottom: 12,
  },
  tierTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 6,
  },
  tierName: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16, color: '#FFFFFF',
    letterSpacing: 1,
  },
  tierPrice: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
  },
  tierInterval: {
    fontFamily: FontFamily.body,
    fontSize: 12, color: 'rgba(255,255,255,0.35)',
  },
  tierDescription: {
    fontFamily: FontFamily.body,
    fontSize: 13, color: 'rgba(255,255,255,0.45)',
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
    width: 4, height: 4, borderRadius: 2,
    marginRight: 10,
  },
  tierFeatureText: {
    fontFamily: FontFamily.body,
    fontSize: 13, color: 'rgba(255,255,255,0.6)',
  },
  subscribeBtn: {
    paddingVertical: 14,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  subscribeBtnText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 13, color: '#000',
    letterSpacing: 1.5,
  },

  // ── Danger Zone (Cancel)
  dangerText: {
    fontFamily: FontFamily.body,
    fontSize: 13, color: 'rgba(255,255,255,0.4)',
    marginBottom: 16,
    lineHeight: 20,
  },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: Radius.sm,
    borderWidth: 1, borderColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.red}08`,
  },
  cancelBtnText: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 13, color: colors.red,
    letterSpacing: 1.5,
  },
});
