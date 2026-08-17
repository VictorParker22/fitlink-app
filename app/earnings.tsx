import { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabase';
import { CoachColors, CoachFonts } from '../constants/coachDesign';
import RollingNumber from '../components/RollingNumber';
import BoltEmptyState from '../components/mascot/BoltEmptyState';

/**
 * Earnings — design turn 13 "Money".
 *
 * Fixes over the previous version: no caps-lock, no orange wash, single lime
 * accent. "Total earned" used to be `totalNet * 3` (three months of current
 * MRR dressed up as a lifetime figure) — that multiplier is gone. "Since you
 * started" below is a real sum of recorded transactions and class payouts,
 * not a projection; it's still an approximation (see comment at its
 * calculation) since there's no ledger table to read from, but it is no
 * longer inflated by an invented multiplier. The six-month bar chart that
 * filled itself with `Math.random()` has been replaced with the real
 * per-plan revenue breakdown, and the projection it implies is labelled as
 * a projection.
 */

const SUPABASE_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co';
const PLATFORM_FEE = 0.10;

export default function EarningsScreen() {
  const router = useRouter();
  const { trainer, plans, clients, refreshData, classes } = useApp();
  const [stripeLoading, setStripeLoading] = useState(false);
  const [classRevenue, setClassRevenue] = useState<any[]>([]);
  const [classRevenueLoading, setClassRevenueLoading] = useState(true);

  useEffect(() => {
    if (!trainer) return;
    async function fetchClassRevenue() {
      const { data, error } = await supabase
        .from('class_revenue_shares')
        .select('*')
        .eq('trainer_id', trainer!.id)
        .order('month', { ascending: false })
        .limit(6);
      if (error) {
        console.error('[Earnings] Class revenue fetch failed:', error);
      } else if (data) {
        // SCHEMA: class_revenue_shares stores the payout as `payout_cents`
        // (integer cents). There is no `amount` column — reading one gave
        // undefined and every payout below rendered as $0 (or crashed on
        // toFixed). Derive the dollar amount once, here.
        setClassRevenue(
          data.map((r: any) => ({ ...r, amount: (r.payout_cents ?? 0) / 100 })),
        );
      }
      setClassRevenueLoading(false);
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
  const formatWhole = (n: number) => `$${Math.round(n).toLocaleString()}`;

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

  const totalNet = useMemo(() => planBreakdown.reduce((s, p) => s + p.net, 0), [planBreakdown]);
  const totalSubscribers = useMemo(() => planBreakdown.reduce((s, p) => s + p.subs, 0), [planBreakdown]);

  // "This month" = current active-subscription MRR + this month's class payout.
  // Real, not multiplied.
  const thisMonthNet = totalNet + (classRevenue[0]?.amount || 0);

  // ── Recent transactions (computed from active clients) ──
  const recentTransactions = useMemo(() => {
    return activeClients
      .filter((c) => c.plan_id)
      .map((client) => {
        const plan = plans.find((p) => p.id === client.plan_id);
        if (!plan) return null;
        const gross = Number(plan.price);
        const net = gross * (1 - PLATFORM_FEE);
        // Client created_at stands in for a payment date — there's no separate
        // payments ledger to read from yet.
        const date = new Date(client.created_at);
        return { client, plan, gross, net, date, status: client.status as string };
      })
      .filter(Boolean)
      .sort((a, b) => b!.date.getTime() - a!.date.getTime())
      .slice(0, 10) as { client: typeof clients[0]; plan: typeof plans[0]; gross: number; net: number; date: Date; status: string }[];
  }, [activeClients, plans]);

  // "Since you started" — sum of every recorded transaction plus every class
  // payout on file. This used to be `totalNet * 3`, a three-month MRR
  // projection dressed up as a lifetime total. This is real data, but still
  // an approximation: it's built from client signup dates standing in for
  // payment dates (see recentTransactions above), not a true payments ledger.
  const sinceStarted = useMemo(() => {
    const fromTransactions = recentTransactions.reduce((s, t) => s + t.net, 0);
    const fromClasses = classRevenue.reduce((s, r) => s + (r.amount || 0), 0);
    return fromTransactions + fromClasses;
  }, [recentTransactions, classRevenue]);

  // Money that has been charged but can't be paid out yet, because Stripe
  // isn't connected. Same underlying real numbers as above.
  const pendingAmount = sinceStarted;

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

  // ── Format helpers ─────────────────────────────────
  const formatDate = (d: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };

  const monthLabel = useMemo(() => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const now = new Date();
    return `${months[now.getMonth()]} ${now.getFullYear()}`;
  }, []);

  const initials = (name: string) => name.split(' ').map(p => p.charAt(0)).join('').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Header ──────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={19} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headerTitle}>Earnings</Text>
            <Text style={styles.headerSub}>{monthLabel}</Text>
          </View>
        </View>

        {!isOnboarded ? (
          <>
            {/* ── 13b: not connected ───────────────────── */}
            <View style={styles.pendingBanner}>
              <View style={styles.pendingBadgeRow}>
                <View style={styles.pendingDot} />
                <Text style={styles.pendingBadge}>Nothing can pay out yet</Text>
              </View>
              <Text style={styles.pendingHeadline}>
                {formatWhole(pendingAmount)} is waiting on{'\n'}your bank details
              </Text>
              <Text style={styles.pendingDesc}>
                {recentTransactions.length > 0
                  ? `${recentTransactions.length} athlete${recentTransactions.length === 1 ? ' has' : 's have'} been charged. Stripe holds the money until your account is verified.`
                  : 'Once athletes are charged, Stripe holds the money until your account is verified.'}
              </Text>
              <TouchableOpacity
                style={styles.connectBtn}
                onPress={handleStripeSetup}
                disabled={stripeLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Connect my bank"
                accessibilityState={{ disabled: stripeLoading, busy: stripeLoading }}
              >
                {stripeLoading ? (
                  <ActivityIndicator size="small" color={CoachColors.onAccent} />
                ) : (
                  <Text style={styles.connectBtnText}>Connect my bank</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.pendingFootnote}>About 4 minutes · needs your ID</Text>
            </View>

            {/* ── Held for you ─────────────────────────── */}
            {recentTransactions.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Held for you</Text>
                <View style={styles.listCard}>
                  {recentTransactions.slice(0, 5).map((tx, index) => (
                    <View
                      key={`${tx.client.id}-${index}`}
                      style={[styles.heldRow, index < Math.min(recentTransactions.length, 5) - 1 && styles.rowBorder]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.heldName} numberOfLines={1}>{tx.client.name}</Text>
                        <Text style={styles.heldMeta} numberOfLines={1}>{formatDate(tx.date)} · {tx.plan.name}</Text>
                      </View>
                      <Text style={styles.heldAmount}>{formatCurrency(tx.net)}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── On-demand class pool ─────────────────── */}
            <Text style={styles.sectionTitle}>On-demand class pool</Text>
            <Text style={styles.sectionDesc}>
              Athletes on the On-Demand Pass pay one fee. Each month it's split between coaches by minutes watched.
            </Text>
            <ClassPoolCard
              classRevenue={classRevenue}
              classRevenueLoading={classRevenueLoading}
              publishedClasses={publishedClasses}
              totalClassMinutes={totalClassMinutes}
              formatCurrency={formatCurrency}
            />

            <HowPayoutsWork />
          </>
        ) : (
          <>
            {/* ── 13a: connected ────────────────────────── */}
            <View style={styles.headlineCard}>
              <Text style={styles.headlineLabel}>This month, so far</Text>
              <View style={styles.headlineRow}>
                <RollingNumber
                  text={formatWhole(thisMonthNet)}
                  style={styles.headlineValue}
                />
              </View>
              <Text style={styles.headlineDesc}>
                From {totalSubscribers} active subscription{totalSubscribers === 1 ? '' : 's'}, after the 10% fee.
              </Text>
              <View style={styles.headlineFooter}>
                <View style={styles.pendingDotAccent} />
                <Text style={styles.headlineFooterText}>Paying out automatically via Stripe</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statTile} accessible={true} accessibilityLabel={`Paid this month, ${formatWhole(thisMonthNet)}`}>
                <Text style={styles.statLabel}>Paid this month</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatWhole(thisMonthNet)}</Text>
              </View>
              <View style={styles.statTile} accessible={true} accessibilityLabel={`Since you started, ${formatWhole(sinceStarted)}`}>
                <Text style={styles.statLabel}>Since you started</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{formatWhole(sinceStarted)}</Text>
              </View>
            </View>

            {/* ── Stripe Dashboard Button ────────────────── */}
            <TouchableOpacity
              style={styles.dashboardBtn}
              onPress={handleStripeDashboard}
              disabled={stripeLoading}
              activeOpacity={0.85}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Stripe dashboard. Balances, disputes, tax documents. Double tap to open"
              accessibilityState={{ disabled: stripeLoading, busy: stripeLoading }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.dashboardBtnTitle}>Stripe dashboard</Text>
                <Text style={styles.dashboardBtnSub}>Balances, disputes, tax documents</Text>
              </View>
              {stripeLoading ? (
                <ActivityIndicator size="small" color={CoachColors.textPrimary} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={CoachColors.textFaint} />
              )}
            </TouchableOpacity>

            {/* ── Monthly, as it stands (real breakdown, labelled as a projection) ── */}
            {planBreakdown.length > 0 && (
              <>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>Monthly, as it stands</Text>
                  <Text style={styles.projectionTag}>projection</Text>
                </View>
                <Text style={styles.sectionDesc}>
                  If nobody joins or leaves, next month lands at{' '}
                  <Text style={styles.sectionDescStrong}>{formatWhole(totalNet)}</Text>.
                </Text>
                <View style={styles.breakdownCard}>
                  {planBreakdown.map((item, index) => {
                    const barPercent = totalNet > 0 ? (item.net / totalNet) * 100 : 0;
                    return (
                      <View key={item.plan.id} style={[styles.breakdownItem, index < planBreakdown.length - 1 && styles.breakdownItemBorder]}>
                        <View style={styles.breakdownRow}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.breakdownName} numberOfLines={1}>{item.plan.name}</Text>
                            <Text style={styles.breakdownMeta}>{item.subs} holder{item.subs === 1 ? '' : 's'} · {formatCurrency(Number(item.plan.price))}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.breakdownAmount}>{formatCurrency(item.net)}</Text>
                            <Text style={styles.breakdownAfterFee}>after fee</Text>
                          </View>
                        </View>
                        <View style={styles.breakdownBarTrack}>
                          <View style={[styles.breakdownBarFill, { width: `${Math.max(barPercent, 2)}%` }]} />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Payments received ─────────────────────── */}
            {recentTransactions.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Payments received</Text>
                <View style={styles.listCard}>
                  {recentTransactions.map((tx, index) => (
                    <View
                      key={`${tx.client.id}-${index}`}
                      style={[styles.txRow, index < recentTransactions.length - 1 && styles.rowBorder]}
                    >
                      <View style={styles.txAvatar}>
                        <Text style={styles.txAvatarText}>{initials(tx.client.name)}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.heldName} numberOfLines={1}>{tx.client.name}</Text>
                        <Text style={styles.heldMeta} numberOfLines={1}>{tx.plan.name} · {formatDate(tx.date)}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.heldAmount}>{formatCurrency(tx.net)}</Text>
                        <Text style={styles.breakdownAfterFee}>of {formatCurrency(tx.gross)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Class Revenue ─────────────────────────── */}
            <Text style={styles.sectionTitle}>On-demand class pool</Text>
            <ClassPoolCard
              classRevenue={classRevenue}
              classRevenueLoading={classRevenueLoading}
              publishedClasses={publishedClasses}
              totalClassMinutes={totalClassMinutes}
              formatCurrency={formatCurrency}
            />

            {/* ── Empty State ────────────────────────────── */}
            {plans.length === 0 && (
              <BoltEmptyState
                pose="flex"
                title="No earnings yet"
                subtitle="Money starts moving once a pass exists and an athlete holds it. Build your first pass to open the door."
                actionLabel="Build a pass"
                onAction={() => router.push('/create-plan' as any)}
              />
            )}

            <HowPayoutsWork />
          </>
        )}

        {/* Bottom spacing */}
        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Shared sub-sections ────────────────────────────────────────

function HowPayoutsWork() {
  const items = [
    'Money lands in your bank 2 business days after an athlete is charged.',
    'FitLink keeps 10% of each payment. Card fees come out of that.',
    'Class pool money is paid on the 5th of the following month.',
  ];
  return (
    <View style={styles.payoutInfoCard}>
      <Text style={styles.payoutInfoTitle}>How payouts work</Text>
      {items.map((text, i) => (
        <View key={i} style={styles.payoutInfoRow}>
          <View style={styles.payoutInfoDot} />
          <Text style={styles.payoutInfoText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function ClassPoolCard({
  classRevenue,
  classRevenueLoading,
  publishedClasses,
  totalClassMinutes,
  formatCurrency,
}: {
  classRevenue: any[];
  classRevenueLoading: boolean;
  publishedClasses: any[];
  totalClassMinutes: number;
  formatCurrency: (n: number) => string;
}) {
  if (classRevenueLoading) {
    return (
      <View style={[styles.breakdownCard, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator size="small" color={CoachColors.textSecondary} />
      </View>
    );
  }

  if (classRevenue.length === 0 && publishedClasses.length === 0) {
    return (
      <View style={styles.breakdownCard}>
        <Text style={styles.emptyClassText}>Create classes to start earning from the On-Demand Pass pool.</Text>
      </View>
    );
  }

  const share = classRevenue[0];
  const sharePercent = share?.share_percentage ? Number(share.share_percentage) : 0;

  return (
    <View style={styles.breakdownCard}>
      <View style={styles.poolHeaderRow}>
        <View>
          <Text style={styles.poolLabel}>Your share, this month</Text>
          <Text style={styles.poolValue}>{formatCurrency(share?.amount || 0)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.poolMeta}>{sharePercent.toFixed(1)}% of the pool</Text>
          <Text style={styles.poolMetaSub}>{Math.round(totalClassMinutes)} minutes watched</Text>
        </View>
      </View>
      <View style={styles.breakdownBarTrack}>
        <View style={[styles.breakdownBarFill, { width: `${Math.max(sharePercent, 2)}%` }]} />
      </View>

      {publishedClasses.length > 0 && (
        <View style={styles.poolClassList}>
          {publishedClasses.map((c) => {
            const pct = totalClassMinutes > 0 ? Math.round(((c.total_watch_minutes || 0) / totalClassMinutes) * 100) : 0;
            return (
              <View key={c.id} style={styles.poolClassRow}>
                <Text style={styles.poolClassName} numberOfLines={1}>{c.title}</Text>
                <Text style={styles.poolClassMins}>{c.total_watch_minutes || 0} min</Text>
                <Text style={styles.poolClassPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}

      {classRevenue.length > 0 && (
        <View style={styles.poolHistory}>
          <Text style={styles.poolHistoryLabel}>Payout history</Text>
          {classRevenue.map((r, i) => {
            const dateObj = new Date(r.month + 'T00:00:00Z');
            const monthName = isNaN(dateObj.getTime()) ? r.month : dateObj.toLocaleString('default', { month: 'short', year: 'numeric', timeZone: 'UTC' });
            return (
              <View key={r.id} style={[styles.heldRow, i < classRevenue.length - 1 && styles.rowBorder]}>
                <Text style={styles.heldName}>{monthName}</Text>
                <Text style={styles.heldAmount}>{formatCurrency(r.amount || 0)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 21.5,
    letterSpacing: -0.3,
    color: CoachColors.textPrimary,
  },
  headerSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textMuted,
    marginTop: 1,
  },

  // ── Section titles ──
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginTop: 22,
    marginBottom: 4,
  },
  projectionTag: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
  },
  sectionDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionDescStrong: {
    color: CoachColors.textPrimary,
    fontFamily: CoachFonts.bodySemiBold,
  },

  // ── Pending / not connected banner (13b) ──
  pendingBanner: {
    marginTop: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.warningSoft,
    borderRadius: 16,
    padding: 18,
  },
  pendingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CoachColors.warning,
  },
  pendingDotAccent: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CoachColors.accent,
  },
  pendingBadge: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.warning,
    letterSpacing: 0.6,
  },
  pendingHeadline: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    marginTop: 10,
    lineHeight: 29,
  },
  pendingDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    marginTop: 8,
    lineHeight: 21.5,
  },
  connectBtn: {
    backgroundColor: CoachColors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  connectBtnText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 15.5,
    color: CoachColors.onAccent,
  },
  pendingFootnote: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textFaint,
    textAlign: 'center',
    marginTop: 9,
  },

  // ── Headline card (13a, connected) ──
  headlineCard: {
    marginTop: 18,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.border,
    borderRadius: 16,
    padding: 18,
  },
  headlineLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    letterSpacing: 0.6,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 9,
    marginTop: 9,
  },
  headlineValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 40.5,
    letterSpacing: -0.5,
    color: CoachColors.accent,
  },
  headlineDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    marginTop: 8,
    lineHeight: 20,
  },
  headlineFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  headlineFooterText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },

  // ── Stat tiles ──
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  statTile: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 12,
    padding: 13,
  },
  statLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  statValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 20,
    color: CoachColors.textPrimary,
    marginTop: 4,
  },

  // ── Stripe Dashboard Button ──
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 16,
    marginTop: 20,
  },
  dashboardBtnTitle: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  dashboardBtnSub: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 2,
  },

  // ── Breakdown / pool card ──
  breakdownCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 16,
  },
  breakdownItem: {
    paddingBottom: 13,
  },
  breakdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
    marginBottom: 13,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breakdownName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  breakdownMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  breakdownAmount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  breakdownAfterFee: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textFaint,
  },
  breakdownBarTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: CoachColors.borderMuted,
    marginTop: 12,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: CoachColors.accent,
  },

  // ── List cards (transactions / held-for-you) ──
  listCard: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    overflow: 'hidden',
  },
  heldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: CoachColors.borderMuted,
  },
  heldName: {
    fontFamily: CoachFonts.bodySemiBold,
    fontSize: 15,
    color: CoachColors.textPrimary,
  },
  heldMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 13,
    color: CoachColors.textMuted,
    marginTop: 1,
  },
  heldAmount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 15.5,
    color: CoachColors.textPrimary,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  txAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: CoachColors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txAvatarText: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13,
    color: CoachColors.textSecondary,
  },

  // ── Class pool ──
  poolHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  poolLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    letterSpacing: 0.6,
  },
  poolValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 24.5,
    color: CoachColors.textPrimary,
    marginTop: 5,
  },
  poolMeta: {
    fontFamily: CoachFonts.body,
    fontSize: 13.5,
    color: CoachColors.textSecondary,
  },
  poolMetaSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
    marginTop: 3,
  },
  poolClassList: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
    gap: 10,
  },
  poolClassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  poolClassName: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  poolClassMins: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  poolClassPct: {
    width: 36,
    textAlign: 'right',
    fontFamily: CoachFonts.bodyBold,
    fontSize: 13.5,
    color: CoachColors.textPrimary,
  },
  poolHistory: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  poolHistoryLabel: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.textFaint,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  emptyClassText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    marginTop: 8,
  },
  emptyTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 17,
    color: CoachColors.textPrimary,
  },
  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 260,
  },

  // ── How payouts work ──
  payoutInfoCard: {
    marginTop: 22,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 16,
  },
  payoutInfoTitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12.5,
    color: CoachColors.textFaint,
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  payoutInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  payoutInfoDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: CoachColors.textFaint,
    marginTop: 7,
  },
  payoutInfoText: {
    flex: 1,
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
    lineHeight: 20,
  },
});
