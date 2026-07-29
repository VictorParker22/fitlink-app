import { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import { Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const router = useRouter();
  const { clients, sessions, referrals, activeClients, totalMonthlyRevenue, refreshData, fetchAnalytics } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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

  // Session stats from DB view
  const completedSessions = analyticsData?.sessionStats.find((s: any) => s.status === 'completed')?.session_count || 0;
  const cancelledSessions = analyticsData?.sessionStats.find((s: any) => s.status === 'cancelled')?.session_count || 0;
  const upcomingSessions = analyticsData?.sessionStats.find((s: any) => s.status === 'upcoming')?.session_count || 0;
  const totalSessions = completedSessions + cancelledSessions + upcomingSessions;
  const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

  // Session type breakdown from DB view
  const sessionTypes = useMemo(() => {
    if (!analyticsData?.sessionTypes) return [];
    return analyticsData.sessionTypes
      .map((t: any) => [t.type, t.type_count])
      .sort((a: any, b: any) => b[1] - a[1]);
  }, [analyticsData]);

  // Client growth from DB view
  const monthlyGrowth = useMemo(() => {
    if (!analyticsData?.growth) return [];
    // The DB returns actual months with counts. We need to fill in 0s for missing months in the last 6 months.
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
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

  const maxGrowth = Math.max(...monthlyGrowth.map((m) => m.count), 1);

  // Revenue breakdown
  const dbMrr = analyticsData?.revenue?.mrr ? parseInt(analyticsData.revenue.mrr) : 0;
  const avgRevenuePerClient = activeClients.length > 0 ? Math.round(dbMrr / activeClients.length) : 0;
  
  const dbTotalMinutes = analyticsData?.sessionStats.find((s: any) => s.status === 'completed')?.total_minutes || 0;
  const totalSessionHours = Math.round(dbTotalMinutes / 60);

  const typeColors: Record<string, string> = { '1-on-1': colors.accent, 'Group': colors.purple, 'Virtual': colors.blue };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ANALYTICS</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textPrimary} colors={[colors.textPrimary]} />}>
        {/* Overview Cards */}
        <View style={styles.overviewGrid}>
          {[
            { label: 'ACTIVE CLIENTS', value: activeClients.length.toString(), icon: 'people-outline' },
            { label: 'MONTHLY REVENUE', value: `$${totalMonthlyRevenue}`, icon: 'cash-outline' },
            { label: 'COMPLETION RATE', value: `${completionRate}%`, icon: 'checkmark-circle-outline' },
            { label: 'TOTAL HOURS', value: totalSessionHours.toString(), icon: 'time-outline' },
          ].map((item, i) => (
            <View key={i} style={styles.overviewCard}>
              <View style={styles.overviewIcon}>
                <Ionicons name={item.icon as any} size={16} color={colors.textPrimary} />
              </View>
              <Text style={styles.overviewValue}>{item.value}</Text>
              <Text style={styles.overviewLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Client Growth Chart */}
        <Text style={styles.sectionLabel}>CLIENT GROWTH</Text>
        <View style={styles.cardContainer}>
          <View style={styles.chartContainer}>
            {monthlyGrowth.map((m, i) => (
              <View key={i} style={styles.chartBar}>
                <Text style={styles.chartCount}>{m.count}</Text>
                <View style={[styles.bar, { height: Math.max((m.count / maxGrowth) * 80, 4), backgroundColor: i === monthlyGrowth.length - 1 ? colors.textPrimary : colors.textTertiary }]} />
                <Text style={styles.chartLabel}>{m.label.toUpperCase()}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Session Breakdown */}
        <Text style={styles.sectionLabel}>SESSION BREAKDOWN</Text>
        <View style={styles.cardContainer}>
          <View style={styles.breakdownHeader}>
            <Text style={styles.breakdownTotal}>{totalSessions} TOTAL SESSIONS</Text>
          </View>
          {[
            { label: 'COMPLETED', count: completedSessions },
            { label: 'UPCOMING', count: upcomingSessions },
            { label: 'CANCELLED', count: cancelledSessions },
          ].map((item) => {
            const pct = totalSessions > 0 ? (item.count / totalSessions) * 100 : 0;
            return (
              <View key={item.label} style={styles.breakdownRow}>
                <View style={styles.breakdownDot} />
                <Text style={styles.breakdownLabel}>{item.label}</Text>
                <Text style={styles.breakdownCount}>{item.count}</Text>
                <View style={styles.breakdownBarTrack}>
                  <View style={[styles.breakdownBarFill, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          })}

          {sessionTypes.length > 0 && (
            <View style={styles.typeSection}>
              <Text style={styles.typeTitle}>BY TYPE</Text>
              {sessionTypes.map(([type, count]) => (
                <View key={type} style={styles.typeRow}>
                  <View style={styles.typeDot} />
                  <Text style={styles.typeLabel}>{type.toUpperCase()}</Text>
                  <Text style={styles.typeCount}>{count}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Revenue Insights */}
        <Text style={styles.sectionLabel}>REVENUE INSIGHTS</Text>
        <View style={styles.insightsRow}>
          <View style={styles.insightCard}>
            <Text style={styles.insightValue}>${dbMrr}</Text>
            <Text style={styles.insightLabel}>MRR</Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightValue}>${avgRevenuePerClient}</Text>
            <Text style={styles.insightLabel}>AVG/CLIENT</Text>
          </View>
          <View style={styles.insightCard}>
            <Text style={styles.insightValue}>{referrals.length}</Text>
            <Text style={styles.insightLabel}>REFERRALS</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
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
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: 110 },

  cardContainer: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    padding: Spacing.md,
  },

  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.md },
  overviewCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.xs) / 2 - 0.5,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  overviewIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  overviewValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 22, color: colors.textPrimary },
  overviewLabel: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, marginTop: 2 },

  sectionLabel: {
    fontFamily: FontFamily.heading,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 1.5,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },

  chartContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 120, paddingTop: Spacing.sm },
  chartBar: { alignItems: 'center', gap: 4 },
  chartCount: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textSecondary },
  bar: { width: 24, borderRadius: Radius.xs },
  chartLabel: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 0.5 },

  breakdownHeader: { marginBottom: Spacing.xs },
  breakdownTotal: { fontFamily: FontFamily.heading, fontSize: 11, color: colors.textTertiary, letterSpacing: 1 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: 8 },
  breakdownDot: { width: 6, height: 6, borderRadius: 1, backgroundColor: colors.textPrimary },
  breakdownLabel: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: colors.textPrimary, width: 85, letterSpacing: 0.5 },
  breakdownCount: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: colors.textPrimary, width: 30 },
  breakdownBarTrack: { flex: 1, height: 3, borderRadius: Radius.xs, backgroundColor: colors.bgPrimary, borderWidth: 1, borderColor: colors.border },
  breakdownBarFill: { height: '100%' as any, backgroundColor: colors.textPrimary },

  typeSection: { marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  typeTitle: { fontFamily: FontFamily.heading, fontSize: 10, color: colors.textTertiary, letterSpacing: 1, marginBottom: Spacing.xs },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingVertical: 4 },
  typeDot: { width: 5, height: 5, borderRadius: 1, backgroundColor: colors.textPrimary },
  typeLabel: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: colors.textPrimary, flex: 1, letterSpacing: 0.5 },
  typeCount: { fontFamily: FontFamily.bodyBold, fontSize: 11, color: colors.textPrimary },

  insightsRow: { flexDirection: 'row', gap: Spacing.xs },
  insightCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: Radius.xs,
  },
  insightValue: { fontFamily: FontFamily.headingExtraBold, fontSize: 18, color: colors.textPrimary },
  insightLabel: { fontFamily: FontFamily.bodyBold, fontSize: 9, color: colors.textTertiary, letterSpacing: 1, marginTop: 2 },
});
