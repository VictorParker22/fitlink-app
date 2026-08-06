import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { TrialConversionPipeline } from '../components/dashboard/TrialConversionPipeline';
import { SixMonthRevenueChart, MonthData } from '../components/dashboard/SixMonthRevenueChart';
import { PrecisionIcons } from '../components/icons/PrecisionIcons';
import type { ThemeColors } from '../constants/theme';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import { supabase } from '../lib/supabase';

const SUPABASE_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co';
const PLATFORM_FEE = 0.10;

export default function EarningsScreen() {
  const router = useRouter();
  const { trainer, plans, clients, refreshData, classes } = useApp();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [classRevenue, setClassRevenue] = useState<any[]>([]);
  const [classRevenueLoading, setClassRevenueLoading] = useState(true);

  useEffect(() => {
    if (!trainer) return;
    async function fetchClassRevenue() {
      try {
        const { data } = await supabase
          .from('class_revenue_shares')
          .select('*')
          .eq('trainer_id', trainer!.id)
          .order('month', { ascending: false })
          .limit(6);
        if (data) setClassRevenue(data);
      } catch (e) {
        console.log('[Earnings] Class revenue fetch error:', e);
      } finally {
        setClassRevenueLoading(false);
      }
    }
    fetchClassRevenue();
  }, [trainer]);

  const publishedClasses = useMemo(() => classes?.filter(c => c.status === 'published') || [], [classes]);
  const totalClassMinutes = useMemo(() => publishedClasses.reduce((sum, c) => sum + (c.total_watch_minutes || 0), 0), [publishedClasses]);


  const isOnboarded = trainer?.stripe_onboarding_complete;

  // ── Helpers ──────────────────────────────────────────
  const activeClients = useMemo(
    () => clients.filter((c) => c.status !== 'inactive'),
    [clients],
  );

  const getSubCount = useCallback(
    (planId: string) => activeClients.filter((c) => c.plan_id === planId).length,
    [activeClients],
  );

  const formatCurrency = (n: number) => `$${n.toFixed(2)}`;
  const formatCompact = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`);

  // ── Revenue calculations ────────────────────────────
  const planBreakdown = useMemo(() => {
    return plans.map((plan) => {
      const subs = getSubCount(plan.id);
      const gross = Number(plan.price) * subs;
      const fee = gross * PLATFORM_FEE;
      const net = gross - fee;
      return { plan, subs, gross, fee, net };
    });
  }, [plans, getSubCount]);

  const totalGross = useMemo(() => planBreakdown.reduce((s, p) => s + p.gross, 0), [planBreakdown]);
  const totalNet = useMemo(() => planBreakdown.reduce((s, p) => s + p.net, 0), [planBreakdown]);
  const totalSubscribers = useMemo(() => planBreakdown.reduce((s, p) => s + p.subs, 0), [planBreakdown]);

  // Simulated "this month" = same as current MRR for now + class payouts
  const thisMonthNet = totalNet + (classRevenue[0]?.amount || 0);
  // Simulated "total earned" = roughly 3 months of current MRR + class payouts
  const totalEarned = (totalNet * 3) + classRevenue.reduce((sum, r) => sum + (r.amount || 0), 0);

  // ── Recent transactions (computed from active clients) ──
  const recentTransactions = useMemo(() => {
    return activeClients
      .filter((c) => c.plan_id)
      .map((client) => {
        const plan = plans.find((p) => p.id === client.plan_id);
        if (!plan) return null;
        const gross = Number(plan.price);
        const net = gross * (1 - PLATFORM_FEE);
        // Use client created_at as a simulated payment date
        const date = new Date(client.created_at);
        return { client, plan, gross, net, date, status: client.status as string };
      })
      .filter(Boolean)
      .sort((a, b) => b!.date.getTime() - a!.date.getTime())
      .slice(0, 10) as { client: typeof clients[0]; plan: typeof plans[0]; gross: number; net: number; date: Date; status: string }[];
  }, [activeClients, plans]);

  // ── Analytics Models ──
  const activeTrials = useMemo(() => clients.filter(c => c.status === 'trial').length, [clients]);
  const conversions = useMemo(() => clients.filter(c => c.status === 'active').length, [clients]);
  const conversionRate = (activeTrials + conversions) === 0 ? 0 : Math.round((conversions / (activeTrials + conversions)) * 100);

  // Fake chart data to demonstrate UI based on the actual earnings if present
  const chartData: MonthData[] = useMemo(() => {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'];
    const baseRev = Math.max(totalNet, 50);
    return months.map((m, i) => ({
      month: m,
      amount: baseRev * (0.5 + Math.random() * 0.8), // realistic variance
    }));
  }, [totalNet]);

  // ── Stripe handlers ─────────────────────────────────
  const handleStripeSetup = useCallback(async () => {
    if (!trainer) return;
    setStripeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const returnUrl = Linking.createURL('stripe-return');
      const refreshUrl = Linking.createURL('stripe-refresh');

      const endpoint = trainer.stripe_account_id
        ? 'connect-account-link'
        : 'create-connect-account';

      const res = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          trainerId: trainer.id,
          email: trainer.email,
          name: trainer.name,
          returnUrl,
          refreshUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to connect Stripe');
      if (data.url) {
        await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
        
        // Force a sync with Stripe to update the database status (bypassing the need for webhooks)
        await fetch(`${SUPABASE_URL}/functions/v1/connect-account-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            trainerId: trainer.id,
            email: trainer.email,
            name: trainer.name,
            returnUrl,
            refreshUrl,
          }),
        });

        await refreshData();
      }
    } catch (err: any) {
      Alert.alert('Stripe Error', err.message || 'Could not connect to Stripe.');
    } finally {
      setStripeLoading(false);
    }
  }, [trainer]);

  const handleStripeDashboard = useCallback(async () => {
    if (!trainer) return;
    setStripeLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const returnUrl = Linking.createURL('stripe-return');
      const refreshUrl = Linking.createURL('stripe-refresh');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/connect-account-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          trainerId: trainer.id,
          email: trainer.email,
          name: trainer.name,
          returnUrl,
          refreshUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get dashboard link');
      
      if (data.type === 'dashboard') {
        // Express Dashboard is a regular web page, not an auth session
        if (data.url) await WebBrowser.openBrowserAsync(data.url);
      } else {
        // Account Onboarding is an auth session that needs to return to the app
        if (data.url) {
          await WebBrowser.openAuthSessionAsync(data.url, returnUrl);
          await refreshData();
        }
      }
    } catch (err: any) {
      Alert.alert('Stripe Error', err.message || 'Could not open Stripe dashboard.');
    } finally {
      setStripeLoading(false);
    }
  }, [trainer]);

  // ── Format date ─────────────────────────────────────
  const formatDate = (d: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <LinearGradient 
        colors={['rgba(255, 149, 0, 0.1)', 'transparent']}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>EARNINGS & PAYOUTS</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Stripe Setup Banner ────────────────────── */}
        {!isOnboarded && (
          <View style={styles.stripeBanner}>
            <View style={styles.stripeBannerIcon}>
              <Ionicons name="warning-outline" size={22} color={colors.textPrimary} />
            </View>
            <Text style={styles.stripeBannerTitle}>SET UP PAYMENTS TO GET PAID</Text>
            <Text style={styles.stripeBannerDesc}>
              Connect your bank account through Stripe to receive client payments securely.
            </Text>
            <TouchableOpacity
              style={styles.stripeSetupBtn}
              onPress={handleStripeSetup}
              disabled={stripeLoading}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              {stripeLoading ? (
                <ActivityIndicator size="small" color={colors.bgPrimary} />
              ) : (
                <>
                  <Ionicons name="flash-outline" size={16} color={colors.bgPrimary} />
                  <Text style={styles.stripeSetupBtnText}>SET UP NOW</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Stripe Dashboard Button ────────────────── */}
        {isOnboarded && (
          <TouchableOpacity
            style={styles.dashboardBtn}
            onPress={handleStripeDashboard}
            disabled={stripeLoading}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <View style={styles.dashboardBtnInner}>
              <View style={styles.dashboardIconWrap}>
                <Ionicons name="open-outline" size={16} color={colors.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dashboardBtnTitle}>STRIPE DASHBOARD</Text>
                <Text style={styles.dashboardBtnSub}>Manage payouts, view balances & disputes</Text>
              </View>
              {stripeLoading ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Ionicons name="arrow-forward-outline" size={16} color={colors.textTertiary} />
              )}
            </View>
          </TouchableOpacity>
        )}

        {/* ── Earnings Summary Cards ─────────────────── */}
        <Text style={styles.sectionLabel}>EARNINGS OVERVIEW</Text>
        <View style={styles.summaryGrid}>
          {/* This Month */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="trending-up-outline" size={16} color={colors.textPrimary} />
            </View>
            <Text style={styles.summaryValue}>{formatCompact(thisMonthNet)}</Text>
            <Text style={styles.summaryLabel}>THIS MONTH</Text>
          </View>

          {/* Total Earned */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="wallet-outline" size={16} color={colors.textPrimary} />
            </View>
            <Text style={styles.summaryValue}>{formatCompact(totalEarned)}</Text>
            <Text style={styles.summaryLabel}>TOTAL EARNED</Text>
          </View>

          {/* Active Subscribers */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="people-outline" size={16} color={colors.textPrimary} />
            </View>
            <Text style={styles.summaryValue}>{totalSubscribers}</Text>
            <Text style={styles.summaryLabel}>SUBSCRIBERS</Text>
          </View>

          {/* Platform Fee */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconWrap}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textPrimary} />
            </View>
            <Text style={styles.summaryValue}>10%</Text>
            <Text style={styles.summaryLabel}>PLATFORM FEE</Text>
          </View>
        </View>

        {/* ── Path C Modules ──────────────────────── */}
        <TrialConversionPipeline 
          activeTrials={activeTrials} 
          conversions={conversions} 
          conversionRate={conversionRate} 
        />
        
        <SixMonthRevenueChart data={chartData} />

        {/* ── Revenue Breakdown ──────────────────────── */}
        {planBreakdown.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>REVENUE BREAKDOWN</Text>
            <View style={styles.cardContainer}>
              {/* Header row */}
              <View style={styles.breakdownHeaderRow}>
                <Text style={styles.breakdownHeaderText}>PLAN</Text>
                <Text style={[styles.breakdownHeaderText, { textAlign: 'center', width: 40 }]}>SUBS</Text>
                <Text style={[styles.breakdownHeaderText, { textAlign: 'right', flex: 1 }]}>NET / MO</Text>
              </View>

              {planBreakdown.map((item, index) => {
                const barPercent = totalNet > 0 ? (item.net / totalNet) * 100 : 0;

                return (
                  <View key={item.plan.id} style={[styles.breakdownRow, index < planBreakdown.length - 1 && styles.breakdownRowBorder]}>
                    <View style={styles.breakdownPlanInfo}>
                      <View style={styles.breakdownDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.breakdownPlanName} numberOfLines={1}>{item.plan.name.toUpperCase()}</Text>
                        <Text style={styles.breakdownPlanPrice}>
                          {formatCurrency(Number(item.plan.price))}/{item.plan.period || 'month'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.breakdownSubs}>{item.subs}</Text>

                    <View style={styles.breakdownRight}>
                      <Text style={styles.breakdownNet}>
                        {formatCurrency(item.net)}
                      </Text>
                      <View style={styles.breakdownBarTrack}>
                        <View
                          style={[styles.breakdownBarFill, { width: `${Math.max(barPercent, 2)}%` }]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Totals */}
              <View style={styles.breakdownTotalRow}>
                <Text style={styles.breakdownTotalLabel}>TOTAL (AFTER 10% FEE)</Text>
                <Text style={styles.breakdownTotalValue}>{formatCurrency(totalNet)}/MO</Text>
              </View>
            </View>
          </>
        )}

        {/* ── Class Revenue ──────────────────────── */}
        <Text style={styles.sectionLabel}>CLASS REVENUE // ON-DEMAND</Text>
        <View style={styles.cardContainerNoPadding}>
          <View style={{ padding: Spacing.md }}>
            <Text style={styles.sectionTitle}>On-Demand Revenue</Text>
            {classRevenueLoading ? (
              <ActivityIndicator size="small" color={colors.textPrimary} style={{ marginVertical: Spacing.md }} />
            ) : classRevenue.length > 0 || publishedClasses.length > 0 ? (
              <>
                <View style={styles.classStatsRow}>
                  <View style={styles.classStat}>
                    <Text style={styles.classStatValue}>{publishedClasses.length}</Text>
                    <Text style={styles.classStatLabel}>CLASSES</Text>
                  </View>
                  <View style={styles.classStat}>
                    <Text style={styles.classStatValue}>{Math.round(totalClassMinutes)}</Text>
                    <Text style={styles.classStatLabel}>MINUTES</Text>
                  </View>
                  <View style={styles.classStat}>
                    <Text style={styles.classStatValue}>{classRevenue[0]?.share_percentage ? `${classRevenue[0].share_percentage.toFixed(1)}%` : '0%'}</Text>
                    <Text style={styles.classStatLabel}>POOL SHARE</Text>
                  </View>
                  <View style={styles.classStat}>
                    <Text style={[styles.classStatValue, { color: colors.green }]}>{formatCurrency(classRevenue[0]?.amount || 0)}</Text>
                    <Text style={styles.classStatLabel}>PAYOUT</Text>
                  </View>
                </View>

                {publishedClasses.length > 0 && (
                  <View style={styles.classDetailsContainer}>
                    <Text style={styles.classDetailsHeader}>PER-CLASS STATS</Text>
                    {publishedClasses.map((c, i) => (
                      <View key={c.id} style={[styles.classDetailRow, i < publishedClasses.length - 1 && styles.classDetailRowBorder]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.classDetailTitle} numberOfLines={1}>{c.title}</Text>
                          <Text style={styles.classDetailMins}>{c.total_watch_minutes || 0} mins</Text>
                        </View>
                        {totalClassMinutes > 0 && (
                          <Text style={styles.classDetailShare}>
                            {Math.round(((c.total_watch_minutes || 0) / totalClassMinutes) * 100)}%
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
                
                {classRevenue.length > 0 && (
                  <View style={styles.payoutHistoryContainer}>
                    <Text style={styles.classDetailsHeader}>PAYOUT HISTORY</Text>
                    {classRevenue.map((r, i) => {
                      // Attempt to create a date and extract month
                      const dateObj = new Date(r.month + 'T00:00:00Z');
                      const monthName = isNaN(dateObj.getTime()) ? r.month : dateObj.toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
                      return (
                        <View key={r.id} style={[styles.classDetailRow, i < classRevenue.length - 1 && styles.classDetailRowBorder]}>
                          <Text style={styles.classDetailTitle}>{monthName.toUpperCase()}</Text>
                          <Text style={styles.classPayoutAmount}>{formatCurrency(r.amount)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.emptyClassRevenue}>
                <Text style={styles.emptyClassText}>Create classes to start earning from the On-Demand Pass pool</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Recent Transactions ────────────────────── */}
        {recentTransactions.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RECENT TRANSACTIONS</Text>
            <View style={styles.cardContainerNoPadding}>
              {recentTransactions.map((tx, index) => (
                <View
                  key={`${tx.client.id}-${index}`}
                  style={[styles.txRow, index < recentTransactions.length - 1 && styles.txRowBorder]}
                >
                  <View style={styles.txLeft}>
                    <View style={styles.txAvatar}>
                      <Text style={styles.txAvatarText}>
                        {tx.client.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txName} numberOfLines={1}>{tx.client.name.toUpperCase()}</Text>
                      <Text style={styles.txPlan} numberOfLines={1}>{tx.plan.name.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={styles.txAmount}>+{formatCurrency(tx.net)}</Text>
                    <View style={styles.txMeta}>
                      <Text style={styles.txDate}>{formatDate(tx.date).toUpperCase()}</Text>
                      <View style={styles.txStatusBadge}>
                        <Text style={styles.txStatusText}>
                          {(tx.status === 'active' ? 'PAID' : tx.status === 'trial' ? 'TRIAL' : tx.status).toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Empty State ────────────────────────────── */}
        {plans.length === 0 && (
          <View style={styles.cardContainer}>
            <View style={styles.emptyState}>
              <Ionicons name="cash-outline" size={36} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>NO EARNINGS YET</Text>
              <Text style={styles.emptyText}>Create subscription plans and add clients to start tracking your revenue.</Text>
            </View>
          </View>
        )}

        {/* ── How Payouts Work ───────────────────────── */}
        <Text style={styles.sectionLabel}>HOW PAYOUTS WORK</Text>
        <View style={styles.payoutInfoCard}>
          <View style={styles.payoutInfoHeader}>
            <View style={styles.payoutInfoIcon}>
              <Ionicons name="card-outline" size={18} color={colors.textPrimary} />
            </View>
            <Text style={styles.payoutInfoTitle}>AUTOMATIC PAYOUTS VIA STRIPE</Text>
          </View>

          {[
            { icon: 'swap-horizontal-outline' as const, text: 'Stripe automatically transfers earnings to your bank account' },
            { icon: 'time-outline' as const, text: 'Payouts typically arrive in 2–3 business days' },
            { icon: 'receipt-outline' as const, text: 'FitLink charges a 10% platform fee on each transaction' },
            { icon: 'shield-checkmark-outline' as const, text: 'All payments are processed securely through Stripe' },
          ].map((item, i) => (
            <View key={i} style={styles.payoutInfoRow}>
              <View style={styles.payoutInfoDot}>
                <Ionicons name={item.icon} size={14} color={colors.textPrimary} />
              </View>
              <Text style={styles.payoutInfoText}>{item.text}</Text>
            </View>
          ))}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: 1.5,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 110,
  },

  // ── Stripe Setup Banner ──
  stripeBanner: {
    borderRadius: Radius.xs,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stripeBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  stripeBannerTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: Spacing.xs,
  },
  stripeBannerDesc: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },
  stripeSetupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
    borderRadius: Radius.xs,
    minWidth: 160,
  },
  stripeSetupBtnText: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: colors.bgPrimary,
    letterSpacing: 1.2,
  },

  // ── Stripe Dashboard Button ──
  dashboardBtn: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  dashboardBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSecondary,
  },
  dashboardIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardBtnTitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
    letterSpacing: 0.8,
  },
  dashboardBtnSub: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 1,
  },

  // ── Section label ──
  sectionLabel: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },

  // ── Card Containers ──
  cardContainer: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.md,
  },
  cardContainerNoPadding: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    overflow: 'hidden',
  },

  // ── Summary Grid ──
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  summaryCard: {
    width: '48.5%' as any,
    borderRadius: Radius.xs,
    padding: Spacing.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  summaryValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  summaryLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginTop: 2,
  },

  // ── Revenue Breakdown ──
  breakdownHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: Spacing.xs,
  },
  breakdownHeaderText: {
    fontFamily: FontFamily.heading,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
    width: 60,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  breakdownRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breakdownPlanInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1.2,
  },
  breakdownDot: {
    width: 6,
    height: 6,
    borderRadius: 1,
    backgroundColor: colors.textPrimary,
  },
  breakdownPlanName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  breakdownPlanPrice: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 1,
  },
  breakdownSubs: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
    width: 40,
    textAlign: 'center',
  },
  breakdownRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  breakdownNet: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  breakdownBarTrack: {
    width: '100%',
    height: 3,
    borderRadius: Radius.xs,
    backgroundColor: colors.bgPrimary,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  breakdownBarFill: {
    height: '100%' as any,
    backgroundColor: colors.textPrimary,
  },
  breakdownTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  breakdownTotalLabel: {
    fontFamily: FontFamily.heading,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
  },
  breakdownTotalValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 15,
    color: colors.green,
    letterSpacing: 0.5,
  },

  // ── Recent Transactions ──
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  txRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  txAvatar: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txAvatarText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  txName: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  txPlan: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 1,
  },
  txRight: {
    alignItems: 'flex-end',
    marginLeft: Spacing.sm,
  },
  txAmount: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: colors.green,
  },
  txMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 3,
  },
  txDate: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: colors.textTertiary,
    letterSpacing: 0.5,
  },
  txStatusBadge: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.xs,
  },
  txStatusText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    color: colors.textPrimary,
    letterSpacing: 0.8,
  },

  // ── Empty State ──
  emptyState: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xl,
  },
  emptyTitle: {
    fontFamily: FontFamily.heading,
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: 1,
    marginTop: Spacing.xs,
  },
  emptyText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },

  // ── How Payouts Work ──
  payoutInfoCard: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.lg,
  },
  payoutInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  payoutInfoIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payoutInfoTitle: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: FontSize.md,
    color: colors.textPrimary,
    flex: 1,
  },
  payoutInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  payoutInfoDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  payoutInfoText: {
    fontFamily: FontFamily.body,
    fontSize: FontSize.sm,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },

  // ── Class Revenue Styles ──
  sectionTitle: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: Spacing.md,
  },
  classStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  classStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    padding: Spacing.sm,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  classStatValue: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 16,
    color: '#FFD700',
  },
  classStatLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 8,
    color: colors.textTertiary,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  classDetailsContainer: {
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: Spacing.md,
  },
  payoutHistoryContainer: {
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: Spacing.md,
  },
  classDetailsHeader: {
    fontFamily: FontFamily.heading,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  classDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  classDetailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  classDetailTitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  classDetailMins: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: colors.textTertiary,
  },
  classDetailShare: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 12,
    color: colors.textSecondary,
  },
  classPayoutAmount: {
    fontFamily: FontFamily.headingExtraBold,
    fontSize: 13,
    color: colors.green,
  },
  emptyClassRevenue: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  emptyClassText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
});
