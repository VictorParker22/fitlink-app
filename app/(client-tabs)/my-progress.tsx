import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useClient } from '../../context/ClientContext';
import { useTheme } from '../../context/ThemeContext';
import Card from '../../components/Card';
import { Colors, Spacing, FontFamily, FontSize, Radius } from '../../constants/theme';

export default function ClientProgressScreen() {
  const { progressLogs, refreshData } = useClient();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  const weightLogs = useMemo(() =>
    progressLogs.filter((p: any) => p.weight != null).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [progressLogs]
  );

  const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight : null;
  const firstWeight = weightLogs.length > 0 ? weightLogs[0].weight : null;
  const totalChange = latestWeight && firstWeight ? (latestWeight - firstWeight).toFixed(1) : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>My Progress</Text>

        {progressLogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="trending-up-outline" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No progress logged yet</Text>
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>Your trainer will log your progress check-ins here</Text>
          </View>
        ) : (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>Current Weight</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{latestWeight ? `${latestWeight} lbs` : '—'}</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>Total Change</Text>
                <Text style={[styles.summaryValue, { color: totalChange && parseFloat(totalChange) < 0 ? Colors.green : totalChange && parseFloat(totalChange) > 0 ? Colors.accent : colors.textPrimary }]}>
                  {totalChange ? `${parseFloat(totalChange) > 0 ? '+' : ''}${totalChange} lbs` : '—'}
                </Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={[styles.summaryLabel, { color: colors.textTertiary }]}>Check-ins</Text>
                <Text style={[styles.summaryValue, { color: Colors.blue }]}>{progressLogs.length}</Text>
              </Card>
            </View>

            {/* Weight Trend (simple visual) */}
            {weightLogs.length >= 2 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Weight Trend</Text>
                <Card>
                  <View style={styles.trendContainer}>
                    {weightLogs.slice(-10).map((log: any, i: number, arr: any[]) => {
                      const min = Math.min(...arr.map((l: any) => l.weight));
                      const max = Math.max(...arr.map((l: any) => l.weight));
                      const range = max - min || 1;
                      const height = ((log.weight - min) / range) * 80 + 20;
                      const dt = new Date(log.date);

                      return (
                        <View key={i} style={styles.trendCol}>
                          <Text style={[styles.trendWeight, { color: colors.textSecondary }]}>{log.weight}</Text>
                          <View style={[styles.trendBar, { height, backgroundColor: colors.accent }]} />
                          <Text style={[styles.trendDate, { color: colors.textTertiary }]}>{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                        </View>
                      );
                    })}
                  </View>
                </Card>
              </>
            )}

            {/* History */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>History</Text>
            {progressLogs.map((log: any, i: number) => {
              const dt = new Date(log.date);
              const measurements = log.measurements || {};
              const hasMeasurements = Object.keys(measurements).length > 0;

              return (
                <Card key={log.id || i} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={[styles.historyIcon, { backgroundColor: `${Colors.purple}15` }]}>
                      <Ionicons name="calendar" size={16} color={Colors.purple} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyDate, { color: colors.textPrimary }]}>
                        {dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.historyMetrics}>
                    {log.weight != null && (
                      <View style={[styles.metricPill, { backgroundColor: `${Colors.blue}12` }]}>
                        <Text style={[styles.metricValue, { color: Colors.blue }]}>{log.weight} lbs</Text>
                        <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Weight</Text>
                      </View>
                    )}
                    {log.body_fat != null && (
                      <View style={[styles.metricPill, { backgroundColor: `${Colors.accent}12` }]}>
                        <Text style={[styles.metricValue, { color: Colors.accent }]}>{log.body_fat}%</Text>
                        <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Body Fat</Text>
                      </View>
                    )}
                  </View>

                  {hasMeasurements && (
                    <View style={[styles.measurementsRow, { borderTopColor: colors.border }]}>
                      {Object.entries(measurements).map(([key, val]) => (
                        <View key={key} style={styles.measurementItem}>
                          <Text style={[styles.measurementLabel, { color: colors.textTertiary }]}>{key}</Text>
                          <Text style={[styles.measurementVal, { color: colors.textPrimary }]}>{val as string}"</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {log.notes && (
                    <Text style={[styles.historyNotes, { color: colors.textSecondary, borderTopColor: colors.border }]}>
                      {log.notes}
                    </Text>
                  )}
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing['3xl'] },
  title: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize['2xl'], letterSpacing: -0.5, marginBottom: Spacing.lg },

  summaryRow: { flexDirection: 'row', gap: Spacing.sm },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: Spacing.md },
  summaryLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs },
  summaryValue: { fontFamily: FontFamily.headingExtraBold, fontSize: FontSize.lg, marginTop: 4 },

  sectionTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.md, marginTop: Spacing['2xl'], marginBottom: Spacing.md },

  trendContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 140, paddingTop: Spacing.md },
  trendCol: { alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  trendWeight: { fontFamily: FontFamily.bodySemiBold, fontSize: 9, marginBottom: 4 },
  trendBar: { width: 16, borderRadius: 8, minHeight: 20 },
  trendDate: { fontFamily: FontFamily.body, fontSize: 8, marginTop: 4 },

  historyCard: { marginBottom: Spacing.sm },
  historyHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  historyIcon: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  historyDate: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },

  historyMetrics: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  metricPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.sm },
  metricValue: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.sm },
  metricLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs },

  measurementsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1 },
  measurementItem: { minWidth: 60 },
  measurementLabel: { fontFamily: FontFamily.body, fontSize: FontSize.xs, textTransform: 'capitalize' },
  measurementVal: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.sm },

  historyNotes: { fontFamily: FontFamily.body, fontSize: FontSize.sm, fontStyle: 'italic', marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, lineHeight: 18 },

  emptyState: { alignItems: 'center', paddingVertical: Spacing['4xl'], gap: Spacing.md },
  emptyTitle: { fontFamily: FontFamily.headingSemiBold, fontSize: FontSize.lg },
  emptyText: { fontFamily: FontFamily.body, fontSize: FontSize.sm },
});
