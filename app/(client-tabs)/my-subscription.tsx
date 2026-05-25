import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import type { ThemeColors } from '../../context/ThemeContext';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';
import { useStripe } from '@stripe/stripe-react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function MySubscriptionScreen() {
  const router = useRouter();
  const { clientData, subscription, paymentHistory, plans, cancelSubscription, setupPaymentMethod, refreshData } = useClient();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const { showAlert } = useAlert();
  const { initPaymentSheet, presentPaymentSheet, confirmSetupIntent } = useStripe();

  const [refreshing, setRefreshing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [managingCard, setManagingCard] = useState(false);

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
    setManagingCard(true);
    try {
      // Create SetupIntent
      const { clientSecret } = await setupPaymentMethod();
      
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
      showAlert({ type: 'error', title: 'Error', message: err.message || 'Failed to manage card.' });
    } finally {
      setManagingCard(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Subscription</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />}
      >
        {/* Active Subscription */}
        {subscription && subscription.plans ? (
          <LinearGradient
            colors={isDark ? ['#1E1E28', '#252535'] : ['#FFF8F5', '#FFF0E8']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroIconBadge}>
                <Ionicons name="star" size={24} color={colors.accent} />
              </View>
              <View style={[styles.statusBadge, subscription.status === 'canceled' && styles.statusBadgeCanceled]}>
                <Text style={[styles.statusText, subscription.status === 'canceled' && styles.statusTextCanceled]}>
                  {subscription.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={styles.planName}>{subscription.plans.name}</Text>
            <Text style={styles.planPrice}>${subscription.plans.price} <Text style={styles.planInterval}>/ month</Text></Text>

            <View style={styles.divider} />

            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Next Billing Date</Text>
              <Text style={styles.detailValue}>
                {subscription.status === 'canceled' ? 'Cancels ' : 'Renews '}
                {new Date(subscription.current_period_end).toLocaleDateString()}
              </Text>
            </View>
          </LinearGradient>
        ) : (
          <Card style={styles.emptyCard}>
            <View style={[styles.heroIconBadge, { backgroundColor: colors.bgPrimary, alignSelf: 'center', marginBottom: Spacing.md }]}>
              <Ionicons name="information-circle-outline" size={32} color={colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>No Active Subscription</Text>
            <Text style={styles.emptyText}>You don't currently have an active coaching plan.</Text>
          </Card>
        )}

        {/* Payment Method */}
        {subscription && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <Card style={styles.paymentMethodCard}>
              <View style={styles.paymentMethodLeft}>
                <Ionicons name="card" size={24} color={colors.textSecondary} />
                <Text style={styles.paymentMethodText}>Card on file</Text>
              </View>
              <TouchableOpacity onPress={handleManageCard} disabled={managingCard}>
                <Text style={styles.updateCardText}>{managingCard ? 'Updating...' : 'Update'}</Text>
              </TouchableOpacity>
            </Card>
          </View>
        )}

        {/* Payment History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment History</Text>
          {paymentHistory.length === 0 ? (
            <Card style={styles.paymentMethodCard}>
              <Text style={[styles.emptyText, { marginBottom: 0 }]}>No payment history yet.</Text>
            </Card>
          ) : (
            paymentHistory.map((payment) => (
              <Card key={payment.id} style={styles.historyCard}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyDate}>{new Date(payment.created_at).toLocaleDateString()}</Text>
                  <Text style={styles.historyPlan}>{payment.plans?.name || 'Coaching Plan'}</Text>
                </View>
                <View style={styles.historyRight}>
                  <Text style={styles.historyAmount}>${(payment.amount / 100).toFixed(2)}</Text>
                  <View style={[
                    styles.historyStatus, 
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
              </Card>
            ))
          )}
        </View>

        {/* Available Plans (if no subscription) */}
        {!subscription && plans && plans.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Plans</Text>
            {plans.map((plan) => (
              <Card key={plan.id} style={styles.planCard}>
                <View style={styles.planTop}>
                  <Text style={styles.planNameSmall}>{plan.name}</Text>
                  <Text style={styles.planPriceSmall}>${plan.price}/mo</Text>
                </View>
                {plan.description && <Text style={styles.planDescription}>{plan.description}</Text>}
                <Button 
                  title="Subscribe" 
                  onPress={() => router.push({ pathname: '/checkout', params: { planId: plan.id } } as any)} 
                  style={{ marginTop: Spacing.md }}
                />
              </Card>
            ))}
          </View>
        )}

        {/* Cancel Button */}
        {subscription && subscription.status === 'active' && (
          <TouchableOpacity 
            style={styles.cancelBtn} 
            onPress={handleCancel}
            disabled={canceling}
          >
            <Text style={styles.cancelBtnText}>{canceling ? 'Canceling...' : 'Cancel Subscription'}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary },
  
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  
  heroCard: {
    padding: Spacing.xl, borderRadius: Radius.xl, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: colors.border,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.lg },
  heroIconBadge: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: `${colors.accent}15`,
    alignItems: 'center', justifyContent: 'center',
  },
  statusBadge: {
    backgroundColor: `${colors.green}18`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full,
  },
  statusText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.green },
  statusBadgeCanceled: { backgroundColor: `${colors.red}18` },
  statusTextCanceled: { color: colors.red },
  
  planName: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.xl, color: colors.textPrimary, marginBottom: 4 },
  planPrice: { fontFamily: FontFamily.headingBold, fontSize: FontSize['2xl'], color: colors.textPrimary },
  planInterval: { fontFamily: FontFamily.body, fontSize: FontSize.md, color: colors.textSecondary },
  
  divider: { height: 1, backgroundColor: colors.borderStrong, marginVertical: Spacing.lg },
  
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textSecondary },
  detailValue: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary },
  
  emptyCard: { padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.xl },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary, marginBottom: Spacing.xs },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textTertiary, textAlign: 'center' },
  
  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg, color: colors.textPrimary, marginBottom: Spacing.md },
  
  paymentMethodCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.lg },
  paymentMethodLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  paymentMethodText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  updateCardText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.accent },
  
  historyCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, marginBottom: Spacing.sm },
  historyLeft: { flex: 1 },
  historyDate: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  historyPlan: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textSecondary, marginTop: 2 },
  historyRight: { alignItems: 'flex-end', gap: 4 },
  historyAmount: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  historyStatus: { backgroundColor: `${colors.accent}18`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  historyStatusText: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.accent },
  
  planCard: { marginBottom: Spacing.md },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  planNameSmall: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  planPriceSmall: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.textPrimary },
  planDescription: { fontFamily: FontFamily.body, fontSize: FontSize.sm, color: colors.textSecondary },
  
  cancelBtn: { marginTop: Spacing.xl, paddingVertical: Spacing.md, alignItems: 'center' },
  cancelBtnText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base, color: colors.red },
});
