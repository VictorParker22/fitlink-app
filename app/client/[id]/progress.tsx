import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../../context/AppContext';
import { useTheme } from '../../../context/ThemeContext';
import Card from '../../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius, getAvatarColor } from '../../../constants/theme';

const { width } = Dimensions.get('window');
const LIME = '#C8F135';
const ORANGE = '#FF6B35';

type TimeRange = '7D' | '30D' | '90D';

export default function ProgressDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { getClientById, getClientProgress, getClientSessions } = useApp();

  const [timeRange, setTimeRange] = useState<TimeRange>('30D');

  const client = getClientById(id || '');
  const allLogs = getClientProgress(id || '');
  const allSessions = getClientSessions(id || '');

  if (!client) return null;

  // Filter logs based on time range
  const now = new Date();
  const rangeDays = timeRange === '7D' ? 7 : timeRange === '30D' ? 30 : 90;
  const cutoffDate = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);

  const logs = allLogs.filter(log => new Date(log.date) >= cutoffDate);
  const sessions = allSessions.filter(s => new Date(s.date) >= cutoffDate);

  // A. Header
  // B. Session Consistency
  const completedSessions = sessions.filter(s => s.status === 'completed');
  // Generate 4 weeks (28 days) grid, Sun-Sat
  // We'll show the last 28 days ending today.
  const today = new Date();
  const last28Days = Array.from({ length: 28 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (27 - i));
    return d;
  });

  const getSessionForDate = (date: Date) => {
    return allSessions.find(s => {
      const sDate = new Date(s.date);
      return sDate.getDate() === date.getDate() && sDate.getMonth() === date.getMonth() && sDate.getFullYear() === date.getFullYear() && s.status === 'completed';
    });
  };

  const streak = client.progress?.streak || 0;

  // C. Weight Trend
  const weightLogs = logs.filter(l => l.weight !== null).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const last8Weights = weightLogs.slice(-8);
  
  const latestWeight = last8Weights.length > 0 ? last8Weights[last8Weights.length - 1].weight : null;
  const firstWeight = last8Weights.length > 0 ? last8Weights[0].weight : null;
  const weightDelta = latestWeight && firstWeight ? latestWeight - firstWeight : 0;
  const weightTrend = weightDelta > 0 ? `▲ ${Math.abs(weightDelta).toFixed(1)} lbs` : weightDelta < 0 ? `▼ ${Math.abs(weightDelta).toFixed(1)} lbs` : `0 lbs`;

  // Height of bars for chart
  const maxWeight = Math.max(...last8Weights.map(w => w.weight || 0), 1);
  const minWeight = Math.min(...last8Weights.map(w => w.weight || 0), Math.max(0, maxWeight - 10));
  
  // D. Body Metrics
  const latestLog = weightLogs[weightLogs.length - 1];
  const firstLog = weightLogs[0];
  const bodyFatDelta = latestLog?.body_fat && firstLog?.body_fat ? latestLog.body_fat - firstLog.body_fat : 0;
  
  // E. Session History
  const last5Completed = [...allSessions].filter(s => s.status === 'completed').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

  const getSessionColor = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('1-on-1') || t.includes('1on1') || t.includes('personal')) return LIME;
    if (t.includes('group')) return Colors.purple;
    if (t.includes('virtual')) return Colors.blue;
    return LIME; // default
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            {client.avatar_url ? (
              <View style={styles.avatarMini} />
            ) : (
              <View style={[styles.avatarMini, { backgroundColor: getAvatarColor(client.name) }]}>
                <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
              </View>
            )}
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{client.name}</Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textTertiary }]}>Progress • Last {rangeDays} days</Text>
        </View>
        <TouchableOpacity onPress={() => router.push(`/client/${id}/log-progress` as any)} style={[styles.backBtn, { backgroundColor: colors.bgElevated }]}>
          <Ionicons name="add" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['7D', '30D', '90D'] as TimeRange[]).map(r => (
          <TouchableOpacity 
            key={r} 
            style={[styles.filterPill, timeRange === r ? { backgroundColor: LIME } : { backgroundColor: colors.bgElevated }]}
            onPress={() => setTimeRange(r)}
          >
            <Text style={[styles.filterText, timeRange === r ? { color: '#000' } : { color: colors.textSecondary }]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* B. Session Consistency */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Session Consistency</Text>
            <Text style={[styles.cardTitleRight, { color: LIME }]}>{completedSessions.length} / {sessions.length} sessions</Text>
          </View>
          
          <View style={styles.gridContainer}>
            <View style={styles.dayLabels}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <Text key={i} style={[styles.dayLabel, { color: colors.textTertiary }]}>{day}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {last28Days.map((date, i) => {
                const isFuture = date > today;
                const hasSession = getSessionForDate(date);
                const bg = isFuture ? 'transparent' : hasSession ? LIME : 'rgba(255,255,255,0.06)';
                return <View key={i} style={[styles.gridCell, { backgroundColor: bg }]} />;
              })}
            </View>
          </View>
          <Text style={[styles.streakText, { color: colors.textSecondary }]}>{streak} day active streak 🔥</Text>
        </Card>

        {/* C. Weight Trend */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Weight Trend</Text>
            {weightLogs.length > 1 && (
              <Text style={[styles.trendText, { color: ORANGE }]}>{weightTrend}</Text>
            )}
          </View>
          
          {weightLogs.length > 0 ? (
            <View style={styles.barChartContainer}>
              <Text style={[styles.latestReading, { color: colors.textPrimary }]}>
                {latestWeight} lbs <Text style={[styles.latestDate, { color: colors.textTertiary }]}>on {new Date(latestLog.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              </Text>
              <View style={styles.barsArea}>
                {last8Weights.map((log, i) => {
                  const weight = log.weight || 0;
                  const range = maxWeight - minWeight || 1;
                  const heightPct = Math.max(10, ((weight - minWeight) / range) * 100);
                  return (
                    <View key={i} style={styles.barColumn}>
                      <View style={[styles.bar, { height: `${heightPct}%`, backgroundColor: ORANGE }]} />
                      <Text style={[styles.barLabel, { color: colors.textTertiary }]}>
                        {new Date(log.date).toLocaleDateString('en-US', { day: 'numeric' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No weight logs yet</Text>
              <TouchableOpacity onPress={() => router.push(`/client/${id}/log-progress` as any)} style={[styles.logBtn, { backgroundColor: ORANGE }]}>
                <Text style={styles.logBtnText}>Log Weight</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* D. Body Metrics */}
        <View style={styles.metricsRow}>
          {latestWeight !== null && (
            <Card style={styles.metricCard}>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Weight</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{latestWeight} lbs</Text>
              <Text style={[styles.metricDelta, { color: weightDelta <= 0 ? Colors.green : ORANGE }]}>
                {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)}
              </Text>
            </Card>
          )}
          {latestLog?.body_fat !== null && latestLog?.body_fat !== undefined && (
            <Card style={styles.metricCard}>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Body Fat</Text>
              <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{latestLog.body_fat}%</Text>
              <Text style={[styles.metricDelta, { color: bodyFatDelta <= 0 ? Colors.green : ORANGE }]}>
                {bodyFatDelta > 0 ? '+' : ''}{bodyFatDelta.toFixed(1)}%
              </Text>
            </Card>
          )}
        </View>

        {/* E. Session History List */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Session History</Text>
        <Card style={styles.historyCard} noPadding>
          {last5Completed.length > 0 ? (
            last5Completed.map((session, i) => (
              <View key={session.id} style={[styles.historyRow, i < last5Completed.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <View style={[styles.historyIndicator, { backgroundColor: getSessionColor(session.type) }]} />
                <View style={styles.historyInfo}>
                  <Text style={[styles.historyType, { color: colors.textPrimary }]}>{session.type || 'Session'}</Text>
                  <Text style={[styles.historyDate, { color: colors.textTertiary }]}>
                    {new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {session.duration} min
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textTertiary }]}>No completed sessions</Text>
            </View>
          )}
          <TouchableOpacity style={[styles.viewAllBtn, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
            <Text style={[styles.viewAllText, { color: LIME }]}>View all sessions</Text>
          </TouchableOpacity>
        </Card>

        <View style={{ height: Spacing['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  backBtn: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  avatarMini: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#333' },
  avatarText: { fontSize: 10, fontFamily: FontFamily.bodyBold, color: '#FFF' },
  headerTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md },
  headerSubtitle: { fontFamily: FontFamily.body, fontSize: FontSize.xs, marginTop: 2 },
  
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.md },
  filterPill: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radius.full },
  filterText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm },
  
  scrollContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },

  card: { padding: Spacing.lg, marginBottom: Spacing.lg },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: Spacing.md },
  cardTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.base },
  cardTitleRight: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },

  gridContainer: { alignItems: 'center', marginVertical: Spacing.md },
  dayLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 10, marginBottom: 5 },
  dayLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 10, width: 24, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  gridCell: { width: 24, height: 24, borderRadius: 4 },
  streakText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm, textAlign: 'center', marginTop: Spacing.sm },

  trendText: { fontFamily: FontFamily.bodyBold, fontSize: FontSize.sm },
  barChartContainer: { marginTop: Spacing.sm },
  latestReading: { fontFamily: FontFamily.headingExtraBold, fontSize: 24, marginBottom: Spacing.lg },
  latestDate: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.sm },
  barsArea: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, paddingTop: 20 },
  barColumn: { alignItems: 'center', flex: 1 },
  bar: { width: 12, borderRadius: 6, minHeight: 4 },
  barLabel: { fontFamily: FontFamily.body, fontSize: 10, marginTop: 8 },

  emptyState: { padding: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },
  logBtn: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  logBtnText: { fontFamily: FontFamily.bodySemiBold, color: '#000', fontSize: FontSize.sm },

  metricsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  metricCard: { flex: 1, padding: Spacing.md },
  metricLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.xs, marginBottom: 4 },
  metricValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  metricDelta: { fontFamily: FontFamily.bodyBold, fontSize: FontSize.xs, marginTop: 4 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginBottom: Spacing.sm },
  historyCard: { marginBottom: Spacing.xl },
  historyRow: { flexDirection: 'row', padding: Spacing.md },
  historyIndicator: { width: 4, borderRadius: 2, marginRight: Spacing.md },
  historyInfo: { flex: 1, justifyContent: 'center' },
  historyType: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.base },
  historyDate: { fontFamily: FontFamily.body, fontSize: FontSize.sm, marginTop: 2 },
  viewAllBtn: { padding: Spacing.md, alignItems: 'center' },
  viewAllText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },
});
