import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../../context/AppContext';
import Card from '../../../components/Card';
import { CoachColors, CoachFonts } from '../../../constants/coachDesign';
import { getAvatarColor } from '../../../constants/theme';

const LIME = CoachColors.accent;

type TimeRange = '7D' | '30D' | '90D';

export default function ProgressDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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


  return (
    <SafeAreaView style={[styles.container, { backgroundColor: CoachColors.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity hitSlop={4} onPress={() => router.back()} style={[styles.backBtn, { backgroundColor: CoachColors.surface }]} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={25} color={CoachColors.textPrimary} />
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
            <Text style={[styles.headerTitle, { color: CoachColors.textPrimary }]}>{client.name}</Text>
          </View>
          <Text style={[styles.headerSubtitle, { color: CoachColors.textMuted }]}>Progress • Last {rangeDays} days</Text>
        </View>
        <TouchableOpacity hitSlop={4} onPress={() => router.push(`/client/${id}/log-progress` as any)} style={[styles.backBtn, { backgroundColor: CoachColors.surface }]} accessibilityRole="button" accessibilityLabel="Log progress">
          <Ionicons name="add" size={25} color={CoachColors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['7D', '30D', '90D'] as TimeRange[]).map(r => (
          <TouchableOpacity hitSlop={{ top: 9, bottom: 9 }} 
            key={r} 
            style={[styles.filterPill, timeRange === r ? { backgroundColor: LIME } : { backgroundColor: CoachColors.surface }]}
            onPress={() => setTimeRange(r)}
          >
            <Text style={[styles.filterText, timeRange === r ? { color: CoachColors.onAccent } : { color: CoachColors.textSecondary }]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        
        {/* B. Session Consistency */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: CoachColors.textPrimary }]}>Session consistency</Text>
            <Text style={[styles.cardTitleRight, { color: LIME }]}>{completedSessions.length} / {sessions.length} sessions</Text>
          </View>
          
          <View style={styles.gridContainer}>
            <View style={styles.dayLabels}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <Text key={i} style={[styles.dayLabel, { color: CoachColors.textMuted }]}>{day}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {last28Days.map((date, i) => {
                const isFuture = date > today;
                const hasSession = getSessionForDate(date);
                const bg = isFuture ? 'transparent' : hasSession ? LIME : CoachColors.borderMuted;
                return <View key={i} style={[styles.gridCell, { backgroundColor: bg }]} />;
              })}
            </View>
          </View>
          <Text style={[styles.streakText, { color: CoachColors.textSecondary }]}>{streak} day active streak</Text>
        </Card>

        {/* C. Weight Trend */}
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: CoachColors.textPrimary }]}>Weight trend</Text>
            {weightLogs.length > 1 && (
              <Text style={[styles.trendText, { color: LIME }]}>{weightTrend}</Text>
            )}
          </View>
          
          {weightLogs.length > 0 ? (
            <View style={styles.barChartContainer}>
              <Text style={[styles.latestReading, { color: CoachColors.textPrimary }]}>
                {latestWeight} lbs <Text style={[styles.latestDate, { color: CoachColors.textMuted }]}>on {new Date(latestLog.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
              </Text>
              <View style={styles.barsArea}>
                {last8Weights.map((log, i) => {
                  const weight = log.weight || 0;
                  const range = maxWeight - minWeight || 1;
                  const heightPct = Math.max(10, ((weight - minWeight) / range) * 100);
                  return (
                    <View key={i} style={styles.barColumn}>
                      <View style={[styles.bar, { height: `${heightPct}%`, backgroundColor: LIME }]} />
                      <Text style={[styles.barLabel, { color: CoachColors.textMuted }]}>
                        {new Date(log.date).toLocaleDateString('en-US', { day: 'numeric' })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: CoachColors.textMuted }]}>No weight logs yet</Text>
              <TouchableOpacity hitSlop={{ top: 8, bottom: 8 }} onPress={() => router.push(`/client/${id}/log-progress` as any)} style={[styles.logBtn, { backgroundColor: LIME }]}>
                <Text style={styles.logBtnText}>Log weight</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* D. Body Metrics */}
        <View style={styles.metricsRow}>
          {latestWeight !== null && (
            <Card style={styles.metricCard}>
              <Text style={[styles.metricLabel, { color: CoachColors.textMuted }]}>Weight</Text>
              <Text style={[styles.metricValue, { color: CoachColors.textPrimary }]}>{latestWeight} lbs</Text>
              <Text style={[styles.metricDelta, { color: weightDelta <= 0 ? LIME : CoachColors.textSecondary }]}>
                {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)}
              </Text>
            </Card>
          )}
          {latestLog?.body_fat !== null && latestLog?.body_fat !== undefined && (
            <Card style={styles.metricCard}>
              <Text style={[styles.metricLabel, { color: CoachColors.textMuted }]}>Body fat</Text>
              <Text style={[styles.metricValue, { color: CoachColors.textPrimary }]}>{latestLog.body_fat}%</Text>
              <Text style={[styles.metricDelta, { color: bodyFatDelta <= 0 ? LIME : CoachColors.textSecondary }]}>
                {bodyFatDelta > 0 ? '+' : ''}{bodyFatDelta.toFixed(1)}%
              </Text>
            </Card>
          )}
        </View>

        {/* E. Session History List */}
        <Text style={[styles.sectionTitle, { color: CoachColors.textPrimary }]}>Session history</Text>
        <Card style={styles.historyCard} noPadding>
          {last5Completed.length > 0 ? (
            last5Completed.map((session, i) => (
              <View key={session.id} style={[styles.historyRow, i < last5Completed.length - 1 && { borderBottomWidth: 1, borderBottomColor: CoachColors.borderMuted }]}>
                <View style={[styles.historyIndicator, { backgroundColor: LIME }]} />
                <View style={styles.historyInfo}>
                  <Text style={[styles.historyType, { color: CoachColors.textPrimary }]}>{session.type || 'Session'}</Text>
                  <Text style={[styles.historyDate, { color: CoachColors.textMuted }]}>
                    {new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} • {session.duration} min
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: CoachColors.textMuted }]}>No completed sessions</Text>
            </View>
          )}
          <TouchableOpacity hitSlop={{ top: 4, bottom: 4 }} style={[styles.viewAllBtn, { borderTopColor: CoachColors.borderMuted, borderTopWidth: 1 }]}>
            <Text style={[styles.viewAllText, { color: LIME }]}>View all sessions</Text>
          </TouchableOpacity>
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatarMini: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: CoachColors.borderMuted },
  avatarText: { fontSize: 11, fontFamily: CoachFonts.bodyBold, color: CoachColors.textPrimary },
  headerTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20 },
  headerSubtitle: { fontFamily: CoachFonts.body, fontSize: 14.5, marginTop: 2 },
  
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, paddingBottom: 10 },
  filterPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  filterText: { fontFamily: CoachFonts.bodyMedium, fontSize: 17 },
  
  // paddingBottom is applied inline from the real bottom inset (pushed route: no tab bar).
  scrollContent: { paddingHorizontal: 16, paddingTop: 6 },

  card: { padding: 16, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
  cardTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 19 },
  cardTitleRight: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17 },

  gridContainer: { alignItems: 'center', marginVertical: 10 },
  dayLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingHorizontal: 10, marginBottom: 5 },
  dayLabel: { fontFamily: CoachFonts.bodySemiBold, fontSize: 11, width: 24, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  gridCell: { width: 24, height: 24, borderRadius: 4 },
  streakText: { fontFamily: CoachFonts.bodyMedium, fontSize: 17, textAlign: 'center', marginTop: 6 },

  trendText: { fontFamily: CoachFonts.bodyBold, fontSize: 17 },
  barChartContainer: { marginTop: 6 },
  latestReading: { fontFamily: CoachFonts.headingBold, fontSize: 27, marginBottom: 16 },
  latestDate: { fontFamily: CoachFonts.bodyMedium, fontSize: 17 },
  barsArea: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, paddingTop: 20 },
  barColumn: { alignItems: 'center', flex: 1 },
  bar: { width: 12, borderRadius: 6, minHeight: 4 },
  barLabel: { fontFamily: CoachFonts.body, fontSize: 11, marginTop: 8 },

  emptyState: { padding: 20, alignItems: 'center', gap: 10 },
  emptyText: { fontFamily: CoachFonts.body, fontSize: 17 },
  logBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 },
  logBtnText: { fontFamily: CoachFonts.bodySemiBold, color: CoachColors.onAccent, fontSize: 17 },

  metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  metricCard: { flex: 1, padding: 10 },
  metricLabel: { fontFamily: CoachFonts.bodyMedium, fontSize: 14.5, marginBottom: 4 },
  metricValue: { fontFamily: CoachFonts.headingSemiBold, fontSize: 24.5 },
  metricDelta: { fontFamily: CoachFonts.bodyBold, fontSize: 14.5, marginTop: 4 },

  sectionTitle: { fontFamily: CoachFonts.headingSemiBold, fontSize: 20, marginBottom: 6 },
  historyCard: { marginBottom: 20 },
  historyRow: { flexDirection: 'row', padding: 10 },
  historyIndicator: { width: 4, borderRadius: 2, marginRight: 10 },
  historyInfo: { flex: 1, justifyContent: 'center' },
  historyType: { fontFamily: CoachFonts.bodySemiBold, fontSize: 19 },
  historyDate: { fontFamily: CoachFonts.body, fontSize: 17, marginTop: 2 },
  viewAllBtn: { padding: 10, alignItems: 'center' },
  viewAllText: { fontFamily: CoachFonts.bodySemiBold, fontSize: 17 },
});
