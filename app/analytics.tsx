import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../context/AppContext';
import Card from '../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../constants/theme';
import type { ThemeColors } from '../constants/theme';
import { useTheme } from '../context/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const router = useRouter();
  const { clients, sessions, referrals, activeClients, totalMonthlyRevenue } = useApp();
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Session stats
  const completedSessions = sessions.filter((s) => s.status === 'completed').length;
  const cancelledSessions = sessions.filter((s) => s.status === 'cancelled').length;
  const upcomingSessions = sessions.filter((s) => s.status === 'upcoming' && new Date(s.date) > new Date()).length;
  const completionRate = sessions.length > 0 ? Math.round((completedSessions / sessions.length) * 100) : 0;

  // Session type breakdown
  const sessionTypes = useMemo(() => {
    const counts: Record<string, number> = {};
    sessions.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [sessions]);

  // Client growth — last 6 months
  const monthlyGrowth = useMemo(() => {
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const count = clients.filter((c) => {
        const cd = new Date(c.created_at);
        return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
      }).length;
      months.push({ label, count });
    }
    return months;
  }, [clients]);

  const maxGrowth = Math.max(...monthlyGrowth.map((m) => m.count), 1);

  // Revenue breakdown
  const avgRevenuePerClient = activeClients.length > 0 ? Math.round(totalMonthlyRevenue / activeClients.length) : 0;
  const totalSessionHours = Math.round(sessions.filter((s) => s.status === 'completed').reduce((sum, s) => sum + s.duration, 0) / 60);

  const typeColors: Record<string, string> = { '1-on-1': Colors.accent, 'Group': Colors.purple, 'Virtual': Colors.blue };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Overview Cards */}
        <View style={styles.overviewGrid}>
          {[
            { label: 'Active Clients', value: activeClients.length.toString(), icon: 'people', color: Colors.blue },
            { label: 'Monthly Revenue', value: `$${totalMonthlyRevenue}`, icon: 'cash', color: Colors.green },
            { label: 'Completion Rate', value: `${completionRate}%`, icon: 'checkmark-circle', color: Colors.accent },
            { label: 'Total Hours', value: totalSessionHours.toString(), icon: 'time', color: Colors.purple },
          ].map((item, i) => (
            <Card key={i} style={styles.overviewCard}>
              <View style={[styles.overviewIcon, { backgroundColor: `${item.color}18` }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.overviewValue}>{item.value}</Text>
              <Text style={styles.overviewLabel}>{item.label}</Text>
            </Card>
          ))}
        </View>

        {/* Client Growth Chart */}
        <Text style={styles.sectionLabel}>CLIENT GROWTH</Text>
        <Card>
          <View style={styles.chartContainer}>
            {monthlyGrowth.map((m, i) => (
              <View key={i} style={styles.chartBar}>
                <Text style={styles.chartCount}>{m.count}</Text>
                <View style={[styles.bar, { height: Math.max((m.count / maxGrowth) * 80, 4), backgroundColor: i === monthlyGrowth.length - 1 ? Colors.accent : Colors.blue }]} />
                <Text style={styles.chartLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Session Breakdown */}
        <Text style={styles.sectionLabel}>SESSION BREAKDOWN</Text>
        <Card>
          <View style={styles.breakdownHeader}>
            <Text style={styles.breakdownTotal}>{sessions.length} total sessions</Text>
          </View>
          {[
            { label: 'Completed', count: completedSessions, color: Colors.green },
            { label: 'Upcoming', count: upcomingSessions, color: Colors.blue },
            { label: 'Cancelled', count: cancelledSessions, color: Colors.red },
          ].map((item) => {
            const pct = sessions.length > 0 ? (item.count / sessions.length) * 100 : 0;
            return (
              <View key={item.label} style={styles.breakdownRow}>
                <View style={[styles.breakdownDot, { backgroundColor: item.color }]} />
                <Text style={styles.breakdownLabel}>{item.label}</Text>
                <Text style={styles.breakdownCount}>{item.count}</Text>
                <View style={styles.breakdownBarTrack}>
                  <View style={[styles.breakdownBarFill, { width: `${pct}%`, backgroundColor: item.color }]} />
                </View>
              </View>
            );
          })}

          {sessionTypes.length > 0 && (
            <View style={styles.typeSection}>
              <Text style={styles.typeTitle}>By Type</Text>
              {sessionTypes.map(([type, count]) => (
                <View key={type} style={styles.typeRow}>
                  <View style={[styles.typeDot, { backgroundColor: typeColors[type] || Colors.textTertiary }]} />
                  <Text style={styles.typeLabel}>{type}</Text>
                  <Text style={styles.typeCount}>{count}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Revenue Insights */}
        <Text style={styles.sectionLabel}>REVENUE INSIGHTS</Text>
        <View style={styles.insightsRow}>
          <Card style={styles.insightCard}>
            <Text style={[styles.insightValue, { color: Colors.green }]}>${totalMonthlyRevenue}</Text>
            <Text style={styles.insightLabel}>MRR</Text>
          </Card>
          <Card style={styles.insightCard}>
            <Text style={[styles.insightValue, { color: Colors.blue }]}>${avgRevenuePerClient}</Text>
            <Text style={styles.insightLabel}>Avg/Client</Text>
          </Card>
          <Card style={styles.insightCard}>
            <Text style={[styles.insightValue, { color: Colors.purple }]}>{referrals.length}</Text>
            <Text style={styles.insightLabel}>Referrals</Text>
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, backgroundColor: colors.bgElevated, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, color: colors.textPrimary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  overviewCard: { width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2 - 1, alignItems: 'center', paddingVertical: Spacing.lg },
  overviewIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  overviewValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.xl, color: colors.textPrimary },
  overviewLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 },

  sectionLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, letterSpacing: 0.8, marginTop: Spacing.xl, marginBottom: Spacing.md },

  chartContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 120, paddingTop: Spacing.md },
  chartBar: { alignItems: 'center', gap: 4 },
  chartCount: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, color: colors.textSecondary },
  bar: { width: 28, borderRadius: 4 },
  chartLabel: { fontFamily: FontFamily.body, fontSize: 10, color: colors.textTertiary },

  breakdownHeader: { marginBottom: Spacing.md },
  breakdownTotal: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textSecondary },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textPrimary, width: 80 },
  breakdownCount: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textPrimary, width: 30 },
  breakdownBarTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.bgElevated },
  breakdownBarFill: { height: 4, borderRadius: 2 },

  typeSection: { marginTop: Spacing.lg, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  typeTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.xs, color: colors.textTertiary, marginBottom: Spacing.sm },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4 },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, color: colors.textPrimary, flex: 1 },
  typeCount: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm, color: colors.textSecondary },

  insightsRow: { flexDirection: 'row', gap: Spacing.sm },
  insightCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.lg },
  insightValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg },
  insightLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, color: colors.textTertiary, marginTop: 2 },
});
