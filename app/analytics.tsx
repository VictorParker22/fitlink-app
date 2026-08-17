import { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { useApp } from '../context/AppContext';
import { CoachColors, CoachFonts } from '../constants/coachDesign';

/**
 * Analytics — every figure on this screen traces to a real source:
 *
 * - Session counts, completion rate, hours coached, session types and the
 *   client-growth series all come from the coach_* DB views via
 *   fetchAnalytics(). Months with no signups render as real zeros.
 * - Monthly recurring is holder count × pass price minus the 10% platform
 *   fee — the exact math earnings.tsx uses, so Business screens agree.
 *   The old screen showed two revenue numbers from two different sources
 *   (client-side gross and the DB view's MRR) that could disagree; the DB
 *   figure was dropped in favor of the one consistent with Earnings.
 * - Referral count is the length of the trainer-scoped referrals table.
 *
 * Nothing here is randomized, hardcoded, or a projection dressed up as a
 * measurement.
 */

const SCREEN_WIDTH = Dimensions.get('window').width;
const PLATFORM_FEE = 0.10;

export default function AnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { referrals, activeClients, totalMonthlyRevenue, refreshData, fetchAnalytics } = useApp();
  const [refreshing, setRefreshing] = useState(false);

  const [analyticsData, setAnalyticsData] = useState<{
    growth: any[];
    sessionStats: any[];
    sessionTypes: any[];
    revenue: any;
  } | null>(null);

  useEffect(() => {
    fetchAnalytics().then(setAnalyticsData);
  }, [fetchAnalytics]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshData();
      const data = await fetchAnalytics();
      setAnalyticsData(data);
    } finally { setRefreshing(false); }
  };

  // ── Session stats (coach_session_stats view) ──
  const completedSessions = analyticsData?.sessionStats.find((s: any) => s.status === 'completed')?.session_count || 0;
  const cancelledSessions = analyticsData?.sessionStats.find((s: any) => s.status === 'cancelled')?.session_count || 0;
  const upcomingSessions = analyticsData?.sessionStats.find((s: any) => s.status === 'upcoming')?.session_count || 0;
  const totalSessions = completedSessions + cancelledSessions + upcomingSessions;
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  const dbTotalMinutes = analyticsData?.sessionStats.find((s: any) => s.status === 'completed')?.total_minutes || 0;
  const totalSessionHours = Math.round(dbTotalMinutes / 60);

  // ── Session types (coach_session_types view) ──
  const sessionTypes = useMemo(() => {
    if (!analyticsData?.sessionTypes) return [] as [string, number][];
    return analyticsData.sessionTypes
      .map((t: any) => [t.type, t.type_count] as [string, number])
      .sort((a, b) => b[1] - a[1]);
  }, [analyticsData]);

  // ── Client growth (coach_client_growth view, zero-filled last 6 months) ──
  const monthlyGrowth = useMemo(() => {
    if (!analyticsData?.growth) return [];
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const dbMatch = analyticsData.growth.find((g: any) => {
        const gd = new Date(g.month);
        return gd.getMonth() === d.getMonth() && gd.getFullYear() === d.getFullYear();
      });
      months.push({ label, count: dbMatch ? parseInt(dbMatch.client_count) : 0 });
    }
    return months;
  }, [analyticsData]);

  const growthChartData = useMemo(
    () => monthlyGrowth.map((m) => ({ value: m.count, label: m.label, dataPointText: String(m.count) })),
    [monthlyGrowth],
  );
  const newClientsSixMonths = monthlyGrowth.reduce((s, m) => s + m.count, 0);

  // ── Revenue: same math as earnings.tsx (net of 10% fee) ──
  const netMonthly = totalMonthlyRevenue * (1 - PLATFORM_FEE);
  const avgPerClient = activeClients.length > 0 ? netMonthly / activeClients.length : 0;

  const formatWhole = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const chartWidth = SCREEN_WIDTH - 40 - 32; // screen padding + card padding
  const loading = analyticsData === null;

  return (
    <SafeAreaView style={st.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CoachColors.textSecondary} />}
      >
        {/* ── Header ── */}
        <View style={st.header}>
          <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={st.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={19} color={CoachColors.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.headerTitle}>Analytics</Text>
            <Text style={st.headerSub}>How the business is doing</Text>
          </View>
        </View>

        {loading ? (
          <View style={st.loadingWrap}>
            <ActivityIndicator size="small" color={CoachColors.textSecondary} />
          </View>
        ) : (
          <>
            {/* ── Overview tiles ── */}
            <View style={st.tileGrid}>
              <View style={st.tile}>
                <Text style={st.tileLabel}>Active clients</Text>
                <Text style={st.tileValue}>{activeClients.length}</Text>
              </View>
              <View style={st.tile}>
                <Text style={st.tileLabel}>Monthly recurring</Text>
                <Text style={st.tileValue}>{formatWhole(netMonthly)}</Text>
                <Text style={st.tileSub}>after the 10% fee</Text>
              </View>
              <View style={st.tile}>
                <Text style={st.tileLabel}>Completion rate</Text>
                <Text style={st.tileValue}>{completionRate}%</Text>
                <Text style={st.tileSub}>{completedSessions} of {totalSessions} sessions</Text>
              </View>
              <View style={st.tile}>
                <Text style={st.tileLabel}>Hours coached</Text>
                <Text style={st.tileValue}>{totalSessionHours}</Text>
                <Text style={st.tileSub}>completed sessions only</Text>
              </View>
            </View>

            {/* ── Client growth ── */}
            <Text style={st.sectionTitle}>New clients</Text>
            <Text style={st.sectionDesc}>
              {newClientsSixMonths === 0
                ? 'No new clients in the last six months.'
                : `${newClientsSixMonths} joined in the last six months.`}
            </Text>
            <View style={st.card}>
              <LineChart
                data={growthChartData}
                height={110}
                width={chartWidth}
                color={CoachColors.accent}
                thickness={2.5}
                startFillColor="rgba(198,242,78,0.14)"
                endFillColor="rgba(198,242,78,0)"
                areaChart
                hideRules
                hideYAxisText
                xAxisColor={CoachColors.borderMuted}
                yAxisColor="transparent"
                initialSpacing={12}
                spacing={(chartWidth - 24) / 5}
                dataPointsColor={CoachColors.accent}
                dataPointsRadius={4}
                textColor={CoachColors.textSecondary}
                textFontSize={11}
                textShiftY={-8}
                xAxisLabelTextStyle={{ color: CoachColors.textMuted, fontFamily: CoachFonts.body, fontSize: 11 }}
                maxValue={Math.max(...monthlyGrowth.map((m) => m.count), 2)}
              />
            </View>

            {/* ── Sessions ── */}
            <Text style={st.sectionTitle}>Sessions</Text>
            <View style={st.card}>
              {totalSessions === 0 ? (
                <Text style={st.emptyText}>No sessions on record yet.</Text>
              ) : (
                <>
                  {[
                    { label: 'Completed', count: completedSessions },
                    { label: 'Upcoming', count: upcomingSessions },
                    { label: 'Cancelled', count: cancelledSessions },
                  ].map((item, i) => {
                    const pct = totalSessions > 0 ? (item.count / totalSessions) * 100 : 0;
                    return (
                      <View key={item.label} style={[st.breakRow, i > 0 && { marginTop: 12 }]}>
                        <Text style={st.breakLabel}>{item.label}</Text>
                        <Text style={st.breakCount}>{item.count}</Text>
                        <View style={st.barTrack}>
                          <View style={[st.barFill, { width: `${pct}%` }]} />
                        </View>
                      </View>
                    );
                  })}

                  {sessionTypes.length > 0 && (
                    <View style={st.typeSection}>
                      <Text style={st.typeTitle}>By type</Text>
                      {sessionTypes.map(([type, count]) => (
                        <View key={type} style={st.typeRow}>
                          <Text style={st.typeLabel}>{type}</Text>
                          <Text style={st.typeCount}>{count}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* ── Revenue ── */}
            <Text style={st.sectionTitle}>Revenue</Text>
            <Text style={st.sectionDesc}>Same math as Earnings: holders × pass price, minus the 10% fee.</Text>
            <View style={st.statsRow}>
              <View style={st.statTile}>
                <Text style={st.tileLabel}>Recurring / month</Text>
                <Text style={st.statValue}>{formatWhole(netMonthly)}</Text>
              </View>
              <View style={st.statTile}>
                <Text style={st.tileLabel}>Avg per client</Text>
                <Text style={st.statValue}>{formatWhole(avgPerClient)}</Text>
              </View>
              <View style={st.statTile}>
                <Text style={st.tileLabel}>Referrals</Text>
                <Text style={st.statValue}>{referrals.length}</Text>
              </View>
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: CoachColors.bg },
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scrollContent: { paddingHorizontal: 20 },

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

  loadingWrap: { paddingVertical: 80, alignItems: 'center' },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  tile: {
    width: (SCREEN_WIDTH - 40 - 10) / 2,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 12,
    padding: 13,
  },
  tileLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 12.5,
    color: CoachColors.textMuted,
  },
  tileValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 22.5,
    color: CoachColors.textPrimary,
    marginTop: 4,
  },
  tileSub: {
    fontFamily: CoachFonts.body,
    fontSize: 12,
    color: CoachColors.textFaint,
    marginTop: 2,
  },

  sectionTitle: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginTop: 22,
    marginBottom: 4,
  },
  sectionDesc: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    lineHeight: 20,
    marginBottom: 12,
  },

  card: {
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    overflow: 'hidden',
  },

  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakLabel: {
    fontFamily: CoachFonts.bodyMedium,
    fontSize: 14,
    color: CoachColors.textSecondary,
    width: 82,
  },
  breakCount: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 14.5,
    color: CoachColors.textPrimary,
    width: 32,
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 999,
    backgroundColor: CoachColors.borderMuted,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: CoachColors.accent,
  },

  typeSection: {
    marginTop: 16,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: CoachColors.borderMuted,
  },
  typeTitle: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 12,
    color: CoachColors.textFaint,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  typeLabel: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textSecondary,
  },
  typeCount: {
    fontFamily: CoachFonts.bodyBold,
    fontSize: 14,
    color: CoachColors.textPrimary,
  },

  statsRow: { flexDirection: 'row', gap: 10 },
  statTile: {
    flex: 1,
    backgroundColor: CoachColors.surface,
    borderWidth: 1,
    borderColor: CoachColors.borderMuted,
    borderRadius: 12,
    padding: 13,
  },
  statValue: {
    fontFamily: CoachFonts.headingBold,
    fontSize: 18,
    color: CoachColors.textPrimary,
    marginTop: 4,
  },

  emptyText: {
    fontFamily: CoachFonts.body,
    fontSize: 14,
    color: CoachColors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingVertical: 8,
  },
});
